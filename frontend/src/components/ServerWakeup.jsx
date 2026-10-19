import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n-context.js';

export default function ServerWakeup() {
    const t = useT();
    const [timeLeft, setTimeLeft] = useState(60);
    useEffect(() => {
        const iv = setInterval(() => setTimeLeft(s => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(iv);
    }, []);
    // The lamp warms from dull to full as the server spins up.
    const warmth = (60 - timeLeft) / 60;
    return (
        <div className="wake waiting" role="alertdialog" aria-live="polite" aria-labelledby="wake-title">
            <div className="waiting-body">
                <span className="lamp wake-lamp" style={{
                    opacity: 0.35 + warmth * 0.65,
                    boxShadow: `0 0 ${16 + warmth * 48}px ${4 + warmth * 12}px rgba(255,181,71,${0.25 + warmth * 0.45})`,
                }} />
                <h1 id="wake-title" className="display">{t('wake.title')}</h1>
                <p>{t('wake.body')}</p>
                <div className="wake-count tabular" aria-label={`${timeLeft}s`}>0:{String(timeLeft).padStart(2, '0')}</div>
                <div className="label" style={{ color: 'var(--text-3)' }}>{t('wake.est')}</div>
                <p className="who">{t('wake.keep')}</p>
            </div>
        </div>
    );
}
