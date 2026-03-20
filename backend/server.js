import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ExpressPeerServer } from 'peer';
import { OAuth2Client } from 'google-auth-library';
import { dbrun, dbget, dball } from './db.js';

const CLIENT_ID = '184945357599-gsm4f58m1t25gsqp22mh7stl6i6i6va9.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

const app = express();
app.use(cors());
app.use(express.json());
const server = createServer(app);

// Initialize PeerJS server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/',
});
app.use('/peerjs', peerServer);

const io = new Server(server, {
  cors: {
    origin: "*", // allow frontend
    methods: ["GET", "POST"]
  }
});

let waitingUser = null;
const activeRooms = new Map();
const onlineUsers = new Map(); // socket.id -> email

function broadcastOnlineUsers() {
    // Get unique emails online
    const uniqueEmails = Array.from(new Set(onlineUsers.values()));
    io.emit('online_users', uniqueEmails);
}

// --- REST API ROUTES ---
app.post('/api/login/google', async (req, res) => {
    const { token, gender } = req.body;
    if (!token || !gender) return res.status(400).json({ error: "Missing token or gender" });

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { email, name } = payload;
        
        await dbrun(
            `INSERT INTO users (id, email, name, gender) VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET name=excluded.name, gender=excluded.gender`,
            [email, email, name, gender]
        );

        const user = await dbget(`SELECT * FROM users WHERE email = ?`, [email]);

        const friends = await dball(`
            SELECT u.email, u.name, u.gender, u.bio
            FROM friends f
            JOIN users u ON f.user_id_2 = u.email
            WHERE f.user_id_1 = ?
        `, [email]);

        res.json({ user, friends });
    } catch (err) {
        console.error("Google Login Error:", err);
        res.status(401).json({ error: "Invalid Google Token" });
    }
});

