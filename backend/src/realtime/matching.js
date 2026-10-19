// Matchmaking queue. Insertion-ordered Map, so the longest waiter is tried first.
// Optional interest filters relax after prefFallbackMs so waits stay short.

export class MatchQueue {
    constructor({ canPair, onMatch, onTimeout, prefFallbackMs, searchTimeoutMs, recentPairMs }) {
        this.waiting = new Map(); // socketId -> entry
        this.recent = new Map();  // pairKey -> ts
        this.canPair = canPair;
        this.onMatch = onMatch;
        this.onTimeout = onTimeout;
        this.prefFallbackMs = prefFallbackMs;
        this.searchTimeoutMs = searchTimeoutMs;
        this.recentPairMs = recentPairMs;
    }

    get size() { return this.waiting.size; }
    has(socketId) { return this.waiting.has(socketId); }

    static pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

    remove(socketId) {
        const e = this.waiting.get(socketId);
        this.waiting.delete(socketId);
        return e || null;
    }

    // A user is only ever in the queue once, whichever tab they search from.
    removeEmail(email) {
        for (const [id, e] of this.waiting) if (e.email === email) this.waiting.delete(id);
    }

    add(entry) {
        this.removeEmail(entry.email);
        const partner = this.findPartner(entry);
        if (partner) {
            this.waiting.delete(partner.socketId);
            this.pair(entry, partner);
            return true;
        }
        this.waiting.set(entry.socketId, entry);
        return false;
    }

    compatible(a, b, t) {
        if (a.email === b.email) return false;
        if (!b.isConnected() || !a.isConnected()) return false;
        const last = this.recent.get(MatchQueue.pairKey(a.email, b.email));
        if (last && t - last < this.recentPairMs) return false;
        if (a.interests.size && b.interests.size) {
            const relaxed = t - a.since >= this.prefFallbackMs || t - b.since >= this.prefFallbackMs;
            if (!relaxed && ![...a.interests].some(i => b.interests.has(i))) return false;
        }
        return this.canPair(a, b);
    }

    findPartner(entry, t = Date.now()) {
        for (const cand of this.waiting.values()) {
            if (cand.socketId === entry.socketId) continue;
            if (!cand.isConnected()) { this.waiting.delete(cand.socketId); continue; }
            if (this.compatible(entry, cand, t)) return cand;
        }
        return null;
    }

    pair(a, b) {
        const t = Date.now();
        this.recent.set(MatchQueue.pairKey(a.email, b.email), t);
        // Earlier waiter first, so wait times are attributed correctly.
        const [first, second] = a.since <= b.since ? [a, b] : [b, a];
        this.onMatch(first, second, t);
    }

    // Retries relaxed preferences, expires long searches, prunes the recent-pair memory.
    sweep(t = Date.now()) {
        for (const e of [...this.waiting.values()]) {
            if (!this.waiting.has(e.socketId)) continue;
            if (!e.isConnected()) { this.waiting.delete(e.socketId); continue; }
            if (t - e.since >= this.searchTimeoutMs) {
                this.waiting.delete(e.socketId);
                this.onTimeout(e);
                continue;
            }
            const p = this.findPartner(e, t);
            if (p) {
                this.waiting.delete(e.socketId);
                this.waiting.delete(p.socketId);
                this.pair(e, p);
            }
        }
        for (const [k, ts] of this.recent) if (t - ts >= this.recentPairMs) this.recent.delete(k);
    }
}
