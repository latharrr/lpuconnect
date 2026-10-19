import { io } from 'socket.io-client';
import { API_URL, COOKIE_AUTH } from './config.js';
import { getToken, sessionId } from './session.js';

let socket = null;

// One socket per signed-in session, created only after login (the server refuses anonymous sockets).
export function openSocket() {
    if (socket) return socket;
    socket = io(API_URL, {
        auth: (cb) => cb({ token: getToken(), sessionId: sessionId() }),
        transports: ['polling', 'websocket'],
        withCredentials: COOKIE_AUTH,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20_000,
    });
    return socket;
}

export const getSocket = () => socket;

export function closeSocket() {
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
}

// emit with acknowledgement, as a promise with a timeout.
export function call(event, data = {}, timeoutMs = 8000) {
    return new Promise((resolve) => {
        if (!socket) return resolve({ error: 'offline' });
        socket.timeout(timeoutMs).emit(event, data, (err, res) => resolve(err ? { error: 'timeout' } : (res || {})));
    });
}
