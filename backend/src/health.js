// Event-loop lag sampler for /health and the admin Live page.
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

export function lagMs() {
    const v = Math.round(h.percentile(99) / 1e6);
    h.reset();
    return v;
}
