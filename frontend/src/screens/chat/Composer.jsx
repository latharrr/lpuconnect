import { forwardRef } from 'react';
import { Send, Video, LoaderCircle } from 'lucide-react';
import { useT } from '../../lib/i18n-context.js';

const Composer = forwardRef(function Composer({ value, onChange, onSend, chat, video }, ref) {
    const t = useT();
    return (
        <form className="composer" onSubmit={e => { e.preventDefault(); onSend(); }}>
            <label htmlFor="msg" className="sr-only">{t('chat.message')}</label>
            <input id="msg" ref={ref} value={value} onChange={e => onChange(e.target.value)}
                placeholder={t('chat.placeholder')} autoComplete="off" maxLength={2000} enterKeyHint="send" />
            <button type="submit" className="btn btn-red btn-icon" aria-label={t('chat.send')} disabled={!value.trim()}><Send /></button>
            {video.state === 'idle' && (chat.videoLockedFor > 0
                ? <span className="video-wait tabular" title={t('chat.videoIn', { n: chat.videoLockedFor })}><Video aria-hidden="true" /> {chat.videoLockedFor}s</span>
                : <button type="button" className="btn btn-quiet btn-icon" onClick={video.request} aria-label={t('chat.startVideo')} title={t('chat.startVideo')}><Video /></button>)}
            {video.state === 'requesting' && <span className="video-wait"><LoaderCircle className="spin" aria-hidden="true" /> {t('chat.calling')}</span>}
        </form>
    );
});

export default Composer;
