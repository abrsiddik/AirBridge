// ═══════════════════════════════════════════════════════════════
//  AirBridge — WebRTC + WebSocket client
// ═══════════════════════════════════════════════════════════════

const AB = (() => {

  // ── Config ──────────────────────────────────────────────────
  const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Free TURN from open-relay (replace with your own for production)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  // ── State ────────────────────────────────────────────────────
  let ws = null;
  let pc = null;           // RTCPeerConnection
  let dc = null;           // RTCDataChannel
  let role = null;         // 'sender' | 'receiver'
  let roomCode = null;

  // Transfer state
  let sendQueue = [];      // files waiting to send
  let sendIndex = 0;
  let currentFile = null;
  let currentOffset = 0;
  let receiveBuffer = [];
  let receiveMeta = null;
  let receiveBytes = 0;
  let transferStartTime = 0;
  let onProgressCb = null;
  let onFileDoneCb = null;
  let onConnectedCb = null;
  let onReceiverJoinedCb = null;
  let onErrorCb = null;
  let onDisconnectCb = null;

  // ── WebSocket ────────────────────────────────────────────────
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;
    ws = new WebSocket(url);

    ws.onopen = () => console.log('[WS] connected');
    ws.onclose = () => {
      console.log('[WS] disconnected');
      if (onDisconnectCb) onDisconnectCb('Connection to server lost.');
    };
    ws.onerror = () => {
      if (onErrorCb) onErrorCb('Cannot reach AirBridge server. Check your internet connection.');
    };
    ws.onmessage = ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      handleSignal(msg);
    };
  }

  function wsSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // ── Signaling handler ────────────────────────────────────────
  async function handleSignal(msg) {
    switch (msg.type) {

      case 'room-created':
        roomCode = msg.code;
        break;

      case 'receiver-joined':
        if (onReceiverJoinedCb) onReceiverJoinedCb();
        await createOffer();
        break;

      case 'room-joined':
        roomCode = msg.code;
        break;

      case 'offer':
        await handleOffer(msg.sdp);
        break;

      case 'answer':
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        break;

      case 'ice-candidate':
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(msg.candidate); } catch {}
        }
        break;

      case 'transfer-meta':
        receiveMeta = msg.meta;
        receiveBuffer = [];
        receiveBytes = 0;
        transferStartTime = Date.now();
        break;

      case 'transfer-done':
        // Sender told us the full transfer finished
        break;

      case 'peer-disconnected':
        cleanup();
        if (onDisconnectCb) onDisconnectCb('The other device disconnected.');
        break;

      case 'error':
        if (onErrorCb) onErrorCb(msg.message);
        break;
    }
  }

  // ── RTCPeerConnection ────────────────────────────────────────
  function createPC() {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) wsSend({ type: 'ice-candidate', candidate });
    };

    pc.onconnectionstatechange = () => {
      console.log('[RTC] state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (onConnectedCb) onConnectedCb();
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        if (onDisconnectCb) onDisconnectCb('WebRTC connection lost.');
      }
    };
  }

  // ── Sender: create offer ─────────────────────────────────────
  async function createOffer() {
    createPC();

    dc = pc.createDataChannel('airbridge', { ordered: true });
    setupDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsSend({ type: 'offer', sdp: offer.sdp });
  }

  // ── Receiver: handle offer ───────────────────────────────────
  async function handleOffer(sdp) {
    createPC();

    pc.ondatachannel = ({ channel }) => {
      dc = channel;
      setupDataChannel(dc);
    };

    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsSend({ type: 'answer', sdp: answer.sdp });
  }

  // ── DataChannel setup ────────────────────────────────────────
  function setupDataChannel(channel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('[DC] open');
      if (onConnectedCb) onConnectedCb();
    };

    channel.onclose = () => console.log('[DC] closed');

    channel.onmessage = ({ data }) => {
      if (role === 'receiver') handleChunk(data);
    };

    channel.onerror = (e) => {
      if (onErrorCb) onErrorCb('Data channel error: ' + e.message);
    };
  }

  // ── Send files ───────────────────────────────────────────────
  function sendFiles(files) {
    sendQueue = Array.from(files);
    sendIndex = 0;
    sendNextFile();
  }

  function sendNextFile() {
    if (sendIndex >= sendQueue.length) {
      wsSend({ type: 'transfer-done' });
      if (onFileDoneCb) onFileDoneCb(null); // null = all done
      return;
    }
    currentFile = sendQueue[sendIndex];
    currentOffset = 0;
    transferStartTime = Date.now();

    // Send metadata via signaling so receiver knows what's coming
    wsSend({
      type: 'transfer-meta',
      meta: {
        name: currentFile.name,
        size: currentFile.size,
        type: currentFile.type,
        index: sendIndex,
        total: sendQueue.length
      }
    });

    // Small delay so metadata reaches receiver first
    setTimeout(sendChunk, 100);
  }

  function sendChunk() {
    if (!dc || dc.readyState !== 'open') return;

    // Back-pressure: wait if buffer is too full
    if (dc.bufferedAmount > 16 * 1024 * 1024) {
      setTimeout(sendChunk, 50);
      return;
    }

    const slice = currentFile.slice(currentOffset, currentOffset + CHUNK_SIZE);
    const reader = new FileReader();
    reader.onload = (e) => {
      dc.send(e.target.result);
      currentOffset += e.target.result.byteLength;

      const pct = Math.min(100, (currentOffset / currentFile.size) * 100);
      const elapsed = (Date.now() - transferStartTime) / 1000 || 0.001;
      const speed = (currentOffset / elapsed) / (1024 * 1024); // MB/s

      if (onProgressCb) onProgressCb({
        fileIndex: sendIndex,
        fileName: currentFile.name,
        fileSize: currentFile.size,
        sent: currentOffset,
        pct,
        speed,
        totalFiles: sendQueue.length
      });

      if (currentOffset < currentFile.size) {
        sendChunk();
      } else {
        sendIndex++;
        sendNextFile();
      }
    };
    reader.readAsArrayBuffer(slice);
  }

  // ── Receive chunks ───────────────────────────────────────────
  function handleChunk(data) {
    receiveBuffer.push(data);
    receiveBytes += data.byteLength;

    if (!receiveMeta) return;

    const pct = Math.min(100, (receiveBytes / receiveMeta.size) * 100);
    const elapsed = (Date.now() - transferStartTime) / 1000 || 0.001;
    const speed = (receiveBytes / elapsed) / (1024 * 1024);

    if (onProgressCb) onProgressCb({
      fileIndex: receiveMeta.index,
      fileName: receiveMeta.name,
      fileSize: receiveMeta.size,
      sent: receiveBytes,
      pct,
      speed,
      totalFiles: receiveMeta.total
    });

    if (receiveBytes >= receiveMeta.size) {
      // Assemble and trigger download
      const blob = new Blob(receiveBuffer, { type: receiveMeta.type || 'application/octet-stream' });
      if (onFileDoneCb) onFileDoneCb({ blob, name: receiveMeta.name, size: receiveMeta.size });
      receiveBuffer = [];
      receiveBytes = 0;
      receiveMeta = null;
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────
  function cleanup() {
    if (dc) { try { dc.close(); } catch {} dc = null; }
    if (pc) { try { pc.close(); } catch {} pc = null; }
  }

  // ── Public API ───────────────────────────────────────────────
  return {
    init(callbacks) {
      onProgressCb       = callbacks.onProgress;
      onFileDoneCb       = callbacks.onFileDone;
      onConnectedCb      = callbacks.onConnected;
      onReceiverJoinedCb = callbacks.onReceiverJoined;
      onErrorCb          = callbacks.onError;
      onDisconnectCb     = callbacks.onDisconnect;
      connectWS();
    },

    createRoom() {
      role = 'sender';
      wsSend({ type: 'create-room' });
      return new Promise(resolve => {
        const orig = ws.onmessage;
        ws.onmessage = ({ data }) => {
          const msg = JSON.parse(data);
          if (msg.type === 'room-created') {
            roomCode = msg.code;
            resolve(msg.code);
          }
          handleSignal(msg);
        };
      });
    },

    joinRoom(code) {
      role = 'receiver';
      const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      wsSend({ type: 'join-room', code: clean });
    },

    sendFiles(files) {
      sendFiles(files);
    },

    getRole() { return role; },
    getRoomCode() { return roomCode; },
    cleanup
  };
})();
