// One-to-one WebRTC call. Offers, answers and ICE candidates travel over the
// authenticated socket (rtc_signal), only inside the room the server authorised.
import { api } from './api.js';
import { call } from './socket.js';
import { track } from './analytics.js';

let iceCache = null;

async function iceServers() {
    if (iceCache && iceCache.exp > Date.now()) return iceCache.servers;
    try {
        const r = await api('/api/turn');
        iceCache = { servers: r.iceServers, exp: Date.now() + (r.ttl - 120) * 1000 };
        return r.iceServers;
    } catch {
        return [{ urls: ['stun:stun.l.google.com:19302'] }];
    }
}

export async function createCall({ room, initiator, localStream, onRemoteStream, onState, maxKbps = 600 }) {
    const pc = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' });
    const pending = [];
    let restarted = false;
    let closed = false;

    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.ontrack = (e) => onRemoteStream(e.streams[0]);
    pc.onicecandidate = (e) => { if (e.candidate) call('rtc_signal', { room, data: { candidate: e.candidate.toJSON() } }); };
    pc.onconnectionstatechange = async () => {
        const s = pc.connectionState;
        onState?.(s);
        if (s === 'connected') capBitrate(pc, maxKbps);
        if (s === 'failed') {
            track('webrtc_fail', { state: s, restarted });
            if (initiator && !restarted) { restarted = true; await offer({ iceRestart: true }); }
        }
    };

    async function offer(opts) {
        const o = await pc.createOffer(opts);
        await pc.setLocalDescription(o);
        call('rtc_signal', { room, data: { sdp: pc.localDescription.toJSON() } });
    }

    async function handleSignal(data) {
        if (closed || !data) return;
        try {
            if (data.sdp) {
                await pc.setRemoteDescription(data.sdp);
                while (pending.length) await pc.addIceCandidate(pending.shift());
                if (data.sdp.type === 'offer') {
                    await pc.setLocalDescription(await pc.createAnswer());
                    call('rtc_signal', { room, data: { sdp: pc.localDescription.toJSON() } });
                }
            } else if (data.candidate) {
                if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
                else pending.push(data.candidate);
            }
        } catch {
            track('webrtc_fail', { state: 'signal_error' });
        }
    }

    if (initiator) await offer();

    return {
        handleSignal,
        setMaxKbps: (k) => capBitrate(pc, k),
        close() { closed = true; pc.getSenders().forEach(s => s.track && s.track.stop()); pc.close(); },
    };
}

function capBitrate(pc, kbps) {
    for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue;
        const p = sender.getParameters();
        if (!p.encodings?.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = kbps * 1000;
        sender.setParameters(p).catch(() => {});
    }
}
