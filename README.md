# ⚡ AirBridge — Share Files Instantly. No Login. No Limits.

Free, open-source, browser-based file sharing between any devices.  
iPhone ↔ Android ↔ Windows ↔ Mac ↔ Linux — no app, no account, no subscription.

---

## ✨ Features

- 🔐 **End-to-end encrypted** — AES-256-GCM encryption in the browser
- 📡 **Peer-to-peer via WebRTC** — files go directly between devices
- ✅ **SHA-256 integrity** — guaranteed exact byte-for-byte delivery
- 📱 **All devices** — iPhone, Android, Windows, Mac, Linux, Chromebook
- 📷 **Real QR scanner** — camera-based QR scanning on mobile
- 📂 **Multiple files** — send several files at once
- 🔍 **Device detection** — shows real device name and OS
- 🌙 **Dark & light mode**
- 💸 **Completely free** — no tiers, no credit card

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| File Transfer | WebRTC DataChannel (peer-to-peer) |
| Signaling | Node.js + WebSockets (ws) |
| QR Generation | qrcode.js |
| QR Scanning | jsQR (camera API) |
| Device Detection | navigator.userAgent parsing |
| Server Framework | Express.js |

---

## 🚀 Run Locally

### 1. Clone the repo
```bash
git clone https://github.com/YOURUSERNAME/airbridge.git
cd airbridge
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the server
```bash
npm run dev
```

### 4. Open in browser
```
http://localhost:3000
```

Open on **two different devices** on the same network to test.

---

## 🌍 Deploy to Production

### Frontend + Backend → Render.com (free)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy — you get a live HTTPS URL

> **Note:** Vercel only hosts static files. Because AirBridge needs a WebSocket signaling server (Node.js), you must host the backend on Render, Railway, or Fly.io. The frontend is served by the same Express server.

---

## 📁 Project Structure

```
airbridge/
├── server/
│   └── index.js          ← Node.js WebSocket signaling server
├── public/
│   ├── index.html         ← Main UI
│   ├── css/
│   │   └── style.css      ← All styles
│   └── js/
│       ├── device.js      ← Device detection (userAgent)
│       ├── webrtc.js      ← WebRTC + WebSocket client
│       ├── scanner.js     ← QR camera scanner (jsQR)
│       └── app.js         ← Main app controller
├── package.json
├── render.yaml            ← Render.com deployment config
└── README.md
```

---

## 🔒 How Security Works

```
Sender                    Signaling Server              Receiver
  │                            │                           │
  │── create-room ────────────►│                           │
  │◄─ room-created (A7F-X2K) ─│                           │
  │                            │◄── join-room (A7F-X2K) ──│
  │◄─ receiver-joined ─────────│                           │
  │── WebRTC offer ───────────►│──────────────────────────►│
  │◄──────────────────────────│◄──── WebRTC answer ────────│
  │◄──────────── ICE candidates exchanged ────────────────►│
  │                                                         │
  │◄═══════════ Direct P2P connection (files go here) ═════►│
  │           (server is completely out of the loop)        │
```

The signaling server only introduces the two peers — it **never sees your files**.

---

## 📱 Browser Support

| Platform | Browser |
|---|---|
| iPhone / iPad | Safari 15+, Chrome |
| Android | Chrome 90+, Firefox, Samsung Browser |
| Windows | Chrome, Edge, Firefox, Opera |
| macOS | Safari 15+, Chrome, Firefox |
| Linux | Chrome, Firefox |

---

## 🗺️ Roadmap

- [ ] Folder transfer support
- [ ] Transfer pause / resume
- [ ] Multiple receivers simultaneously
- [ ] PWA / installable app
- [ ] Transfer history (local storage)
- [ ] Custom TURN server config

---

## 📄 License

MIT — free to use, fork, and build on.

## 🙌 Contributing

PRs welcome! Open an issue first to discuss changes.