app.post('/api/login/guest', async (req, res) => {
    const { gender } = req.body;
    if (!gender) return res.status(400).json({ error: "Missing gender" });

    try {
        const randomId = Math.floor(10000 + Math.random() * 90000);
        const email = `guest${randomId}@uniconnect.local`;
        const name = `Guest ${randomId}`;
        
        await dbrun(
            `INSERT INTO users (id, email, name, gender) VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET name=excluded.name, gender=excluded.gender`,
            [email, email, name, gender]
        );

        const user = await dbget(`SELECT * FROM users WHERE email = ?`, [email]);
        const friends = []; // Brand new guest users won't have friends yet

        res.json({ user, friends });
    } catch (err) {
        console.error("Guest Login Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/login/resume', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });

    try {
        const user = await dbget(`SELECT * FROM users WHERE email = ?`, [email]);
        if (!user) return res.status(404).json({ error: "User not found" });

        const friends = await dball(`
            SELECT u.email, u.name, u.gender, u.bio
            FROM friends f
            JOIN users u ON f.user_id_2 = u.email
            WHERE f.user_id_1 = ?
        `, [email]);

        res.json({ user, friends });
    } catch (err) {
        console.error("Resume Login Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/api/profile/bio', async (req, res) => {
    const { email, bio } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });

    try {
        await dbrun(`UPDATE users SET bio = ? WHERE email = ?`, [bio || "", email]);
        res.json({ success: true });
    } catch (err) {
        console.error("Bio Update Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// -----------------------

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Register user email for online status
  socket.on('register_user', (email) => {
      if (email) {
          onlineUsers.set(socket.id, email);
          broadcastOnlineUsers();
      }
  });

  socket.on('start_chat', (data) => {
    const { email, peerId, name, gender } = data;
    
    // Check if someone is waiting in the queue and it's NOT the same user
    if (waitingUser && waitingUser.peerId !== peerId) {
        // Connect both users
        const roomName = `room-${socket.id}-${waitingUser.socket.id}`;
        
        // Join both sockets to the room
        socket.join(roomName);
        waitingUser.socket.join(roomName);
        
        // Send to waiting user specifically that they matched with the new user
        waitingUser.socket.emit('matched', {
            room: roomName,
            partnerId: peerId, // the ID of the new user joining
            partnerEmail: email,
            partnerName: name,
            partnerGender: gender
        });

        // Send to new user specifically that they matched with the waiting user
        socket.emit('matched', {
            room: roomName,
            partnerId: waitingUser.peerId, // the ID of the user already waiting
            partnerEmail: waitingUser.email,
            partnerName: waitingUser.name,
            partnerGender: waitingUser.gender
        });
        
        // Track room participants for database friend insertion
        activeRooms.set(roomName, { user1: email, user2: waitingUser.email });

        // Reset waiting user since they've been matched
        waitingUser = null;
        console.log(`Matched users in room ${roomName}`);
    } else if (!waitingUser || waitingUser.peerId === peerId) {
        // Put user in queue, avoiding immediate self-match
        waitingUser = {
            socket,
            email,
            peerId,
            name,
            gender
        };
        console.log(`User ${email} waiting for match with peerId ${peerId}`);
    }
  });

  // Direct Messaging
  socket.on('join_direct', (data) => {
    const { userEmail, friendEmail, userPeerId, userName, userGender } = data;
    
    // Create deterministic room name by sorting emails alphabetically
    const sortedEmails = [userEmail, friendEmail].sort();
    const roomName = `direct-${sortedEmails[0]}-${sortedEmails[1]}`;
    
    socket.join(roomName);

    // Track active direct users to pass peerIds later
    if (!activeRooms.has(roomName)) {
        activeRooms.set(roomName, { users: {} });
    }
    const roomState = activeRooms.get(roomName);
    if (!roomState.users) roomState.users = {};
    
    roomState.users[userEmail] = { peerId: userPeerId, name: userName, gender: userGender, socketId: socket.id };
    
    // Check if friend is already in room
    const friendData = roomState.users[friendEmail];
    
    if (friendData) {
        // Friend is online, cross-notify both
        socket.emit('direct_matched', {
            room: roomName,
            partnerId: friendData.peerId,
            partnerName: friendData.name,
            partnerEmail: friendEmail,
            partnerGender: friendData.gender
        });

        socket.to(friendData.socketId).emit('direct_matched', {
            room: roomName,
            partnerId: userPeerId,
            partnerName: userName,
            partnerEmail: userEmail,
            partnerGender: userGender
        });
    } else {
        // Just join and wait for friend to click
        socket.emit('direct_waiting', { room: roomName });
    }
    console.log(`User ${userEmail} joined direct room ${roomName}`);
  });

  socket.on('send_message', (data) => {
    const { room, text, from } = data;
    // Broadcast message to others in the room
    socket.to(room).emit('receive_message', { text, from, time: new Date() });
  });

  socket.on('skip', (data) => {
      const { room } = data;
      // Notify partner
      socket.to(room).emit('partner_skipped');
      socket.leave(room);
  });
  
  // Friend system signaling
  socket.on('friend_request', (data) => {
    socket.to(data.room).emit('friend_request');
  });

  socket.on('friend_accept', async (data) => {
    socket.to(data.room).emit('friend_accept');
    
    // Save to database as mutual friends when identities actually reveal
    const roomData = activeRooms.get(data.room);
    if (roomData) {
        let u1, u2;
        if (roomData.users) {
            // Direct room format
            const emails = Object.keys(roomData.users);
            u1 = emails[0]; u2 = emails[1];
        } else {
            // Match room format
            u1 = roomData.user1; u2 = roomData.user2;
        }
        
        if (u1 && u2) {
            try {
                // Insert both directions
                await dbrun(`INSERT OR IGNORE INTO friends (user_id_1, user_id_2) VALUES (?, ?)`, [u1, u2]);
                await dbrun(`INSERT OR IGNORE INTO friends (user_id_1, user_id_2) VALUES (?, ?)`, [u2, u1]);
                console.log(`Saved mutual friendship between ${u1} and ${u2}`);
            } catch (err) {
                console.error("Error saving friendship:", err);
            }
        }
    }
  });

  socket.on('friend_reject', (data) => {
    socket.to(data.room).emit('friend_reject');
  });

  // Mutual Enjoy events
  socket.on('enjoy_request', (data) => {
      socket.to(data.room).emit('enjoy_request');
  });

  socket.on('enjoy_accept', (data) => {
      socket.to(data.room).emit('enjoy_accept');
  });

  // Timer extension signaling
  socket.on('extend_request', (data) => {
      socket.to(data.room).emit('extend_request');
  });

  socket.on('extend_accept', (data) => {
      socket.to(data.room).emit('extend_accept');
  });

  socket.on('extend_reject', (data) => {
      socket.to(data.room).emit('extend_reject');
  });
  
  // WebRTC signaling
  socket.on('video_request', (data) => {
    socket.to(data.room).emit('video_request');
  });

  socket.on('video_accept', (data) => {
    socket.to(data.room).emit('video_accept');
  });

  socket.on('video_reject', (data) => {
    socket.to(data.room).emit('video_reject');
  });

  socket.on('end_video', (data) => {
    socket.to(data.room).emit('end_video');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (onlineUsers.has(socket.id)) {
        onlineUsers.delete(socket.id);
        broadcastOnlineUsers();
    }
    
    // Notify rooms about disconnection
    const rooms = Array.from(socket.rooms);
    // socket.rooms contains the socket.id itself, so filter it out
    rooms.filter(r => r !== socket.id).forEach(roomName => {
        socket.to(roomName).emit('partner_disconnected');
    });

    // Remove from queue if they disconnect while waiting
    if (waitingUser && waitingUser.socket.id === socket.id) {
        waitingUser = null;
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
