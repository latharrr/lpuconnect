// Camera/mic access with specific, fixable failure messages.
export class MediaError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
}

const MESSAGES = {
    denied: 'Camera or mic permission is blocked. Allow it in your browser or app settings, then try again.',
    nodevice: 'No camera or microphone was found on this device.',
    inuse: 'Your camera or mic is being used by another app. Close it and try again.',
    unsupported: "This browser can't do video calls. Try the latest Chrome.",
    insecure: 'Video calls need a secure (https) connection.',
};

function classify(err) {
    switch (err?.name) {
        case 'NotAllowedError': case 'SecurityError': case 'PermissionDeniedError': return 'denied';
        case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError': return 'nodevice';
        case 'NotReadableError': case 'TrackStartError': case 'AbortError': return 'inuse';
        default: return 'unsupported';
    }
}

const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export async function getMedia({ audioOnly = false } = {}) {
    if (!window.isSecureContext) throw new MediaError('insecure', MESSAGES.insecure);
    if (!navigator.mediaDevices?.getUserMedia) throw new MediaError('unsupported', MESSAGES.unsupported);
    if (audioOnly) {
        try { return { stream: await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: false }), video: false }; }
        catch (err) { const k = classify(err); throw new MediaError(k, MESSAGES[k]); }
    }
    const attempts = [
        { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: AUDIO },
        { video: { facingMode: 'user' }, audio: AUDIO },
    ];
    let last;
    for (const c of attempts) {
        try { return { stream: await navigator.mediaDevices.getUserMedia(c), video: true }; }
        catch (err) {
            last = err;
            if (classify(err) === 'denied') break;
        }
    }
    // Camera missing or busy: fall back to voice so the call can still happen.
    if (classify(last) !== 'denied') {
        try { return { stream: await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: false }), video: false, fellBack: classify(last) }; }
        catch (err) { last = err; }
    }
    const kind = classify(last);
    throw new MediaError(kind, MESSAGES[kind]);
}

export function stopStream(stream) {
    stream?.getTracks().forEach(t => t.stop());
}
