import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { ExpressPeerServer } from 'peer';

const app = express();
app.use(cors());
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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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
        
        // Reset queue
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

  socket.on('friend_accept', (data) => {
    socket.to(data.room).emit('friend_accept');
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
