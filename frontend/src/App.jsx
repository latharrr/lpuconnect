import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Peer from "peerjs";
import { Capacitor } from "@capacitor/core";
import {
    Download, ThumbsUp, UserPlus, Check, X, Flag, SkipForward, LogOut, MessageCircle,
    Send, Video, VideoOff, Mic, MicOff, PhoneOff, Clock, ArrowRight, LoaderCircle, DoorOpen,
} from "lucide-react";

let SOCKET_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
if (Capacitor.isNativePlatform()) {
    SOCKET_URL = "https://lpuconnect.onrender.com";
}
// Session token for authenticated socket connections
let sessionToken = localStorage.getItem('uniconnect_token') || null;

const socket = io(SOCKET_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['polling', 'websocket'],
    auth: { token: sessionToken },
});

// Helper: optimize video bitrate after call connects
function optimizeVideoBitrate(peerConnection, maxBitrateKbps) {
    if (!peerConnection) return;
    try {
        const senders = peerConnection.getSenders();
        senders.forEach(function(sender) {
            if (sender.track && sender.track.kind === 'video') {
                var params = sender.getParameters();
                if (!params.encodings) params.encodings = [{}];
                params.encodings[0].maxBitrate = maxBitrateKbps * 1000;
                sender.setParameters(params).catch(function() {});
            }
        });
    } catch (e) {
        // Silently fail on older browsers
    }
}

const isGuestEmail = (email) => !email || /@uniconnect\.local$/.test(email);

function initialsOf(name) {
  const safeName = name || "??";
  return safeName.split("-").map(w => w?.[0] || "").join("").slice(0, 2).toUpperCase() || "?";
}

// A booth print: initials on silver emulsion. `latent` keeps it fogged until identities are revealed.
function Print({ name, size = 48, latent = false }) {
  return (
    <div className="print" data-latent={latent} style={{ width: size, height: size }} aria-hidden="true">
      <div className="print-emulsion" style={{ fontSize: Math.round(size * 0.42) }}>
        <span>{latent ? "?" : initialsOf(name)}</span>
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="lamp" />
      <span>Uni<em>connect</em></span>
    </span>
  );
}

// ─── SCREEN: SERVER WAKEUP ────────────────────────────────────────────────────
function ServerWakeupUI() {
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
        const iv = setInterval(() => setTimeLeft(t => t > 0 ? t - 1 : 0), 1000);
        return () => clearInterval(iv);
    }, []);

    // The lamp warms from dull to full as the server spins up
    const warmth = (60 - timeLeft) / 60;

    return (
        <div className="wake waiting" role="alertdialog" aria-live="polite" aria-labelledby="wake-title">
            <div className="waiting-body">
                <span className="lamp wake-lamp" style={{
                    opacity: 0.35 + warmth * 0.65,
                    boxShadow: `0 0 ${16 + warmth * 48}px ${4 + warmth * 12}px rgba(255,181,71,${0.25 + warmth * 0.45})`
                }} />
                <h1 id="wake-title" className="display">Warming up the booth</h1>
                <p>
                    UniConnect is a non-profit student project on a free-tier server. It was asleep,
                    so it's starting up now. This usually takes about a minute.
                </p>
                <div className="wake-count tabular" aria-label={`About ${timeLeft} seconds left`}>
                    0:{timeLeft.toString().padStart(2, "0")}
                </div>
                <div className="label" style={{ color: "var(--text-3)" }}>Estimated time</div>
                <p className="who">Keep this page open. It connects on its own.</p>
            </div>
        </div>
    );
}

