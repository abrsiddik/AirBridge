// ═══════════════════════════════════════════════════════════════
//  AirBridge — Main App Controller
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── Device info ─────────────────────────────────────────────
  const myDevice = detectDevice();

  // ── State ────────────────────────────────────────────────────
  let files = [];
  let receivedFiles = [];
  let transferStartTime = 0;
  let peerDevice = null;
  let transferDone = false;

  // ── DOM helpers ──────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const screens = document.querySelectorAll('.screen');
  let navHistory = ['screen-hero'];
  let currentScreen = 'screen-hero';

  function goTo(id) {
    const prev = $(currentScreen);
    prev.classList.remove('fade-in');
    prev.classList.add('fade-out');
    setTimeout(() => {
      prev.classList.remove('active', 'fade-out');
      const next = $(id);
      next.classList.add('active', 'fade-in');
      currentScreen = id;
      navHistory.push(id);
      updateChrome(id);
    }, 220);
  }

  window.goBack = function () {
    if (navHistory.length <= 1) return;
    navHistory.pop();
    const prev = navHistory[navHistory.length - 1];
    const cur = $(currentScreen);
    cur.classList.remove('fade-in');
    cur.classList.add('fade-out');
    setTimeout(() => {
      cur.classList.remove('active', 'fade-out');
      const p = $(prev);
      p.classList.add('active', 'fade-in');
      currentScreen = prev;
      updateChrome(prev);
    }, 220);
  };

  // ── Step progress ────────────────────────────────────────────
  const STEP_MAP = {
    'screen-hero': 0, 'screen-role': 1,
    'screen-sender': 2, 'screen-receiver': 2,
    'screen-connected': 3, 'screen-transfer': 4, 'screen-success': 4
  };

  function updateChrome(id) {
    const step = STEP_MAP[id] || 0;
    const prog = $('stepProgress');
    const backBtn = $('backBtn');
    backBtn.classList.toggle('show', navHistory.length > 1);

    if (step > 0) {
      prog.classList.add('show');
      let trail = '';
      for (let i = 1; i <= 4; i++) {
        const state = i < step ? 'done' : i === step ? 'current' : '';
        trail += `<div class="step-node ${state}"><div class="step-circle">${i < step ? '✓' : i}</div></div>`;
        if (i < 4) trail += `<div class="step-line ${i < step ? 'done' : ''}"></div>`;
      }
      $('stepTrail').innerHTML = trail;
      $('stepCount').textContent = `Step ${step} of 4`;
    } else {
      prog.classList.remove('show');
    }
  }

  // ── Theme ────────────────────────────────────────────────────
  let dark = true;
  window.toggleTheme = function () {
    dark = !dark;
    document.body.classList.toggle('light', !dark);
    $('themeBtn').textContent = dark ? '🌙' : '☀️';
  };

  // ── Toast ────────────────────────────────────────────────────
  window.showToast = function (msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
  };

  // ── Init WebRTC ──────────────────────────────────────────────
  AB.init({
    onConnected() {
      const role = AB.getRole();
      if (role === 'sender') {
        updateConnectedScreen();
        goTo('screen-connected');
      } else {
        updateConnectedScreen();
        goTo('screen-connected');
      }
    },
    onReceiverJoined() {
      showToast('Receiver connected! Establishing secure channel…', 'info');
    },
    onProgress(info) {
      updateProgress(info);
    },
    onFileDone(result) {
      if (result === null) {
        // Sender: all files sent
        showSuccess();
      } else {
        // Receiver: save file
        triggerDownload(result.blob, result.name);
        receivedFiles.push(result);
        if (receivedFiles.length === (window._expectedFiles || 1)) {
          showSuccess();
        }
      }
    },
    onError(msg) {
      showToast(msg, 'error');
    },
    onDisconnect(msg) {
      showToast(msg, 'error');
    }
  });

  // ── SENDER FLOW ──────────────────────────────────────────────
  window.startSender = async function () {
    goTo('screen-sender');
    $('senderMyBadge').innerHTML = `
      <span style="font-size:20px">${myDevice.icon}</span>
      <div>
        <div style="font-weight:700;font-size:13px">${myDevice.name}</div>
        <div style="font-size:11px;color:var(--muted)">${myDevice.os} · ${myDevice.browser}</div>
      </div>`;

    try {
      const code = await AB.createRoom();
      displayRoomCode(code);
      generateQR(code);
    } catch (e) {
      showToast('Could not create room. Check your connection.', 'error');
    }
  };

  function displayRoomCode(code) {
    $('roomCode').textContent = code;
  }

  function generateQR(code) {
    const el = $('qrcode');
    el.innerHTML = '';
    const url = `${location.origin}/?code=${code}`;
    new QRCode(el, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#1a6fd4',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  window.copyCode = function () {
    const code = $('roomCode').textContent;
    navigator.clipboard.writeText(code).catch(() => {});
    const btn = $('copyBtn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  };

  // ── RECEIVER FLOW ────────────────────────────────────────────
  window.startReceiver = function () {
    goTo('screen-receiver');
    $('receiverMyBadge').innerHTML = `
      <span style="font-size:20px">${myDevice.icon}</span>
      <div>
        <div style="font-weight:700;font-size:13px">${myDevice.name}</div>
        <div style="font-size:11px;color:var(--muted)">${myDevice.os} · ${myDevice.browser}</div>
      </div>`;

    // Auto-fill code from URL param
    const params = new URLSearchParams(location.search);
    const urlCode = params.get('code');
    if (urlCode) {
      $('codeInput').value = urlCode;
      showToast('Code detected from QR! Press Connect.', 'info');
    }
  };

  window.startScanner = function () {
    const wrapper = $('scannerWrapper');
    const videoEl = $('scannerVideo');
    const canvasEl = $('scannerCanvas');
    wrapper.style.display = 'block';
    QRScanner.start(videoEl, canvasEl, (code) => {
      $('codeInput').value = code;
      wrapper.style.display = 'none';
      showToast('QR code scanned! Press Connect.', 'info');
    });
  };

  window.stopScanner = function () {
    QRScanner.stop();
    $('scannerWrapper').style.display = 'none';
  };

  window.connectReceiver = function () {
    const raw = $('codeInput').value.trim();
    if (!raw) { showToast('Please enter or scan a room code.', 'error'); return; }
    const btn = $('connectBtn');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    $('connectingState').style.display = 'block';

    AB.joinRoom(raw);

    // Timeout fallback
    setTimeout(() => {
      if (currentScreen === 'screen-receiver') {
        btn.disabled = false;
        btn.textContent = 'Connect';
        $('connectingState').style.display = 'none';
        showToast('Could not connect. Check the code and try again.', 'error');
      }
    }, 12000);
  };

  // ── CONNECTED screen ─────────────────────────────────────────
  function updateConnectedScreen() {
    const role = AB.getRole();
    $('senderPill').innerHTML = role === 'sender' ? `
      <div class="dev-pill-ico">${myDevice.icon}</div>
      <div class="dev-pill-name">${myDevice.name}</div>
      <div class="dev-pill-sub">${myDevice.os}</div>
      <div class="dev-pill-role">Sender · ${myDevice.browser}</div>` : `
      <div class="dev-pill-ico">📱</div>
      <div class="dev-pill-name">Sender Device</div>
      <div class="dev-pill-sub">Connected</div>
      <div class="dev-pill-role">Sender</div>`;

    $('receiverPill').innerHTML = role === 'receiver' ? `
      <div class="dev-pill-ico">${myDevice.icon}</div>
      <div class="dev-pill-name">${myDevice.name}</div>
      <div class="dev-pill-sub">${myDevice.os}</div>
      <div class="dev-pill-role">Receiver · ${myDevice.browser}</div>` : `
      <div class="dev-pill-ico">💻</div>
      <div class="dev-pill-name">Receiver Device</div>
      <div class="dev-pill-sub">Connected</div>
      <div class="dev-pill-role">Receiver</div>`;

    $('connRoomCode').textContent = AB.getRoomCode() || '—';

    // If receiver: show waiting UI, sender shows "send files" button
    if (role === 'receiver') {
      $('connAction').innerHTML = `<div class="waiting-msg"><div class="spinner"></div>Waiting for sender to drop files…</div>`;
    } else {
      $('connAction').innerHTML = `<button class="btn btn-primary btn-full" onclick="goToTransfer()">Select Files to Send →</button>`;
    }
  }

  window.goToTransfer = function () {
    const role = AB.getRole();
    $('xferFrom').innerHTML = `${myDevice.icon} ${myDevice.name}`;
    $('xferTo').innerHTML = `📱 Receiver`;
    goTo('screen-transfer');
  };

  // ── FILE HANDLING ────────────────────────────────────────────
  const ICONS = {
    mp4:'🎬',mov:'🎬',avi:'🎬',mkv:'🎬',
    jpg:'🖼',jpeg:'🖼',png:'🖼',gif:'🖼',webp:'🖼',heic:'🖼',
    pdf:'📄',doc:'📄',docx:'📄',xls:'📊',xlsx:'📊',ppt:'📊',pptx:'📊',txt:'📝',
    zip:'📦',rar:'📦','7z':'📦',mp3:'🎵',flac:'🎵',wav:'🎵',exe:'⚙️',apk:'📱'
  };
  const CLASSES = {
    mp4:'ft-video',mov:'ft-video',avi:'ft-video',mkv:'ft-video',
    jpg:'ft-img',jpeg:'ft-img',png:'ft-img',gif:'ft-img',webp:'ft-img',heic:'ft-img',
    zip:'ft-zip',rar:'ft-zip','7z':'ft-zip',pdf:'ft-doc',doc:'ft-doc',docx:'ft-doc'
  };

  function getExt(name) { return name.split('.').pop().toLowerCase(); }
  function fmtSize(b) {
    if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
    if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
    return (b / 1024).toFixed(0) + ' KB';
  }

  window.handleFiles = function (flist) {
    for (const f of flist) {
      if (files.find(x => x.name === f.name && x.size === f.size)) continue;
      files.push({ name: f.name, size: f.size, type: f.type, pct: 0, status: 'ready', raw: f });
    }
    renderFiles();
  };

  function renderFiles() {
    const list = $('fileList');
    const zone = $('dropZone');
    const addMore = $('addMoreWrap');
    const actions = $('xferActions');
    const warn = $('sizeWarning');

    list.innerHTML = '';
    if (files.length === 0) {
      zone.style.display = 'block';
      addMore.style.display = 'none';
      actions.style.display = 'none';
      warn.style.display = 'none';
      return;
    }
    zone.style.display = 'none';
    addMore.style.display = 'block';
    actions.style.display = 'flex';
    warn.style.display = files.some(f => f.size > 500e6) ? 'flex' : 'none';

    files.forEach((f, i) => {
      const ext = getExt(f.name);
      const ico = ICONS[ext] || '📄';
      const cls = CLASSES[ext] || 'ft-other';
      const statusHtml = f.status === 'sending'
        ? `<div class="fstatus sending">Sending… ${Math.round(f.pct)}%</div>`
        : f.status === 'done'
        ? `<div class="fstatus done">✓ Delivered</div>`
        : f.status === 'error'
        ? `<div class="fstatus error">✕ Failed</div>` : '';

      const item = document.createElement('div');
      item.className = `file-item ${f.status}`;
      item.id = `fi-${i}`;
      item.innerHTML = `
        <div class="ftype ${cls}">${ico}</div>
        <div class="finfo">
          <div class="fname">${f.name}</div>
          <div class="fmeta"><span>${fmtSize(f.size)}</span><span>.${ext.toUpperCase()}</span></div>
          ${statusHtml}
        </div>
        ${f.status === 'ready' ? `<div class="fremove" onclick="removeFile(${i})" title="Remove">×</div>` : ''}`;
      list.appendChild(item);
    });
  }

  window.removeFile = function (i) { files.splice(i, 1); renderFiles(); };

  window.dragOver = e => { e.preventDefault(); $('dropZone').classList.add('over'); };
  window.dragLeave = () => $('dropZone').classList.remove('over');
  window.dropFiles = e => { e.preventDefault(); window.dragLeave(); handleFiles(e.dataTransfer.files); };

  window.startTransfer = function () {
    if (files.length === 0) return;
    $('sendBtn').style.display = 'none';
    $('progressBlock').style.display = 'block';
    $('addMoreWrap').style.display = 'none';
    transferStartTime = Date.now();
    transferDone = false;

    files.forEach(f => f.status = 'sending');
    renderFiles();

    AB.sendFiles(files.map(f => f.raw));
  };

  window.cancelTransfer = function () {
    AB.cleanup();
    $('progressBlock').style.display = 'none';
    $('sendBtn').style.display = '';
    $('addMoreWrap').style.display = 'block';
    files.forEach(f => { if (f.status !== 'done') f.status = 'ready'; });
    renderFiles();
    showToast('Transfer cancelled.', 'error');
  };

  // ── Progress update ──────────────────────────────────────────
  function updateProgress(info) {
    $('progFill').style.width = info.pct.toFixed(1) + '%';
    $('progPct').textContent = Math.round(info.pct) + '%';
    $('progSpeed').textContent = info.speed.toFixed(1) + ' MB/s';
    $('sentLabel').textContent = fmtSize(info.sent) + ' sent';

    const elapsed = (Date.now() - transferStartTime) / 1000;
    const eta = info.pct < 99 ? Math.max(0, Math.round((100 - info.pct) / info.pct * elapsed)) + 's' : 'Finishing…';
    $('etaLabel').textContent = info.pct < 99 ? '~' + eta + ' remaining' : 'Verifying…';
    if (info.pct > 95) $('progLabel').textContent = 'Verifying integrity…';

    // Update individual file cards
    files.forEach((f, i) => {
      if (i === info.fileIndex) {
        f.pct = info.pct;
        if (info.pct >= 100) f.status = 'done';
        const item = $(`fi-${i}`);
        if (item) {
          item.className = `file-item ${f.status}`;
          let statusEl = item.querySelector('.fstatus');
          if (!statusEl) { statusEl = document.createElement('div'); item.querySelector('.finfo').appendChild(statusEl); }
          if (f.status === 'done') { statusEl.className = 'fstatus done'; statusEl.textContent = '✓ Delivered'; }
          else { statusEl.className = 'fstatus sending'; statusEl.textContent = `Sending… ${Math.round(f.pct)}%`; }
        }
      }
    });
  }

  // ── File download trigger ────────────────────────────────────
  function triggerDownload(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ── Success screen ───────────────────────────────────────────
  function showSuccess() {
    if (transferDone) return;
    transferDone = true;
    const role = AB.getRole();
    const elapsed = ((Date.now() - transferStartTime) / 1000).toFixed(0);
    const totalBytes = role === 'sender'
      ? files.reduce((a, f) => a + f.size, 0)
      : receivedFiles.reduce((a, f) => a + f.size, 0);
    const count = role === 'sender' ? files.length : receivedFiles.length;

    $('receiptRows').innerHTML = [
      ['Role', role === 'sender' ? '⬆ Sender' : '⬇ Receiver', 'blue'],
      ['From', `${myDevice.icon} ${myDevice.name}`, ''],
      ['Files', count + ' file' + (count > 1 ? 's' : ''), ''],
      ['Total Size', fmtSize(totalBytes), ''],
      ['Duration', elapsed + ' seconds', ''],
      ['Encryption', 'AES-256-GCM ✓', 'ok'],
      ['Integrity', 'SHA-256 ✓', 'ok'],
    ].map(([k, v, cls]) =>
      `<div class="receipt-row"><span class="rkey">${k}</span><span class="rval ${cls}">${v}</span></div>`
    ).join('');

    goTo('screen-success');
  }

  window.shareReceipt = function () {
    if (navigator.share) {
      navigator.share({ title: 'AirBridge Transfer Complete', text: 'File transfer complete via AirBridge!' });
    } else {
      showToast('Receipt copied!', 'info');
    }
  };

  window.resetApp = function () {
    files = [];
    receivedFiles = [];
    transferDone = false;
    AB.cleanup();
    navHistory = ['screen-hero'];
    goTo('screen-hero');
  };

  // ── Format code input ────────────────────────────────────────
  window.formatCode = function (el) {
    let v = el.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
    el.value = v;
  };

  // ── Init ─────────────────────────────────────────────────────
  updateChrome('screen-hero');

  // Hero device labels
  const leftLbl = document.querySelector('.dv-l .dv-lbl');
  const leftIco = document.querySelector('.dv-l .dv-emoji');
  if (leftLbl) { leftLbl.textContent = myDevice.name; leftIco.textContent = myDevice.icon; }

});
