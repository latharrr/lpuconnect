import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Peer from "peerjs";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const socket = io(SOCKET_URL);

const TAGLINES = [
  "Anonymous. Campus only. One click.",
  "30,000 strangers. One conversation away.",
  "LPU's secret social layer.",
  "Skip the small talk. Or don't.",
];

function Noise() {
  return (
    <svg style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.03, zIndex: 0 }}>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

function Avatar({ name, size = 48 }) {
  const initials = name?.split("-").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#ff6b35", "#f7c59f", "#efefd0", "#004e89", "#1a936f", "#c3423f", "#e84855", "#3a86ff"];
  const color = colors[name?.charCodeAt(name.length - 1) % colors.length] || "#ff6b35";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Space Mono', monospace", fontSize: size * 0.35, fontWeight: 700,
      color: "#0a0a0a", flexShrink: 0, border: "2px solid rgba(255,255,255,0.1)"
    }}>
      {initials}
    </div>
  );
}

// ─── SCREEN: LANDING ──────────────────────────────────────────────────────────
function LandingScreen({ onStart }) {
  const [tagIdx, setTagIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setTagIdx(i => (i + 1) % TAGLINES.length); setVisible(true); }, 400);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setPulse(p => !p), 1200);
    return () => clearInterval(iv);
  }, []);

  function handleStart() {
    if (!email.trim()) { setError("Enter your LPU email or registration number."); return; }
    if (!email.includes("@lpu") && !/^\d{8,12}$/.test(email.trim())) {
      setError("Use your @lpu.in email or LPU reg number.");
      return;
    }
    setError("");
    onStart(email.trim());
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#080808",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Space Mono', monospace", padding: "24px", position: "relative", overflow: "hidden"
    }}>
      <Noise />

      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "linear-gradient(rgba(255,107,53,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,53,0.04) 1px,transparent 1px)",
        backgroundSize: "60px 60px"
      }} />

      <div style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 300, borderRadius: "50%",
        background: "radial-gradient(ellipse,rgba(255,107,53,0.12) 0%,transparent 70%)",
        filter: "blur(40px)", zIndex: 0, pointerEvents: "none"
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 520, width: "100%", textAlign: "center" }}>
        
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)",
          borderRadius: 100, padding: "6px 16px", marginBottom: 40,
          fontSize: 11, color: "#ff6b35", letterSpacing: "0.15em", textTransform: "uppercase"
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#ff6b35",
            boxShadow: pulse ? "0 0 10px #ff6b35" : "none",
            transition: "box-shadow 0.4s ease"
          }} />
          Lovely Professional University
        </div>

        <h1 style={{
          fontSize: "clamp(52px, 12vw, 88px)", fontWeight: 700,
          color: "#f0ede8", margin: "0 0 8px 0", letterSpacing: "-0.04em",
          lineHeight: 1
        }}>
          LPU<span style={{ color: "#ff6b35" }}>connect</span>
        </h1>

        <p style={{
          fontSize: 14, color: "#666", letterSpacing: "0.05em",
          height: 24, margin: "0 0 56px 0",
          opacity: visible ? 1 : 0, transition: "opacity 0.3s ease"
        }}>
          {TAGLINES[tagIdx]}
        </p>

        <div style={{
          display: "flex", justifyContent: "center", gap: 40, marginBottom: 48
        }}>
          {[["30k+", "Students"], ["Anonymous", "Always"], ["Campus", "Only"]].map(([v, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0ede8" }}>{v}</div>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="reg@lpu.in  or  11234567"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleStart()}
            style={{
              width: "100%", padding: "16px 20px", boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, color: "#f0ede8", fontSize: 14, outline: "none",
              fontFamily: "'Space Mono', monospace",
              transition: "border-color 0.2s"
            }}
            onFocus={e => e.target.style.borderColor = "rgba(255,107,53,0.5)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
          {error && <p style={{ color: "#ff6b35", fontSize: 11, marginTop: 8, textAlign: "left" }}>{error}</p>}
        </div>

        <button onClick={handleStart} style={{
          width: "100%", padding: "18px", background: "#ff6b35",
          border: "none", borderRadius: 12, color: "#0a0a0a",
          fontSize: 15, fontWeight: 700, fontFamily: "'Space Mono', monospace",
          cursor: "pointer", letterSpacing: "0.05em",
          transition: "transform 0.1s, box-shadow 0.2s",
          boxShadow: "0 0 0 rgba(255,107,53,0)"
        }}
          onMouseEnter={e => { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 8px 30px rgba(255,107,53,0.4)"; }}
          onMouseLeave={e => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 0 0 rgba(255,107,53,0)"; }}
        >
          START CHAT →
        </button>

        <p style={{ color: "#333", fontSize: 11, marginTop: 20, letterSpacing: "0.05em" }}>
          VERIFIED CAMPUS STUDENTS ONLY · ENCRYPTED · SAFE
        </p>
      </div>
    </div>
  );
}

// ─── SCREEN: MATCHING ─────────────────────────────────────────────────────────
function MatchingScreen({ userEmail, onMatched, onCancel }) {
  const [dots, setDots] = useState(".");
  const [queuePos, setQueuePos] = useState(0);

  useEffect(() => {
    const d = setInterval(() => setDots(p => p.length >= 3 ? "." : p + "."), 500);

    // Send the sanitized peerId we will be using
    const safePeerId = socket.id.replace(/[^a-zA-Z0-9]/g, "");
    socket.emit("start_chat", { email: userEmail, peerId: safePeerId });
    
    socket.on("matched", (data) => {
        onMatched(data.partnerEmail, data.room, data.partnerId);
    });

    return () => { 
        clearInterval(d); 
        socket.off("matched");
    };
  }, []);
  
  const handleCancel = () => {
      // Disconnect or unqueue handled on server unmount/disconnect realistically
      socket.disconnect(); 
      socket.connect();
      onCancel();
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#080808", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Space Mono', monospace", position: "relative"
    }}>
      <Noise />
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: "linear-gradient(rgba(255,107,53,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,53,0.04) 1px,transparent 1px)",
        backgroundSize: "60px 60px"
      }} />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto 40px" }}>
          {[1, 0.6, 0.3].map((op, i) => (
            <div key={i} style={{
              position: "absolute", inset: i * 20,
              border: `1px solid rgba(255,107,53,${op * 0.4})`,
              borderRadius: "50%",
              animation: `ping ${1.5 + i * 0.4}s ease-out infinite`,
              animationDelay: `${i * 0.3}s`
            }} />
          ))}
          <div style={{
            position: "absolute", inset: 50,
            background: "#ff6b35", borderRadius: "50%",
            boxShadow: "0 0 20px rgba(255,107,53,0.6)"
          }} />
        </div>

        <style>{`
          @keyframes ping {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(1.4); opacity: 0; }
          }
        `}</style>

        <h2 style={{ color: "#f0ede8", fontSize: 22, margin: "0 0 8px", fontWeight: 700 }}>
          Finding a match{dots}
        </h2>
        <p style={{ color: "#555", fontSize: 12, margin: "0 0 32px", letterSpacing: "0.08em" }}>
          Waiting for another student to join...
        </p>

        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "12px 24px", display: "inline-block", marginBottom: 32
        }}>
          <span style={{ color: "#444", fontSize: 11, letterSpacing: "0.1em" }}>LOGGED IN AS </span>
          <span style={{ color: "#ff6b35", fontSize: 11 }}>{userEmail}</span>
        </div>

        <div>
          <button onClick={handleCancel} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            color: "#555", padding: "12px 28px", borderRadius: 8, cursor: "pointer",
            fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: "0.08em",
            transition: "color 0.2s, border-color 0.2s"
          }}
            onMouseEnter={e => { e.target.style.color = "#f0ede8"; e.target.style.borderColor = "rgba(255,255,255,0.3)"; }}
            onMouseLeave={e => { e.target.style.color = "#555"; e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SCREEN: CHAT ─────────────────────────────────────────────────────────────
function ChatScreen({ userEmail, partner, room, partnerId, onSkip, onEnd }) {
  const [messages, setMessages] = useState([
    { from: "system", text: `Connected with an anonymous student. Say hello!`, time: new Date() }
  ]);
  const [input, setInput] = useState("");
  const [videoState, setVideoState] = useState("idle"); // idle | requesting | active | rejected
  const [timer, setTimer] = useState(600); // 10 min
  const [reported, setReported] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [incomingVideo, setIncomingVideo] = useState(false);
  
  const messagesEndRef = useRef(null);
  const peerRef = useRef(null);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [currentCall, setCurrentCall] = useState(null);

  useEffect(() => {
    if (videoState === "active" && localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [videoState, localStream]);

  useEffect(() => {
    if (videoState === "active" && remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [videoState, remoteStream]);
  
  const anonymousPartnerName = "Student"


  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Timer countdown
  useEffect(() => {
    const iv = setInterval(() => setTimer(t => {
      if (t <= 1) { clearInterval(iv); onEnd(); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, []);

  // Socket logic
  useEffect(() => {
    socket.on("receive_message", (data) => {
        setMessages(m => [...m, { from: "partner", text: data.text, time: new Date() }]);
    });

    socket.on("partner_skipped", () => {
        setMessages(m => [...m, { from: "system", text: "Partner has left the chat.", time: new Date() }]);
        setTimeout(onSkip, 2000);
    });
    
    socket.on("video_request", () => {
        setIncomingVideo(true);
    });

    socket.on("video_accept", () => {
        setMessages(m => [...m, { from: "system", text: `Video call accepted.`, time: new Date() }]);
        startPeerCall();
    });

    socket.on("video_reject", () => {
         setVideoState("idle");
         setMessages(m => [...m, { from: "system", text: `Video call declined.`, time: new Date() }]);
    });
    
    socket.on("end_video", () => {
        closeVideoAndStreams();
    });

    return () => {
        socket.off("receive_message");
        socket.off("partner_skipped");
        socket.off("video_request");
        socket.off("video_accept");
        socket.off("video_reject");
        socket.off("end_video");
    };
  }, []);

  // Peer JS logic initialization
  useEffect(() => {
      const url = new URL(SOCKET_URL);
      const safePeerId = socket.id.replace(/[^a-zA-Z0-9]/g, "");
      
      const newPeer = new Peer(safePeerId, {
          host: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: '/peerjs',
          secure: url.protocol === 'https:',
          config: {
              iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:stun1.l.google.com:19302' },
                  { urls: 'stun:stun2.l.google.com:19302' }
              ]
          }
      });
      peerRef.current = newPeer;
      
      console.log("[WebRTC] Initializing Peer with ID:", socket.id);

      newPeer.on("open", (id) => {
          console.log("[WebRTC] Peer connection to tracking server opened. My ID:", id);
      });
      
      newPeer.on("error", (err) => {
          console.error("[WebRTC] Peerjs Global Error:", err, err.type);
      });

      newPeer.on("call", (call) => {
          console.log("[WebRTC] Received incoming call from:", call.peer);
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              alert("Your browser does not support video calls.");
              return;
          }
          navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
              console.log("[WebRTC] Incoming Call: Acquired local microphone/camera stream.");
              setLocalStream(stream);
              setVideoState("active");
              
              console.log("[WebRTC] Incoming Call: Answering WebRTC call...");
              call.answer(stream); // Answer the call with an A/V stream.
              setCurrentCall(call);
              
              call.on("stream", (incomingStream) => {
                  console.log("[WebRTC] Incoming Call: Received remote partner stream!");
                  setRemoteStream(incomingStream);
              });
              
              call.on("close", () => {
                  console.log("[WebRTC] Incoming Call: Call closed by partner.");
              });
              
              call.on("error", (err) => {
                  console.error("[WebRTC] Incoming Call: Call error", err);
              });
          }).catch((err) => {
              console.error("Failed to get local stream", err);
              alert("Camera access denied or device not found: " + err.message);
              setVideoState("idle");
          });
      });

      return () => {
          newPeer.destroy();
      }
  }, []);

  const closeVideoAndStreams = () => {
        setVideoState("idle");
        if (currentCall) currentCall.close();
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        setMessages(m => [...m, { from: "system", text: "Video call ended.", time: new Date() }]);
  }

  function sendMessage() {
    if (!input.trim()) return;
    setMessages(m => [...m, { from: "me", text: input.trim(), time: new Date() }]);
    
    // Broadcast via socket
    socket.emit("send_message", { room, text: input.trim(), from: "partner" });
    setInput("");
  }
  
  function handleSkip() {
      socket.emit("skip", { room });
      closeVideoAndStreams();
      onSkip();
  }

  function requestVideo() {
    setVideoState("requesting");
    setMessages(m => [...m, { from: "system", text: "Video call request sent...", time: new Date() }]);
    socket.emit("video_request", { room });
  }

  function endVideo() {
      socket.emit("end_video", { room });
      closeVideoAndStreams();
  }

  function startPeerCall() {
     if (!peerRef.current) {
         alert("Call server is still connecting. Please try again in a few seconds.");
         setVideoState("idle");
         return;
     }

     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
         alert("Your browser does not support video calls.");
         setVideoState("idle");
         return;
     }
     navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        console.log("[WebRTC] Outgoing Call: Acquired local microphone/camera stream.");
        setLocalStream(stream);
        setVideoState("active");
        
        console.log("[WebRTC] Outgoing Call: Dialing partner ID", partnerId);
        const call = peerRef.current.call(partnerId, stream);
        setCurrentCall(call);

        call.on("stream", (incomingStream) => {
             console.log("[WebRTC] Outgoing Call: Received remote partner stream!");
             setRemoteStream(incomingStream);
        });
        
        call.on("close", () => {
             console.log("[WebRTC] Outgoing Call: Call closed by partner.");
        });
        
        call.on("error", (err) => {
             console.error("[WebRTC] Outgoing Call: Call error", err);
        });
     }).catch(err => {
         console.error("Error accessing media devices", err);
         alert("It looks like you don't have a camera or blocked the permission. Error: " + err.message);
         setVideoState("idle");
     });
  }

  function acceptIncoming() {
    setIncomingVideo(false);
    setVideoState("requesting");
    socket.emit("video_accept", { room });
  }
  
  function declineIncoming() {
      setIncomingVideo(false);
      socket.emit("video_reject", { room });
  }

  const fmt = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const mins = String(Math.floor(timer / 60)).padStart(2, "0");
  const secs = String(timer % 60).padStart(2, "0");

  return (
    <div style={{
      minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column",
      fontFamily: "'Space Mono', monospace", maxWidth: 680, margin: "0 auto",
      position: "relative"
    }}>
      <Noise />
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>


      <div style={{
        padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 12, background: "rgba(8,8,8,0.95)",
        backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10
      }}>
        <Avatar name={anonymousPartnerName} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f0ede8", fontSize: 14, fontWeight: 700 }}>{anonymousPartnerName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a936f", display: "inline-block" }} />
            <span style={{ color: "#1a936f", fontSize: 10, letterSpacing: "0.08em" }}>ONLINE · LPU VERIFIED</span>
          </div>
        </div>

        <div style={{
          background: timer < 60 ? "rgba(200,50,50,0.15)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${timer < 60 ? "rgba(200,50,50,0.4)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700,
          color: timer < 60 ? "#c43232" : "#555", letterSpacing: "0.05em"
        }}>
          {mins}:{secs}
        </div>

        <button onClick={() => setShowReport(true)} style={{
          background: "transparent", border: "none", color: "#333", cursor: "pointer",
          fontSize: 18, padding: "4px 8px", transition: "color 0.2s"
        }}
          onMouseEnter={e => e.target.style.color = "#c43232"}
          onMouseLeave={e => e.target.style.color = "#333"}
          title="Report"
        >⚑</button>

        <button onClick={handleSkip} style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          color: "#666", padding: "8px 16px", borderRadius: 8, cursor: "pointer",
          fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.08em",
          transition: "all 0.2s"
        }}
          onMouseEnter={e => { e.target.style.background = "rgba(255,107,53,0.1)"; e.target.style.color = "#ff6b35"; e.target.style.borderColor = "rgba(255,107,53,0.3)"; }}
          onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.04)"; e.target.style.color = "#666"; e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          SKIP →
        </button>
      </div>

      {videoState === "active" && (
        <div style={{
          background: "#0f0f0f", borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: 16, display: "flex", gap: 12, animation: "fadeUp 0.3s ease"
        }}>
          <div style={{
            flex: 1, aspectRatio: "16/9", background: "linear-gradient(135deg,#1a1a1a,#0f0f0f)",
            borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden"
          }}>
             <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: "absolute", bottom: 10, left: 12, fontSize: 10,
              color: "#fff", letterSpacing: "0.08em", textShadow: "0 1px 2px rgba(0,0,0,0.8)"
            }}>{anonymousPartnerName}</div>
             <div style={{
              position: "absolute", top: 10, right: 12, width: 8, height: 8,
              borderRadius: "50%", background: "#ff4444",
              boxShadow: "0 0 8px rgba(255,68,68,0.6)",
              animation: "blink 1.5s infinite"
            }} />
          </div>
          <div style={{
            width: 120, aspectRatio: "9/16", background: "linear-gradient(135deg,#1e1e1e,#0f0f0f)",
            borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden"
          }}>
             <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 9, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>You</div>
          </div>
        </div>
      )}
      {videoState === "active" && (
        <div style={{ padding: "8px 16px", display: "flex", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {[["🎤", "Mute"], ["📷", "Camera"], ["📞", "End Call"]].map(([icon, label]) => (
             <button key={label} onClick={label === "End Call" ? endVideo : undefined} style={{
              background: label === "End Call" ? "rgba(196,50,50,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${label === "End Call" ? "rgba(196,50,50,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: label === "End Call" ? "#c43232" : "#666",
              padding: "8px 14px", borderRadius: 8, cursor: "pointer",
              fontFamily: "'Space Mono', monospace", fontSize: 11,
              display: "flex", alignItems: "center", gap: 6
             }}>
                 {icon} {label}
             </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "20px 16px",
        display: "flex", flexDirection: "column", gap: 12,
        minHeight: 0
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: msg.from === "me" ? "row-reverse" : "row",
            alignItems: "flex-end", gap: 8,
            animation: "fadeUp 0.25s ease"
          }}>
            {msg.from !== "me" && msg.from !== "system" && <Avatar name={anonymousPartnerName} size={28} />}
            <div style={{
              maxWidth: "72%",
              background: msg.from === "system"
                ? "transparent"
                : msg.from === "me"
                  ? "#ff6b35"
                  : "rgba(255,255,255,0.06)",
              border: msg.from === "system" ? "none" : `1px solid ${msg.from === "me" ? "transparent" : "rgba(255,255,255,0.08)"}`,
              borderRadius: msg.from === "me" ? "18px 18px 4px 18px" : msg.from === "system" ? 0 : "18px 18px 18px 4px",
              padding: msg.from === "system" ? "4px 0" : "10px 14px",
              color: msg.from === "system" ? "#333" : msg.from === "me" ? "#0a0a0a" : "#d8d4cf",
              fontSize: msg.from === "system" ? 10 : 13,
              lineHeight: 1.5,
              textAlign: msg.from === "system" ? "center" : "left",
              letterSpacing: msg.from === "system" ? "0.08em" : "0",
              width: msg.from === "system" ? "100%" : "auto",
              fontStyle: msg.from === "system" ? "italic" : "normal"
            }}>
              {msg.text}
              {msg.from !== "system" && (
                <div style={{ fontSize: 9, color: msg.from === "me" ? "rgba(0,0,0,0.4)" : "#333", marginTop: 4, textAlign: msg.from === "me" ? "right" : "left" }}>
                  {fmt(msg.time)}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div style={{
        padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)",
        display: "flex", gap: 8, alignItems: "center"
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
          style={{
            flex: 1, padding: "12px 16px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, color: "#f0ede8", fontSize: 13, outline: "none",
            fontFamily: "'Space Mono', monospace",
          }}
          onFocus={e => e.target.style.borderColor = "rgba(255,107,53,0.4)"}
          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
        />
        <button onClick={sendMessage} style={{
          background: "#ff6b35", border: "none", borderRadius: 10, width: 44, height: 44,
          color: "#0a0a0a", fontSize: 18, cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
          transition: "opacity 0.2s"
        }}>↑</button>

        {videoState === "idle" && (
          <button onClick={requestVideo} style={{
            background: "rgba(26,147,111,0.15)", border: "1px solid rgba(26,147,111,0.3)",
            borderRadius: 10, width: 44, height: 44, color: "#1a936f", fontSize: 18,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.2s"
          }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(26,147,111,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(26,147,111,0.15)"}
            title="Start Video Call"
          >📹</button>
        )}
      </div>

      {incomingVideo && videoState !== "active" && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, backdropFilter: "blur(8px)"
        }}>
          <div style={{
            background: "#111", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20, padding: 32, textAlign: "center", maxWidth: 320,
            animation: "fadeUp 0.3s ease"
          }}>
            <Avatar name={anonymousPartnerName} size={64} />
            <p style={{ color: "#f0ede8", marginTop: 16, marginBottom: 4, fontSize: 15, fontWeight: 700 }}>
              Incoming Video Call
            </p>
            <p style={{ color: "#555", fontSize: 12, marginBottom: 28 }}>Student wants to video chat</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={declineIncoming} style={{
                background: "rgba(196,50,50,0.15)", border: "1px solid rgba(196,50,50,0.3)",
                color: "#c43232", padding: "12px 24px", borderRadius: 10, cursor: "pointer",
                fontFamily: "'Space Mono', monospace", fontSize: 12
              }}>✕ Decline</button>
              <button onClick={acceptIncoming} style={{
                background: "rgba(26,147,111,0.2)", border: "1px solid rgba(26,147,111,0.4)",
                color: "#1a936f", padding: "12px 24px", borderRadius: 10, cursor: "pointer",
                fontFamily: "'Space Mono', monospace", fontSize: 12
              }}>✓ Accept</button>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, backdropFilter: "blur(8px)"
        }}>
          <div style={{
            background: "#111", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20, padding: 32, maxWidth: 340, animation: "fadeUp 0.3s ease"
          }}>
            <h3 style={{ color: "#f0ede8", margin: "0 0 16px", fontSize: 16 }}>Report User</h3>
            {reported ? (
              <div>
                <p style={{ color: "#1a936f", fontSize: 13, margin: "0 0 20px" }}>✓ Report submitted. Moderators will review.</p>
                <button onClick={() => { setShowReport(false); handleSkip(); }} style={{
                  background: "#ff6b35", border: "none", borderRadius: 8, padding: "10px 20px",
                  color: "#0a0a0a", cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 12
                }}>Skip & Continue</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["Harassment", "Inappropriate content", "Spam", "Other"].map(r => (
                  <button key={r} onClick={() => setReported(true)} style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#d8d4cf", padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "'Space Mono', monospace", fontSize: 12, textAlign: "left",
                    transition: "all 0.2s"
                  }}
                    onMouseEnter={e => { e.target.style.background = "rgba(196,50,50,0.1)"; e.target.style.color = "#c43232"; }}
                    onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.04)"; e.target.style.color = "#d8d4cf"; }}
                  >{r}</button>
                ))}
                <button onClick={() => setShowReport(false)} style={{
                  background: "transparent", border: "none", color: "#444",
                  cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11, marginTop: 8
                }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | matching | chat
  const [userEmail, setUserEmail] = useState("");
  const [partner, setPartner] = useState("");
  const [room, setRoom] = useState("");
  const [partnerId, setPartnerId] = useState("");

  function handleStart(email) {
    setUserEmail(email);
    setScreen("matching");
  }

  function handleMatched(partnerName, roomName, peerId) {
    setPartner(partnerName);
    setRoom(roomName);
    setPartnerId(peerId);
    setScreen("chat");
  }

  function handleSkip() {
    setScreen("matching");
    setPartner("");
    setRoom("");
    setPartnerId("");
  }

  function handleEnd() {
    setScreen("landing");
  }

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  return (
    <div style={{ fontFamily: "'Space Mono', monospace" }}>
      {screen === "landing" && <LandingScreen onStart={handleStart} />}
      {screen === "matching" && (
        <MatchingScreen
          userEmail={userEmail}
          onMatched={handleMatched}
          onCancel={() => setScreen("landing")}
        />
      )}
      {screen === "chat" && (
        <ChatScreen
          userEmail={userEmail}
          partner={partner}
          room={room}
          partnerId={partnerId}
          onSkip={handleSkip}
          onEnd={handleEnd}
        />
      )}
    </div>
  );
}
