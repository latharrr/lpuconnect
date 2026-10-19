import { Flag, SkipForward, DoorOpen, BadgeCheck } from 'lucide-react';
import Print from '../../components/Print.jsx';
import { useT } from '../../lib/i18n-context.js';

export default function ChatHeader({ chat, onReport }) {
    const t = useT();
    const { partner, friend, isDirect, secondsLeft, partnerAway, offline } = chat;
    const friends = friend === 'friends';
    const name = friends ? partner.name : (partner.alias || t('chat.student'));
    const mins = secondsLeft === null ? null : String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const secs = secondsLeft === null ? null : String(secondsLeft % 60).padStart(2, '0');
    const status = offline ? t('chat.reconnecting')
        : partnerAway !== null ? t('chat.partnerReconnecting', { n: partnerAway })
        : isDirect ? t('chat.onlineDirect') : friends ? t('chat.onlineFriend') : t('chat.onlineAnon');

    return (
        <header className="chat-head">
            <div className="chat-who">
                <Print name={friends ? partner.name : ''} size={44} latent={!friends} />
                <div style={{ minWidth: 0 }}>
                    <div className="chat-who-name">
                        {name}
                        {friends && partner.verified && <BadgeCheck className="verified-icon" aria-label={t('dash.verified')} />}
                    </div>
                    <div className="chat-who-sub" aria-live="polite">
                        <span className="live-dot" data-off={offline || partnerAway !== null} aria-hidden="true" />
                        <span>{status}</span>
                    </div>
                </div>
            </div>
            <div className="chat-actions">
                {secondsLeft !== null && (
                    <div className="timer tabular" data-low={secondsLeft < 60} role="timer" aria-label={`${mins}:${secs}`}>
                        <b>{mins}:{secs}</b>
                        <span>{t('timer.left')}</span>
                    </div>
                )}
                <button className="btn btn-ghost btn-icon" onClick={onReport} aria-label={t('chat.report')} title={t('chat.report')}><Flag /></button>
                <button className="btn btn-quiet" onClick={chat.actions.skip} aria-label={isDirect ? t('chat.leave') : t('chat.skip')}>
                    {isDirect ? <><DoorOpen /><span className="skip-label">{t('chat.leave')}</span></> : <><SkipForward /><span className="skip-label">{t('chat.skip')}</span></>}
                </button>
            </div>
        </header>
    );
}
