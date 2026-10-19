// Abuse guards: per-socket token buckets and a message flagger.

export class TokenBucket {
    constructor(capacity, refillPerSec) {
        this.capacity = capacity;
        this.refill = refillPerSec;
        this.tokens = capacity;
        this.last = Date.now();
    }

    take(n = 1) {
        const t = Date.now();
        this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refill);
        this.last = t;
        if (this.tokens < n) return false;
        this.tokens -= n;
        return true;
    }
}

// Limits per socket. Exceeding a limit drops the event; repeated abuse disconnects.
export const SOCKET_LIMITS = {
    send_message: [10, 5],         // burst 10, 5 per second
    start_chat: [5, 20 / 60],      // 20 per minute
    skip: [6, 10 / 60],            // anti skip-churn
    report: [3, 3 / 60],
    default: [30, 10],
};

export function socketLimiter() {
    const buckets = new Map();
    let strikes = 0;
    return {
        allow(event) {
            const key = SOCKET_LIMITS[event] ? event : 'default';
            let b = buckets.get(key);
            if (!b) { b = new TokenBucket(...SOCKET_LIMITS[key]); buckets.set(key, b); }
            if (b.take()) return true;
            strikes++;
            return false;
        },
        get strikes() { return strikes; },
    };
}

// Flags, never stores. Returns the categories that matched.
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|net|org|io|me|co|ly|gg|xyz)\b/i;
const PHONE = /(?:\+?\d[\s-]?){10,13}/;
const HANDLE = /(?:^|\s)@[a-z0-9_.]{3,}|\b(?:insta|instagram|snap|snapchat|telegram|whatsapp)\b/i;
// Short, conservative list; extend via SLUR_WORDS (comma separated) without a deploy.
const SLURS = (process.env.SLUR_WORDS || 'randi,chutiya,madarchod,bhenchod,behenchod,faggot,retard,nigger')
    .split(',').map(s => s.trim()).filter(Boolean);
const SLUR_RE = SLURS.length ? new RegExp(`\\b(?:${SLURS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i') : null;

export function flagMessage(text) {
    const flags = [];
    if (LINK.test(text)) flags.push('link');
    if (PHONE.test(text)) flags.push('phone');
    if (HANDLE.test(text)) flags.push('handle');
    if (SLUR_RE && SLUR_RE.test(text)) flags.push('slur');
    return flags;
}
