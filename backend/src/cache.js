// Small in-process LRU with TTL. Hit rate is reported on /health.
export class LRU {
    constructor({ max = 1000, ttlMs = 30_000 } = {}) {
        this.max = max;
        this.ttlMs = ttlMs;
        this.map = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    get(key) {
        const hit = this.map.get(key);
        if (!hit || hit.exp < Date.now()) {
            if (hit) this.map.delete(key);
            this.misses++;
            return undefined;
        }
        this.map.delete(key);
        this.map.set(key, hit);
        this.hits++;
        return hit.value;
    }

    set(key, value) {
        this.map.delete(key);
        this.map.set(key, { value, exp: Date.now() + this.ttlMs });
        if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
        return value;
    }

    delete(key) { this.map.delete(key); }
    clear() { this.map.clear(); }

    stats() {
        const total = this.hits + this.misses;
        return { size: this.map.size, hitRate: total ? +(this.hits / total).toFixed(3) : null };
    }
}