// ─── SCREEN: LANDING ──────────────────────────────────────────────────────────
function LandingScreen({ onLogin, onWakeup }) {
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGuestLogin() {
    if (!gender) {
      setError("Pick one of the three options first.");
      return;
    }
    setError("");
    setLoading(true);

    const wakeTimer = setTimeout(() => {
       if (onWakeup) onWakeup(true);
    }, 3000);

    try {
        const res = await fetch(`${SOCKET_URL}/api/login/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gender })
        });

        clearTimeout(wakeTimer);
        if (onWakeup) onWakeup(false);

        if (!res.ok) throw new Error("Failed to authenticate with server");
        const data = await res.json();
        // Store session token
        if (data.token) {
            sessionToken = data.token;
            localStorage.setItem('uniconnect_token', data.token);
            socket.auth = { token: data.token };
            // Reconnect socket with new auth
            if (socket.connected) {
                socket.disconnect();
                socket.connect();
            }
        }
        onLogin(data.user, data.friends);
    } catch (err) {
        clearTimeout(wakeTimer);
        if (onWakeup) onWakeup(false);
        console.error("Guest login error:", err);
        setError("Couldn't reach the server. Check your connection and try again.");
        setLoading(false);
    }
  }

  return (
    <>
      <main className="landing">
        <div className="curtain" aria-hidden="true" />
        <div className="rod" aria-hidden="true" />

        <div className="booth-front">
          <form className="plate landing-plate" onSubmit={e => { e.preventDefault(); handleGuestLogin(); }}>
            <span className="lamp lamp-pulse plate-lamp" aria-hidden="true" />

            <h1 className="display landing-title">
              Uni<em>connect</em>
            </h1>

            <p className="landing-promise">
              Talk to a random student for ten minutes. <strong>Nobody sees who you are
              until you both say yes.</strong>
            </p>

            <fieldset className="gender">
              <legend className="label">I am</legend>
              <div className="push-row">
                {["Male", "Female", "Other"].map(g => (
                  <label className="push" key={g}>
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={gender === g}
                      onChange={e => { setGender(e.target.value); setError(""); }}
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn-go" disabled={loading}>
              {loading ? <><LoaderCircle className="spin" /> Opening…</> : <>Step in <ArrowRight /></>}
            </button>

            <div className="plate-foot">
              <span className="label">No sign-up · no names</span>
              <a href="/uniconnect.apk" download className="label">
                <Download /> Android app
              </a>
            </div>
          </form>

          <div className="delivery" aria-label="Sample strip showing how a chat unfolds">
            <div className="slot" aria-hidden="true" />
            <div className="strip-clip">
              <div className="strip">
                <div className="frame">
                  <span className="frame-no tabular">1</span>
                  <div className="frame-msg">worst class you're taking this sem?</div>
                </div>
                <div className="frame">
                  <span className="frame-no tabular">2</span>
                  <div className="frame-msg" data-me="true">stats. 8am. every day.</div>
                  <div className="frame-msg">no way, same</div>
                </div>
                <div className="frame">
                  <span className="frame-no tabular">3</span>
                  <div className="frame-event">
                    <ThumbsUp aria-hidden="true" />
                    <span className="label">Both enjoyed</span>
                  </div>
                </div>
                <div className="frame">
                  <span className="frame-no tabular">4</span>
                  <div className="frame-faces">
                    <div>AK</div>
                    <div>RM</div>
                  </div>
                </div>
              </div>
              <p className="strip-caption label">Sample strip</p>
            </div>
          </div>
        </div>
      </main>

      <section className="how" aria-labelledby="how-title">
        <div className="how-inner">
          <h2 id="how-title" className="display">How the <em>booth</em> works</h2>
          <ol className="how-steps">
            <li>
              <span className="n tabular">1</span>
              <div>
                <h3>Step in</h3>
                <p>You get matched with a random student. You're both anonymous, with no profile and no photo.</p>
              </div>
            </li>
            <li>
              <span className="n tabular">2</span>
              <div>
                <h3>Talk for ten minutes</h3>
                <p>Text first. Video unlocks after 30 seconds if you both want it. Skip any time.</p>
              </div>
            </li>
            <li>
              <span className="n tabular">3</span>
              <div>
                <h3>Both enjoyed it?</h3>
                <p>If you both tap "Enjoying this", you can extend the timer or add each other as friends.</p>
              </div>
            </li>
            <li>
              <span className="n tabular">4</span>
              <div>
                <h3>Names develop</h3>
                <p>Once you both accept the friend request, names are revealed and you can chat any time.</p>
              </div>
            </li>
          </ol>
          <div className="how-foot">
            <span>UniConnect is a non-profit student project.</span>
            <a href="/uniconnect.apk" download>Download the Android app</a>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── SCREEN: DASHBOARD ────────────────────────────────────────────────────────
function DashboardScreen({ user, friends, onlineUsers, onStartMatch, onStartDirectMatch, onLogout }) {
  const [bio, setBio] = useState(user.bio || "");
  const [savingBio, setSavingBio] = useState(false);
  const [savedBio, setSavedBio] = useState(false);

  async function saveBio() {
      setSavingBio(true);
      setSavedBio(false);
      try {
          await fetch(`${SOCKET_URL}/api/profile/bio`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email, bio })
          });
          setSavedBio(true);
      } catch (err) {
          console.error("Failed to save bio:", err);
      } finally {
          setSavingBio(false);
      }
  }

  const onlineCount = friends.filter(f => onlineUsers?.includes(f.email)).length;

  return (
    <div className="interior">
      <header className="topbar">
        <Wordmark />
        <button className="btn btn-ghost" onClick={onLogout}>
          <LogOut /> Log out
        </button>
      </header>

      <main className="dash">
        <div className="dash-left">
          <section aria-label="Your profile">
            <div className="me">
              <Print name={user.name} size={96} />
              <div style={{ minWidth: 0 }}>
                <h1 className="display me-name">{user.name}</h1>
                <div className="me-meta label">
                  <span>{user.gender}</span>
                  {!isGuestEmail(user.email) && <><span aria-hidden="true">·</span><span style={{ textTransform: "none", letterSpacing: 0 }}>{user.email}</span></>}
                </div>
              </div>
            </div>

            <div className="bio">
              <label className="field-label label" htmlFor="bio">Short bio</label>
              <textarea
                id="bio"
                value={bio}
                onChange={e => { setBio(e.target.value); setSavedBio(false); }}
                onBlur={saveBio}
                maxLength={280}
                placeholder="Friends see this once you've unlocked each other."
              />
              <div className="bio-status" aria-live="polite">
                <span>Saves when you click away</span>
                {savingBio ? <span>Saving…</span> : savedBio ? <span data-state="saved">Saved</span> : null}
              </div>
            </div>
          </section>

          <section className="stepin" aria-labelledby="stepin-title">
            <div className="plate">
              <h2 id="stepin-title" className="display">Random chat</h2>
              <p>Ten minutes with a stranger. Anonymous until you both say yes.</p>
              <button className="btn-go" onClick={onStartMatch}>
                Step in <ArrowRight />
              </button>
            </div>
          </section>
        </div>

        <section aria-labelledby="friends-title">
          <div className="friends-head">
            <h2 id="friends-title" className="display">Friends</h2>
            <span className="label tabular">
              {friends.length === 0 ? "None yet" : `${friends.length} total · ${onlineCount} online`}
            </span>
          </div>

          {friends.length === 0 ? (
             <div className="empty">
                <div className="empty-frame" aria-hidden="true"><div /></div>
                <div>
                  <h3>Your strip is blank</h3>
                  <p>When you and a stranger both enjoy a chat, you can add each other. Friends show up here and you can message them any time.</p>
                </div>
             </div>
          ) : (
             <ul className="friend-list">
                {friends.map((friend, idx) => {
                   const online = onlineUsers?.includes(friend.email);
                   return (
                      <li key={idx} className="friend">
                         <Print name={friend.name} size={48} />
                         <div style={{ minWidth: 0 }}>
                            <div className="friend-name">
                               <span>{friend.name}</span>
                               <span className="label" style={{ color: "var(--text-3)" }}>{friend.gender}</span>
                            </div>
                            <div className="friend-sub">
                               <span className="live-dot" data-off={!online} aria-hidden="true" />
                               <span data-online={online}>{online ? "Online" : "Offline"}</span>
                               <span aria-hidden="true">·</span>
                               <span>{friend.bio || "No bio yet"}</span>
                            </div>
                         </div>
                         <button className="btn btn-quiet" onClick={() => onStartDirectMatch(friend)} aria-label={`Chat with ${friend.name}`}>
                            <MessageCircle /> Chat
                         </button>
                      </li>
                   );
                })}
             </ul>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── SCREEN: MATCHING ─────────────────────────────────────────────────────────
function MatchingScreen({ userEmail, userName, userGender, onMatched, onCancel }) {
  useEffect(() => {
    const startMatch = () => {
        if (!socket.id) return; // Safety check
        const safePeerId = socket.id.replace(/[^a-zA-Z0-9]/g, "");
        socket.emit("start_chat", { email: userEmail, peerId: safePeerId, name: userName, gender: userGender });
    };

    // If socket is already connected, start immediately; otherwise wait
    if (socket.connected && socket.id) {
        startMatch();
    } else {
        socket.on('connect', startMatch);
    }

    socket.on("matched", (data) => {
        onMatched(data.partnerEmail, data.room, data.partnerId, data.partnerName, data.partnerGender);
    });

    return () => {
        socket.off("matched");
        socket.off("connect", startMatch);
    };
  }, []);

  const handleCancel = () => {
      socket.emit("cancel_match");
      onCancel();
  }

  return (
    <div className="interior waiting">
      <header className="topbar">
        <Wordmark />
        <button className="btn btn-quiet" onClick={handleCancel}>
          <X /> Cancel
        </button>
      </header>

      <main className="waiting-body" aria-live="polite">
        <div className="ready-lamps" aria-hidden="true">
          <span className="lamp" /><span className="lamp" /><span className="lamp" />
        </div>
        <h1 className="display">Finding someone</h1>
        <p>Waiting for another student to step in. Keep this screen open.</p>
        <p className="who label">You're in as <strong>{userName}</strong></p>
      </main>
    </div>
  );
}

// ─── SCREEN: DIRECT MATCHING ──────────────────────────────────────────────────
function DirectMatchingScreen({ userEmail, userName, userGender, friendEmail, friendName, onMatched, onCancel }) {
  useEffect(() => {
    const startDirect = () => {
        if (!socket.id) return;
        const safePeerId = socket.id.replace(/[^a-zA-Z0-9]/g, "");
        // Request to join deterministic direct room
        socket.emit("join_direct", {
            userEmail, userPeerId: safePeerId, userName, userGender, friendEmail
        });
    };

    // If socket is already connected, start immediately; otherwise wait
    if (socket.connected && socket.id) {
        startDirect();
    } else {
        socket.on('connect', startDirect);
    }

    socket.on("direct_matched", (data) => {
        onMatched(data.partnerEmail, data.room, data.partnerId, data.partnerName, data.partnerGender, true);
    });

    return () => {
        socket.off("direct_matched");
        socket.off("direct_waiting");
        socket.off('connect', startDirect);
    };
  }, []);

  const handleCancel = () => {
      socket.emit("cancel_match");
      onCancel();
  }

  return (
    <div className="interior waiting">
      <header className="topbar">
        <Wordmark />
        <button className="btn btn-quiet" onClick={handleCancel}>
          <X /> Cancel
        </button>
      </header>

      <main className="waiting-body" aria-live="polite">
        <div className="calling-prints" aria-hidden="true">
           <Print name={userName} size={80} />
           <div className="calling-line"><i /><i /><i /></div>
           <Print name={friendName} size={80} />
        </div>
        <h1 className="display">Calling {friendName}</h1>
        <p>They'll join when they open the chat from their friends list.</p>
      </main>
    </div>
  );
}

// ─── SCREEN: CHAT ─────────────────────────────────────────────────────────────
function ChatScreen({ userEmail, userName, userGender, partner, partnerName, partnerGender, room, partnerId, isDirect, onSkip, onEnd }) {
  const [messages, setMessages] = useState([
    { from: "system", text: isDirect ? `Connected with ${partnerName}.` : `You are in the booth with an anonymous student. Say hi.`, time: new Date() }
  ]);
  const [input, setInput] = useState("");
  const [videoState, setVideoState] = useState("idle"); // idle | requesting | active | rejected
  const [timer, setTimer] = useState(isDirect ? 3600 : 600); // 1hr for direct, 10 min random
  const [reported, setReported] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [incomingVideo, setIncomingVideo] = useState(false);
  
  const [friendState, setFriendState] = useState(isDirect ? "friends" : "none"); // none | sent | received | friends
  const [enjoyState, setEnjoyState] = useState(isDirect ? "mutual" : "none"); // none | sent | received | mutual
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  
  const [extendState, setExtendState] = useState("none"); // none | sent | received
  const [showExtendBanner, setShowExtendBanner] = useState(false);

  const messagesEndRef = useRef(null);
  const peerRef = useRef(null);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [currentCall, setCurrentCall] = useState(null);

  // Refs for closures avoiding stale state
  const localStreamRef = useRef(null);
  const currentCallRef = useRef(null);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { currentCallRef.current = currentCall; }, [currentCall]);

  const DisplayPartnerName = friendState === "friends" ? partnerName : "Student";
  const pushSystem = (text) => setMessages(m => [...m, { from: "system", text, time: new Date() }]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Ref for handleSkip to avoid stale closure in timer
  const handleSkipRef = useRef(handleSkip);
  useEffect(() => { handleSkipRef.current = handleSkip; });

  // Timer countdown
  useEffect(() => {
    if (isDirect) return; // No timer for friends
    
    const iv = setInterval(() => setTimer(t => {
      // Show prompt at 2m (480s), 4m (360s), and 8m (120s) into the 10m chat
      if (t === 481 || t === 361 || t === 121) {
          setShowExtendBanner(true);
      }
      if (t <= 1) { 
          clearInterval(iv);
          handleSkipRef.current(); 
          return 0; 
      }
      return t - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [isDirect]);

  // Socket Ref for closures
  const enjoyStateRef = useRef(enjoyState);
  useEffect(() => { enjoyStateRef.current = enjoyState; }, [enjoyState]);

  // Socket logic
  useEffect(() => {
    socket.on("receive_message", (data) => {
        setMessages(m => [...m, { from: "partner", text: data.text, time: new Date() }]);
    });

    socket.on("partner_skipped", () => {
        setMessages(m => [...m, { from: "system", text: "Partner has left the chat.", time: new Date() }]);
        setTimeout(onSkip, 2000);
    });
    
    socket.on("partner_disconnected", () => {
        setMessages(m => [...m, { from: "system", text: "Partner disconnected unexpectedly.", time: new Date() }]);
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

    socket.on("friend_request", () => {
        setFriendState("received");
    });

    socket.on("friend_accept", () => {
        setFriendState("friends");
        setMessages(m => [...m, { from: "system", text: `Friend request accepted! True identities revealed.`, time: new Date() }]);
    });

    socket.on("friend_reject", () => {
        setFriendState("none");
        setMessages(m => [...m, { from: "system", text: `Friend request declined.`, time: new Date() }]);
    });

    socket.on("enjoy_request", () => {
        if (enjoyStateRef.current === "sent") {
            setEnjoyState("mutual");
            setMessages(m => [...m, { from: "system", text: `You both enjoyed this chat! Adding friends is now unlocked.`, time: new Date() }]);
        } else {
            setEnjoyState("received");
        }
    });

    socket.on("enjoy_accept", () => {
        setEnjoyState("mutual");
        setMessages(m => [...m, { from: "system", text: `You both enjoyed this chat! Adding friends is now unlocked.`, time: new Date() }]);
    });

    socket.on("extend_request", () => {
        setExtendState("received");
        setShowExtendBanner(true);
    });

    socket.on("extend_accept", () => {
        setExtendState("none");
        setShowExtendBanner(false);
        setTimer(600); // Reset to 10 mins
        setMessages(m => [...m, { from: "system", text: `Time extended! You have 10 more minutes.`, time: new Date() }]);
    });

    socket.on("extend_reject", () => {
        setExtendState("none");
        setMessages(m => [...m, { from: "system", text: `Partner declined to extend the time.`, time: new Date() }]);
    });

    return () => {
        socket.off("receive_message");
        socket.off("partner_skipped");
        socket.off("partner_disconnected");
        socket.off("video_request");
        socket.off("video_accept");
        socket.off("video_reject");
        socket.off("end_video");
        socket.off("friend_request");
        socket.off("friend_accept");
        socket.off("friend_reject");
        socket.off("enjoy_request");
        socket.off("enjoy_accept");
        socket.off("extend_request");
        socket.off("extend_accept");
        socket.off("extend_reject");
    };
  }, [isDirect]);

  // Peer JS logic initialization
  useEffect(() => {
      if (!socket.id) {
          // Socket not connected yet, wait for it
          const onConnect = () => initPeer();
          socket.on('connect', onConnect);
          return () => socket.off('connect', onConnect);
      }
      return initPeer();
  }, []);

  function initPeer() {
      const url = new URL(SOCKET_URL);
      const rawId = socket.id || ('fallback' + Math.random().toString(36).substring(2));
      const safePeerId = rawId.replace(/[^a-zA-Z0-9]/g, "");
      
      const newPeer = new Peer(safePeerId, {
          host: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: '/peerjs',
          secure: url.protocol === 'https:',
          config: {
              iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:stun1.l.google.com:19302' },
                  { urls: 'stun:stun2.l.google.com:19302' },
                  { urls: 'stun:global.stun.twilio.com:3478' },
                  {
                      urls: 'turn:openrelay.metered.ca:80',
                      username: 'openrelayproject',
                      credential: 'openrelayproject'
                  },
                  {
                      urls: 'turn:openrelay.metered.ca:443',
                      username: 'openrelayproject',
                      credential: 'openrelayproject'
                  },
                  {
                      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                      username: 'openrelayproject',
                      credential: 'openrelayproject'
                  }
              ],
              sdpSemantics: 'unified-plan'
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
              pushSystem("Your browser does not support video calls.");
              return;
          }
          const getMediaStream = () => {
              return navigator.mediaDevices.getUserMedia({
                  video: {
                      facingMode: 'user',
                      width: { ideal: 1280, min: 480 },
                      height: { ideal: 720, min: 360 },
                      frameRate: { ideal: 30, min: 15 }
                  },
                  audio: {
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true
                  }
              }).catch((camErr) => {
                  console.warn("[WebRTC] HD camera failed, trying basic camera:", camErr.message);
                  return navigator.mediaDevices.getUserMedia({
                      video: { facingMode: 'user' },
                      audio: { echoCancellation: true, noiseSuppression: true }
                  });
              }).catch((camErr2) => {
                  console.warn("[WebRTC] Camera failed entirely, trying audio-only:", camErr2.message);
                  return navigator.mediaDevices.getUserMedia({ video: false, audio: true });
              });
          };

          getMediaStream().then((stream) => {
              console.log("[WebRTC] Incoming Call: Acquired local stream. Video tracks:", stream.getVideoTracks().length);
              setLocalStream(stream);
              localStreamRef.current = stream; // Update ref
              setVideoState("active");
              
              console.log("[WebRTC] Incoming Call: Answering WebRTC call...");
              call.answer(stream);
              setCurrentCall(call);
              currentCallRef.current = call; // Update ref
              
              call.on("stream", (incomingStream) => {
                  console.log("[WebRTC] Incoming Call: Received remote partner stream!");
                  setRemoteStream(incomingStream);
                  // Optimize video bitrate to 500kbps for stable mobile quality
                  if (call.peerConnection) {
                      optimizeVideoBitrate(call.peerConnection, 500);
                  }
              });
              
              call.on("close", () => {
                  console.log("[WebRTC] Incoming Call: Call closed by partner.");
              });
              
              call.on("error", (err) => {
                  console.error("[WebRTC] Incoming Call: Call error", err);
              });
          }).catch((err) => {
              console.error("Failed to get any media stream", err);
              pushSystem("Could not access microphone or camera. Please check your permissions in browser settings.");
              setVideoState("idle");
          });
      });

      return () => {
          newPeer.destroy();
      };
  }

  const videoClosedRef = useRef(false);
  const closeVideoAndStreams = () => {
        if (videoClosedRef.current) return; // Guard against double-fire
        videoClosedRef.current = true;
        setVideoState("idle");
        if (currentCallRef.current) {
            try { currentCallRef.current.close(); } catch(e) {}
            currentCallRef.current = null;
            setCurrentCall(null);
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }
        setRemoteStream(null);
        setMessages(m => [...m, { from: "system", text: "Video call ended.", time: new Date() }]);
        // Reset guard after a tick so future calls can close
        setTimeout(() => { videoClosedRef.current = false; }, 100);
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
         pushSystem("Call server is still connecting. Please try again in a few seconds.");
         setVideoState("idle");
         return;
     }

     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
         pushSystem("Your browser does not support video calls.");
         setVideoState("idle");
         return;
     }
     const getMediaStream = () => {
         return navigator.mediaDevices.getUserMedia({
             video: {
                 facingMode: 'user',
                 width: { ideal: 1280, min: 480 },
                 height: { ideal: 720, min: 360 },
                 frameRate: { ideal: 30, min: 15 }
             },
             audio: {
                 echoCancellation: true,
                 noiseSuppression: true,
                 autoGainControl: true
             }
         }).catch((camErr) => {
             console.warn("[WebRTC] HD camera failed, trying basic camera:", camErr.message);
             return navigator.mediaDevices.getUserMedia({
                 video: { facingMode: 'user' },
                 audio: { echoCancellation: true, noiseSuppression: true }
             });
         }).catch((camErr2) => {
             console.warn("[WebRTC] Camera failed entirely, trying audio-only:", camErr2.message);
             return navigator.mediaDevices.getUserMedia({ video: false, audio: true });
         });
     };

     getMediaStream().then((stream) => {
        console.log("[WebRTC] Outgoing Call: Acquired local stream. Video tracks:", stream.getVideoTracks().length);
        setLocalStream(stream);
        localStreamRef.current = stream; // Update ref directly
        setVideoState("active");
        
        console.log("[WebRTC] Outgoing Call: Dialing partner ID", partnerId);
        const call = peerRef.current.call(partnerId, stream);
        setCurrentCall(call);
        currentCallRef.current = call; // Update ref directly

        call.on("stream", (incomingStream) => {
             console.log("[WebRTC] Outgoing Call: Received remote partner stream!");
             setRemoteStream(incomingStream);
             // Optimize video bitrate to 500kbps for stable mobile quality
             if (call.peerConnection) {
                 optimizeVideoBitrate(call.peerConnection, 500);
             }
        });
        
        call.on("close", () => {
             console.log("[WebRTC] Outgoing Call: Call closed by partner.");
        });
        
        call.on("error", (err) => {
             console.error("[WebRTC] Outgoing Call: Call error", err);
        });
     }).catch(err => {
         console.error("Error accessing media devices", err);
         pushSystem("Could not access microphone or camera. Please check your permissions in browser settings.");
         setVideoState("idle");
     });
  }

  function acceptIncoming() {
    setIncomingVideo(false);
    setVideoState("active");
    socket.emit("video_accept", { room });
  }
  
  function declineIncoming() {
      setIncomingVideo(false);
      socket.emit("video_reject", { room });
  }

  function sendFriendRequest() {
      setFriendState("sent");
      socket.emit("friend_request", { room });
      setMessages(m => [...m, { from: "system", text: "Friend request sent.", time: new Date() }]);
  }

  function acceptFriendRequest() {
      setFriendState("friends");
      socket.emit("friend_accept", { room });
      setMessages(m => [...m, { from: "system", text: `You accepted the friend request! True identities revealed.`, time: new Date() }]);
  }

  function rejectFriendRequest() {
      setFriendState("none");
      socket.emit("friend_reject", { room });
      setMessages(m => [...m, { from: "system", text: "Friend request declined.", time: new Date() }]);
  }

  function handleEnjoy() {
      if (enjoyState === "none") {
          setEnjoyState("sent");
          socket.emit("enjoy_request", { room });
      } else if (enjoyState === "received") {
          setEnjoyState("mutual");
          socket.emit("enjoy_accept", { room });
          setMessages(m => [...m, { from: "system", text: `You both enjoyed this chat! Adding friends is now unlocked.`, time: new Date() }]);
      }
  }

  function requestExtendTimer() {
      setExtendState("sent");
      socket.emit("extend_request", { room });
      setMessages(m => [...m, { from: "system", text: "Requested to extend the chat.", time: new Date() }]);
  }

  function acceptExtendTimer() {
      setExtendState("none");
      setShowExtendBanner(false);
      socket.emit("extend_accept", { room });
      setTimer(600);
      setMessages(m => [...m, { from: "system", text: `Time extended! You have 10 more minutes.`, time: new Date() }]);
  }

  function rejectExtendTimer() {
      setExtendState("none");
      setShowExtendBanner(false);
      socket.emit("extend_reject", { room });
  }

  function toggleMute() {
     if (localStream) {
         const audioTrack = localStream.getAudioTracks()[0];
         if (audioTrack) {
             audioTrack.enabled = !audioTrack.enabled;
             setIsMuted(!audioTrack.enabled);
         }
     }
  }

  function toggleVideo() {
     if (localStream) {
         const videoTrack = localStream.getVideoTracks()[0];
         if (videoTrack) {
             videoTrack.enabled = !videoTrack.enabled;
             setIsCameraOff(!videoTrack.enabled);
         }
     }
  }

  const fmt = (d) => {
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  const mins = String(Math.floor(timer / 60)).padStart(2, "0");
  const secs = String(timer % 60).padStart(2, "0");

  const isFriends = friendState === "friends";
  const lowTime = timer < 60;

  // What the consent rail says, and whose move it is
  let railCopy = null;
  let railButtons = null;
  let railAttention = false;
  if (friendState === "received") {
      railAttention = true;
      railCopy = <><strong>They want to add you.</strong> Accepting reveals both names.</>;
      railButtons = (
          <>
              <button className="btn btn-quiet" onClick={rejectFriendRequest}>Decline</button>
              <button className="btn btn-lamp" onClick={acceptFriendRequest}><Check /> Accept</button>
          </>
      );
  } else if (friendState === "sent") {
      railCopy = <>Friend request sent. <strong>Waiting on them.</strong></>;
  } else if (enjoyState === "mutual") {
      railCopy = <><strong>You both enjoyed this.</strong> Add each other to reveal names.</>;
      railButtons = <button className="btn btn-red" onClick={sendFriendRequest}><UserPlus /> Add friend</button>;
  } else if (enjoyState === "received") {
      railAttention = true;
      railCopy = <><strong>They're enjoying this.</strong> Tap if you are too.</>;
      railButtons = <button className="btn btn-lamp" onClick={handleEnjoy}><ThumbsUp /> Me too</button>;
  } else if (enjoyState === "sent") {
      railCopy = <>Noted. <strong>If they tap too,</strong> you can add each other.</>;
      railButtons = <button className="btn btn-quiet" disabled><Check /> Enjoying</button>;
  } else {
      railCopy = <>Enjoying this? If you both tap, you can add each other.</>;
      railButtons = <button className="btn btn-quiet" onClick={handleEnjoy}><ThumbsUp /> Enjoying this</button>;
  }

  const enjoyStep = (enjoyState === "mutual" || isFriends) ? "done" : (enjoyState === "sent" || enjoyState === "received") ? "half" : "todo";
  const friendStep = isFriends ? "done" : (friendState === "sent" || friendState === "received") ? "half" : "todo";

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="chat-who">
            <Print name={partnerName} size={44} latent={!isFriends} />
            <div style={{ minWidth: 0 }}>
              <div className="chat-who-name">
                  {DisplayPartnerName}
                  {isFriends && partnerGender && <span className="label" style={{ color: "var(--text-3)", marginLeft: 8 }}>{partnerGender}</span>}
              </div>
              <div className="chat-who-sub">
                  <span className="live-dot" aria-hidden="true" />
                  <span>{isDirect ? "Online · no time limit" : isFriends ? "Online · friends" : "Online · anonymous"}</span>
              </div>
            </div>
        </div>

        <div className="chat-actions">
          {!isDirect && (
            <div className="timer tabular" data-low={lowTime} role="timer" aria-label={`${mins} minutes ${secs} seconds left`}>
              <b>{mins}:{secs}</b>
              <span>left</span>
            </div>
          )}

          <button className="btn btn-ghost btn-icon" onClick={() => setShowReport(true)} aria-label="Report this person" title="Report">
            <Flag />
          </button>

          <button className="btn btn-quiet" onClick={handleSkip}>
            {isDirect ? <><DoorOpen /><span className="skip-label">Leave</span></> : <><SkipForward /><span className="skip-label">Skip</span></>}
          </button>
        </div>
      </header>

      {!isDirect && isFriends && (
        <div className="rail" data-compact="true" aria-live="polite">
          <p className="rail-copy label"><Check aria-hidden="true" /> Friends now · names revealed</p>
        </div>
      )}
      {!isDirect && !isFriends && (
        <div className="rail" data-attention={railAttention} aria-live="polite">
          <ol className="rail-steps" aria-label="Unlock progress">
            <li data-state={enjoyStep}>Both enjoy</li>
            <li data-state={friendStep}>Names revealed</li>
          </ol>
          <div className="rail-row">
            <p className="rail-copy">{railCopy}</p>
            {railButtons && <div className="rail-btns">{railButtons}</div>}
          </div>
        </div>
      )}

      {videoState === "active" && (
        <div className="video">
          <div className="video-main">
             <video
                autoPlay
                playsInline
                ref={el => {
                   if (el && remoteStream && el.srcObject !== remoteStream) {
                      el.srcObject = remoteStream;
                   }
                   remoteVideoRef.current = el;
                }}
             />
             <span className="video-tag label">{DisplayPartnerName}</span>
             <span className="lamp lamp-pulse video-rec" aria-hidden="true" />
          </div>
          <div className="video-pip">
             <video
                autoPlay
                playsInline
                muted
                ref={el => {
                   if (el && localStream && el.srcObject !== localStream) {
                      el.srcObject = localStream;
                   }
                   localVideoRef.current = el;
                }}
             />
             <span className="video-tag label">You</span>
          </div>
        </div>
      )}
      {videoState === "active" && (
        <div className="video-controls">
          <button className="btn btn-quiet" onClick={toggleMute} aria-pressed={isMuted}>
              {isMuted ? <><MicOff /> Unmute</> : <><Mic /> Mute</>}
          </button>
          <button className="btn btn-quiet" onClick={toggleVideo} aria-pressed={isCameraOff}>
              {isCameraOff ? <><VideoOff /> Camera on</> : <><Video /> Camera off</>}
          </button>
          <button className="btn btn-danger" onClick={endVideo}>
              <PhoneOff /> End
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="messages" role="log" aria-live="polite">
        {messages.map((msg, i) => (
          msg.from === "system" ? (
            <div key={i} className="sys"><span>{msg.text}</span></div>
          ) : (
            <div key={i} className="msg" data-from={msg.from}>
              <div className="bubble">
                {msg.text}
                <time>{fmt(msg.time)}</time>
              </div>
            </div>
          )
        ))}

        {!isDirect && showExtendBanner && (
            <div className="notice">
              <p>
                {extendState === "received"
                  ? <>They want <strong>ten more minutes</strong>. You in?</>
                  : extendState === "sent"
                    ? "Asked for more time. Waiting on them."
                    : "Ten minutes go fast. Want more time?"}
              </p>
              <div className="notice-btns">
                {extendState === "none" && (
                    <button className="btn btn-lamp" onClick={requestExtendTimer}><Clock /> Ask for 10 more min</button>
                )}
                {extendState === "received" && (
                    <>
                        <button className="btn btn-lamp" onClick={acceptExtendTimer}><Check /> Extend</button>
                        <button className="btn btn-quiet" onClick={rejectExtendTimer}>No thanks</button>
                    </>
                )}
                {extendState !== "received" && (
                    <button className="btn btn-ghost" onClick={() => setShowExtendBanner(false)}>Dismiss</button>
                )}
              </div>
            </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
        <label htmlFor="msg" className="sr-only">Message</label>
        <input
          id="msg"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message…"
          autoComplete="off"
          maxLength={2000}
        />
        <button type="submit" className="btn btn-red btn-icon" aria-label="Send" disabled={!input.trim()}>
          <Send />
        </button>

        {videoState === "idle" && (
          (!isDirect && friendState !== "friends" && timer > 570) ? (
            <span className="video-wait" title="Video unlocks 30 seconds in">
              <Video aria-hidden="true" /> {timer - 570}s
            </span>
          ) : (
            <button type="button" className="btn btn-quiet btn-icon" onClick={requestVideo} aria-label="Start video call" title="Start video call">
              <Video />
            </button>
          )
        )}
        {videoState === "requesting" && (
          <span className="video-wait"><LoaderCircle className="spin" aria-hidden="true" /> Calling</span>
        )}
      </form>

      {incomingVideo && videoState !== "active" && (
        <div className="scrim">
          <div className="plate modal" role="dialog" aria-modal="true" aria-labelledby="incoming-title">
            <Print name={partnerName} size={64} latent={!isFriends} />
            <h2 id="incoming-title" className="display">Video call</h2>
            <p>{DisplayPartnerName} wants to switch to video. Your camera and mic turn on if you accept.</p>
            <div className="modal-btns">
              <button className="btn btn-quiet" onClick={declineIncoming}><X /> Decline</button>
              <button className="btn btn-red" onClick={acceptIncoming}><Video /> Accept</button>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <div className="scrim" onClick={e => { if (e.target === e.currentTarget && !reported) setShowReport(false); }}>
          <div className="plate modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <h2 id="report-title" className="display" style={{ marginTop: 8 }}>Report</h2>
            {reported ? (
              <div>
                <p className="modal-ok"><Check /> Thanks. Your report has been noted.</p>
                <button className="btn btn-red btn-block" onClick={() => { setShowReport(false); handleSkip(); }}>
                  {isDirect ? "Leave chat" : "Skip to someone new"}
                </button>
              </div>
            ) : (
              <>
                <p>What's going on?</p>
                <div className="report-list">
                  {["Harassment", "Inappropriate content", "Spam", "Other"].map(r => (
                    <button key={r} className="btn btn-quiet" onClick={() => setReported(true)}>{r}</button>
                  ))}
                </div>
                <button className="btn btn-text" onClick={() => setShowReport(false)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | dashboard | matching | direct | chat
  const [currentUser, setCurrentUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [partner, setPartner] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerGender, setPartnerGender] = useState("");
  const [room, setRoom] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [isDirectChat, setIsDirectChat] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isWakingServer, setIsWakingServer] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    socket.on('online_users', (users) => {
        setOnlineUsers(users);
    });
    return () => socket.off('online_users');
  }, []);

  // Register user for online presence tracking
  useEffect(() => {
    if (!currentUser) return;
    const emitRegister = () => {
        socket.emit('register_user', currentUser.email);
    };
    if (socket.connected) emitRegister();
    socket.on('connect', emitRegister);
    return () => socket.off('connect', emitRegister);
  }, [currentUser]);

  useEffect(() => {
    const cached = localStorage.getItem("uniconnect_user");
    if (cached) {
        try {
            const user = JSON.parse(cached);
            
            const wakeTimer = setTimeout(() => {
                setIsWakingServer(true);
            }, 3000);

            fetch(`${SOCKET_URL}/api/login/resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email })
            })
            .then(res => {
                clearTimeout(wakeTimer);
                setIsWakingServer(false);
                return res.json();
            })
            .then(data => {
                if (data.user) {
                   // Update session token
                   if (data.token) {
                       sessionToken = data.token;
                       localStorage.setItem('uniconnect_token', data.token);
                       socket.auth = { token: data.token };
                       if (socket.connected) {
                           socket.disconnect();
                           socket.connect();
                       }
                   }
                   setCurrentUser(data.user);
                   setFriends(data.friends || []);
                   setScreen("dashboard");
                }
            })
            .catch(err => {
                clearTimeout(wakeTimer);
                setIsWakingServer(false);
                console.error("Silent login failed:", err);
                setCurrentUser(user);
                setScreen("dashboard");
            })
            .finally(() => setIsInitializing(false));
        } catch (e) {
            localStorage.removeItem("uniconnect_user");
            setIsInitializing(false);
        }
    } else {
        setIsInitializing(false);
    }
  }, []);

  function handleLogin(user, userFriends) {
    localStorage.setItem("uniconnect_user", JSON.stringify(user));
    setCurrentUser(user);
    setFriends(userFriends);
    setScreen("dashboard");
  }
  
  function handleLogout() {
    localStorage.removeItem("uniconnect_user");
    localStorage.removeItem("uniconnect_token");
    sessionToken = null;
    socket.auth = { token: null };
    setCurrentUser(null);
    setFriends([]);
    setScreen("landing");
  }

  function handleStartMatch() {
    setIsDirectChat(false);
    setScreen("matching");
  }
  
  function handleStartDirectMatch(friend) {
    setPartner(friend.email);
    setPartnerName(friend.name);
    setIsDirectChat(true);
    setScreen("direct");
  }

  function handleMatched(pEmail, roomName, peerId, pName, pGender, isDirect = false) {
    setPartner(pEmail);
    setPartnerName(pName);
    setPartnerGender(pGender);
    setRoom(roomName);
    setPartnerId(peerId);
    setIsDirectChat(isDirect);
    setFlashKey(k => k + 1);
    setScreen("chat");
  }

  function handleSkip() {
    if (isDirectChat) {
      setScreen("dashboard");
    } else {
      setScreen("matching");
    }
    setPartner("");
    setRoom("");
    setPartnerId("");
    setPartnerName("");
    setPartnerGender("");
  }

  function handleEnd() {
    setScreen("dashboard");
  }

  if (isInitializing) {
      return (
        <div className="interior waiting">
           <main className="waiting-body" aria-live="polite">
             <span className="lamp lamp-pulse" style={{ width: 20, height: 20, marginBottom: 24 }} />
             <p className="label" style={{ color: "var(--text-2)" }}>Opening the booth…</p>
           </main>
           {isWakingServer && <ServerWakeupUI />}
        </div>
      );
  }

  return (
    <>
      {isWakingServer && <ServerWakeupUI />}
      {flashKey > 0 && <div key={flashKey} className="flash" aria-hidden="true" />}
      {screen === "landing" && <LandingScreen onLogin={handleLogin} onWakeup={setIsWakingServer} />}
      {screen === "dashboard" && (
        <DashboardScreen
          user={currentUser}
          friends={friends}
          onlineUsers={onlineUsers}
          onStartMatch={handleStartMatch}
          onStartDirectMatch={handleStartDirectMatch}
          onLogout={handleLogout}
        />
      )}
      {screen === "matching" && (
        <MatchingScreen
          userEmail={currentUser.email}
          userName={currentUser.name}
          userGender={currentUser.gender}
          onMatched={handleMatched}
          onCancel={() => setScreen("dashboard")}
        />
      )}
      {screen === "direct" && (
        <DirectMatchingScreen
          userEmail={currentUser.email}
          userName={currentUser.name}
          userGender={currentUser.gender}
          friendEmail={partner}
          friendName={partnerName}
          onMatched={handleMatched}
          onCancel={() => setScreen("dashboard")}
        />
      )}
      {screen === "chat" && (
        <ChatScreen
          userEmail={currentUser.email}
          userName={currentUser.name}
          userGender={currentUser.gender}
          partner={partner}
          partnerName={partnerName}
          partnerGender={partnerGender}
          room={room}
          partnerId={partnerId}
          isDirect={isDirectChat}
          onSkip={handleSkip}
          onEnd={handleEnd}
        />
      )}
    </>
  );
}
