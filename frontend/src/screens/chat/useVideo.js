import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, call } from '../../lib/socket.js';
import { getMedia, stopStream, MediaError } from '../../lib/media.js';
import { createCall } from '../../lib/rtc.js';
import { track } from '../../lib/analytics.js';
import { store, audioOnlyPref } from '../../lib/session.js';
import { useT } from '../../lib/i18n-context.js';

// Video call lifecycle: request/accept through the server, media, then a WebRTC call
// signalled over the authenticated socket.
export function useVideo(room, system) {
    const t = useT();
    const [state, setState] = useState('idle'); // idle | requesting | active
    const [incoming, setIncoming] = useState(false);
    const [explain, setExplain] = useState(null); // pending action after the permission explainer
    const [local, setLocal] = useState(null);
    const [remote, setRemote] = useState(null);
    const [muted, setMuted] = useState(false);
    const [camOff, setCamOff] = useState(false);
    const [poor, setPoor] = useState(false);
    const callRef = useRef(null);
    const localRef = useRef(null);
    const pending = useRef([]);
    const poorTimer = useRef(null);

    const cleanup = useCallback(() => {
        callRef.current?.close();
        callRef.current = null;
        stopStream(localRef.current);
        localRef.current = null;
        pending.current = [];
        clearTimeout(poorTimer.current);
        setLocal(null); setRemote(null); setState('idle'); setMuted(false); setCamOff(false); setPoor(false);
    }, []);

    const start = useCallback(async (initiator) => {
        try {
            const media = await getMedia({ audioOnly: audioOnlyPref() });
            if (!media.video && !audioOnlyPref()) system(t('sys.voiceFallback'));
            localRef.current = media.stream;
            setLocal(media.stream);
            setCamOff(!media.video);
            setState('active');
            system(t('sys.videoStarted'));
            callRef.current = await createCall({
                room, initiator, localStream: media.stream,
                onRemoteStream: setRemote,
                onState: (s) => {
                    clearTimeout(poorTimer.current);
                    if (s === 'disconnected') poorTimer.current = setTimeout(() => setPoor(true), 4000);
                    if (s === 'connected') setPoor(false);
                },
            });
            for (const sig of pending.current.splice(0)) callRef.current.handleSignal(sig);
        } catch (err) {
            if (err instanceof MediaError) {
                track('permission_denied', { kind: err.kind });
                system(err.message);
            } else {
                track('webrtc_fail', { state: 'setup' });
            }
            call('video_end', { room });
            cleanup();
        }
    }, [room, system, t, cleanup]);

    useEffect(() => {
        const s = getSocket();
        if (!s) return undefined;
        const mine = (h) => (p = {}) => { if (p.room === room) h(p); };
        const on = {
            video_request: mine(() => setIncoming(true)),
            video_reject: mine(() => { setState('idle'); system(t('sys.videoDeclined')); }),
            video_start: mine(p => start(!!p.initiator)),
            video_end: mine(() => { cleanup(); system(t('sys.videoEnded')); }),
            rtc_signal: mine(p => { if (callRef.current) callRef.current.handleSignal(p.data); else pending.current.push(p.data); }),
        };
        for (const [ev, fn] of Object.entries(on)) s.on(ev, fn);
        return () => { for (const [ev, fn] of Object.entries(on)) s.off(ev, fn); };
    }, [room, start, cleanup, system, t]);

    useEffect(() => () => cleanup(), [cleanup]);

    // Explain before the browser's own permission prompt, once per device.
    const withExplainer = (fn) => {
        if (store.get('uc_cam_explained') === '1') return fn();
        setExplain(() => fn);
    };

    async function request() {
        withExplainer(async () => {
            const r = await call('video_request', { room });
            if (r.error) return;
            setState('requesting');
            system(t('sys.videoAsked'));
        });
    }

    function respond(accept) {
        setIncoming(false);
        if (!accept) { call('video_respond', { room, accept: false }); return; }
        withExplainer(() => call('video_respond', { room, accept: true }));
    }

    function confirmExplainer() {
        store.set('uc_cam_explained', '1');
        const fn = explain;
        setExplain(null);
        fn?.();
    }

    function end() {
        call('video_end', { room });
        cleanup();
        system(t('sys.videoEnded'));
    }

    function toggleMute() {
        const track0 = localRef.current?.getAudioTracks()[0];
        if (track0) { track0.enabled = !track0.enabled; setMuted(!track0.enabled); }
    }

    function toggleCam() {
        const v = localRef.current?.getVideoTracks()[0];
        if (v) { v.enabled = !v.enabled; setCamOff(!v.enabled); }
    }

    function voiceOnly() {
        const v = localRef.current?.getVideoTracks()[0];
        if (v) { v.enabled = false; setCamOff(true); }
        callRef.current?.setMaxKbps(50);
        setPoor(false);
        track('audio_only', { on: true, from: 'poor_network' });
    }

    return {
        state, incoming, explain: !!explain, local, remote, muted, camOff, poor,
        request, respond, confirmExplainer, cancelExplainer: () => setExplain(null), end, toggleMute, toggleCam, voiceOnly,
    };
}
