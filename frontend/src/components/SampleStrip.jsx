import { ThumbsUp, Clock } from 'lucide-react';
import { useT } from '../lib/i18n-context.js';

// Illustrative chat on CC0 campus photos (public/strip, origin embedded in each file).
const STRIP_FRAMES = [
    { img: '/strip/frame-1.jpg', msgs: [{ text: "worst class you're taking this sem?" }] },
    { img: '/strip/frame-2.jpg', msgs: [{ text: 'stats. 8am. every day.', me: true }, { text: 'no way, same' }] },
    { img: '/strip/frame-3.jpg', msgs: [{ text: 'where do you even get coffee that early' }] },
    { img: '/strip/frame-4.jpg', event: { icon: ThumbsUp, label: 'Both enjoyed' } },
    { img: '/strip/frame-5.jpg', event: { icon: Clock, label: '+10 min' } },
    { img: '/strip/frame-6.jpg', faces: ['AK', 'RM'] },
];

function StripFrame({ frame, n }) {
    const Icon = frame.event?.icon;
    return (
        <div className="frame">
            <img src={frame.img} alt="" loading="lazy" decoding="async" />
            <span className="frame-no tabular">{n}</span>
            {frame.msgs?.map((m, i) => <div key={i} className="frame-msg" data-me={!!m.me}>{m.text}</div>)}
            {frame.event && (
                <div className="frame-event">
                    <span className="frame-chip"><Icon aria-hidden="true" /><span className="label">{frame.event.label}</span></span>
                </div>
            )}
            {frame.faces && <div className="frame-faces">{frame.faces.map(f => <div key={f}>{f}</div>)}</div>}
        </div>
    );
}

// Strip feeds slowly out of the slot on a seamless loop (two identical runs).
export default function SampleStrip() {
    const t = useT();
    return (
        <div className="delivery" role="img" aria-label="Sample strip: an example chat where two strangers both enjoy it, extend the timer, and reveal names">
            <div className="slot" aria-hidden="true" />
            <div className="strip-window" aria-hidden="true">
                <div className="strip">
                    {[0, 1].map(run => (
                        <div className="strip-run" key={run}>
                            {STRIP_FRAMES.map((f, i) => <StripFrame key={i} frame={f} n={i + 1} />)}
                        </div>
                    ))}
                </div>
            </div>
            <p className="strip-caption label">{t('landing.sample')}</p>
        </div>
    );
}
