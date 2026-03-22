const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Room store ──────────────────────────────────────────────────────────────
// rooms[code] = { sender: ws, receiver: ws, createdAt: Date }
const rooms = {};

// Generate a short readable room code like A7F-X2K
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) {
    if (i === 3) { code += '-'; continue; }
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // make sure code is unique
  return rooms[code] ? generateCode() : code;
}

// Clean up stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const code in rooms) {
    if (now - rooms[code].createdAt > 10 * 60 * 1000) {
      delete rooms[code];
    }
  }
}, 60 * 1000);

// ── WebSocket signaling ──────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.role = null;
  ws.roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ── Sender creates a room ──
      case 'create-room': {
        const code = generateCode();
        rooms[code] = { sender: ws, receiver: null, createdAt: Date.now() };
        ws.role = 'sender';
        ws.roomCode = code;
        send(ws, { type: 'room-created', code });
        break;
      }

      // ── Receiver joins a room ──
      case 'join-room': {
        const code = (msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const formattedCode = code.slice(0, 3) + '-' + code.slice(3, 6);
        const room = rooms[formattedCode];

        if (!room) {
          send(ws, { type: 'error', message: 'Room not found. Check the code and try again.' });
          return;
        }
        if (room.receiver) {
          send(ws, { type: 'error', message: 'Room is already occupied.' });
          return;
        }

        room.receiver = ws;
        ws.role = 'receiver';
        ws.roomCode = formattedCode;

        // Notify both sides
        send(ws, { type: 'room-joined', code: formattedCode });
        send(room.sender, { type: 'receiver-joined' });
        break;
      }

      // ── WebRTC signaling passthrough ──
      // offer / answer / ice-candidate go straight to the other peer
      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        const room = rooms[ws.roomCode];
        if (!room) return;
        const target = ws.role === 'sender' ? room.receiver : room.sender;
        if (target) send(target, msg);
        break;
      }

      // ── Transfer metadata (filename, size etc.) ──
      case 'transfer-meta': {
        const room = rooms[ws.roomCode];
        if (!room) return;
        const target = ws.role === 'sender' ? room.receiver : room.sender;
        if (target) send(target, msg);
        break;
      }

      // ── Transfer complete ack ──
      case 'transfer-done': {
        const room = rooms[ws.roomCode];
        if (!room) return;
        const target = ws.role === 'sender' ? room.receiver : room.sender;
        if (target) send(target, { type: 'transfer-done' });
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = rooms[ws.roomCode];
    if (!room) return;
    // Notify the other peer that this peer disconnected
    const other = ws.role === 'sender' ? room.receiver : room.sender;
    if (other) send(other, { type: 'peer-disconnected' });
    // Clean up room
    delete rooms[ws.roomCode];
  });

  ws.on('error', () => {});
});

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

// ── REST: health check ───────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

// ── Fallback → serve index.html ──────────────────────────────────────────────
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`AirBridge server running on port ${PORT}`));
