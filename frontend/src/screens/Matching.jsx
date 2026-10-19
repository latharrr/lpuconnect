import { useEffect, useState } from 'react';
import { X, RotateCcw, ThumbsUp, ThumbsDown, Flag } from 'lucide-react';
import ReportModal from './chat/ReportModal.jsx';
import Wordmark from '../components/Wordmark.jsx';
import { getSocket, call } from '../lib/socket.js';
import { track } from '../lib/analytics.js';
import { useT } from '../lib/i18n-context.js';

const TIPS = ['match.tip1', 'match.tip2', 'match.tip3', 'match.tip4'];

function Feedback({ onDone, onReport }) {
    const t = useT();
    const [sent, setSent] = useState(false);
    const rate = (rating) => { track('feedback', { rating }); setSent(true); setTimeout(onDone, 1200); };
    return (
        <div className="feedback" role="group" aria-label={t('fb.title')}>
            {sent ? <span className="label">{t('fb.thanks')}</span> : (
                <>
                    <span>{t('fb.title')}</span>
                    <button className="btn btn-quiet btn-icon" aria-label={t('fb.good')} onClick={() => rate(1)}><ThumbsUp /></button>
                    <button className="btn btn-quiet btn-icon" aria-label={t('fb.bad')} onClick={() => rate(-1)}><ThumbsDown /></button>
                    {onReport && <button className="btn btn-ghost" onClick={onReport}><Flag /> {t('report.title')}</button>}
                </>
            )}
        </div>
    );
}

export default function Matching({ userName, interests, lastRoom, onMatched, onCancel }) {
    const t = useT();
    const [status, setStatus] = useState(null);
    const [timedOut, setTimedOut] = useState(false);
    const [tip, setTip] = useState(0);
    const [feedback, setFeedback] = useState(!!lastRoom);
    const [reporting, setReporting] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const s = getSocket();
        if (!s) return undefined;
        const onMatch = (m) => onMatched(m);
        const onStatus = (q) => setStatus(q);
        const onTimeout = () => setTimedOut(true);
        s.on('matched', onMatch);
        s.on('queue_status', onStatus);
        s.on('search_timeout', onTimeout);
        const start = () => call('start_chat', { interests }).then(r => { if (r?.online) setStatus({ waiting: r.waiting, online: r.online }); });
        if (s.connected) start();
        s.on('connect', start);
        return () => {
            s.off('matched', onMatch);
            s.off('queue_status', onStatus);
            s.off('search_timeout', onTimeout);
            s.off('connect', start);
        };
    }, [attempt, interests, onMatched]);

    useEffect(() => {
        const iv = setInterval(() => setTip(i => (i + 1) % TIPS.length), 6000);
        return () => clearInterval(iv);
    }, []);

    function cancel() {
        call('cancel_match');
        onCancel();
    }

    return (
        <div className="interior waiting">
            <header className="topbar">
                <Wordmark />
                <button className="btn btn-quiet" onClick={cancel}><X /> {t('match.cancel')}</button>
            </header>

            <main className="waiting-body" aria-live="polite">
                {timedOut ? (
                    <>
                        <div className="ready-lamps" aria-hidden="true"><span className="lamp" data-off="true" /><span className="lamp" data-off="true" /><span className="lamp" data-off="true" /></div>
                        <h1 className="display">{t('match.timeoutTitle')}</h1>
                        <p>{t('match.timeoutBody')}</p>
                        <button className="btn btn-red" style={{ marginTop: 24 }} onClick={() => { setTimedOut(false); setAttempt(a => a + 1); }}>
                            <RotateCcw /> {t('match.retry')}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="ready-lamps" aria-hidden="true"><span className="lamp" /><span className="lamp" /><span className="lamp" /></div>
                        <h1 className="display">{t('match.title')}</h1>
                        <p>{t('match.body')}</p>
                        {status && <p className="queue label tabular">{t('match.queue', { waiting: status.waiting, online: status.online })}</p>}
                        <p className="tip" key={tip}>{t(TIPS[tip])}</p>
                    </>
                )}
                <p className="who label">{t('match.you')} <strong>{userName}</strong></p>
                {feedback && <Feedback onDone={() => setFeedback(false)} onReport={lastRoom ? () => setReporting(true) : null} />}
            </main>
            {reporting && <ReportModal room={lastRoom} isDirect={false} onClose={() => setReporting(false)} onDone={() => { setReporting(false); setFeedback(false); }} />}
        </div>
    );
}
