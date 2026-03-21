# UniConnect 🔥

> Anonymous campus chat & video calls for university students.

**Live:** [uniconnect.deepanshulathar.dev](https://uniconnect.deepanshulathar.dev) · **Backend:** [lpuconnect.onrender.com](https://lpuconnect.onrender.com)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎭 **Anonymous Chat** | Connect with random students instantly — no sign-up required |
| 📹 **Video Calls** | One-click WebRTC video with low-latency peer-to-peer streaming |
| 👫 **Friend System** | Mutual "Enjoy" → Unlock friend requests → Reveal identities |
| ⏱️ **Timed Chats** | 10-minute random sessions with extend timer requests |
| 💬 **Direct Messaging** | Chat with unlocked friends anytime via deterministic rooms |
| 📱 **Android App** | Capacitor-powered native APK with camera/mic permissions |
| 🟢 **Online Status** | See which friends are currently online in real-time |

---

## 🏗️ Tech Stack

### Frontend
- **React 19** + **Vite 7** — Fast SPA with HMR
- **Socket.IO Client** — Real-time WebSocket communication
- **PeerJS** — WebRTC video calls (STUN/TURN via Google & OpenRelay)
- **Capacitor 8** — Native Android wrapper
- **Legacy Plugin** — Android 7+ / Chrome 52+ compatibility

### Backend
- **Node.js** + **Express 5** — REST API & signaling server
- **Socket.IO** — Real-time event system (matching, chat, video signaling)
- **PeerJS Server** — WebRTC coordination
- **SQLite3** — Lightweight user & friends database
- **Google Auth Library** — Optional Google OAuth login

---

## 📂 Project Structure

```
lpuconnect/
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # All screens (Landing, Dashboard, Matching, Chat)
│   │   ├── main.jsx         # React entry point
│   │   └── index.css        # Global styles + mobile responsive
│   ├── public/
│   │   └── uniconnect.apk   # Android APK download
│   ├── android/              # Capacitor Android project
│   ├── capacitor.config.json
│   ├── vite.config.js
│   └── package.json
├── backend/
│   ├── server.js            # Express + Socket.IO + PeerJS server
│   ├── db.js                # SQLite setup & helpers
│   └── package.json
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Backend
```bash
cd backend
npm install
npm start
# Server runs on http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

### Environment Variables
Create a `.env` file in `frontend/`:
```env
VITE_BACKEND_URL=http://localhost:3001
```

For production, set this to your Render backend URL.

---

## 📱 Android APK Build

```bash
cd frontend
npm run build              # Build production web assets
npx cap sync android       # Sync to Android project
cd android
./gradlew assembleDebug    # Build debug APK
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🌐 Deployment

| Service | Platform | Auto-deploy |
|---------|----------|-------------|
| Frontend | [Vercel](https://vercel.com) | ✅ On push to `main` |
| Backend | [Render](https://render.com) | ✅ On push to `main` |

### Vercel Settings
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### Render Settings
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** `node server.js`

---

## 🔌 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/login/guest` | Create anonymous guest account |
| POST | `/api/login/google` | Google OAuth login |
| POST | `/api/login/resume` | Resume existing session |
| POST | `/api/profile/bio` | Update user bio |

---

## 🔧 Socket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `register_user` | `email` | Register for online status |
| `start_chat` | `{email, peerId, name, gender}` | Join random match queue |
| `join_direct` | `{userEmail, friendEmail, ...}` | Join direct friend room |
| `send_message` | `{room, text}` | Send chat message |
| `skip` | `{room}` | Leave current chat |
| `cancel_match` | — | Cancel matchmaking |
| `video_request` | `{room}` | Request video call |
| `video_accept/reject` | `{room}` | Respond to video request |
| `enjoy_request` | `{room}` | Send mutual enjoy signal |
| `friend_request/accept/reject` | `{room}` | Friend system actions |
| `extend_request/accept/reject` | `{room}` | Timer extension actions |

### Server → Client
| Event | Description |
|-------|-------------|
| `matched` | Paired with random student |
| `direct_matched` | Friend joined direct room |
| `receive_message` | Incoming chat message |
| `partner_skipped` | Partner left the chat |
| `partner_disconnected` | Partner connection lost |
| `online_users` | Updated online users list |

---

## 📄 License

MIT

---

<p align="center">
  Built with ☕ for LPU students
</p>
