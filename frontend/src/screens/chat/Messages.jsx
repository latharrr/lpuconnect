import { useEffect, useRef } from 'react';
import { Check, Clock, Sparkles } from 'lucide-react';
import { Rich } from '../../lib/i18n.jsx';
import { useT } from '../../lib/i18n-context.js';
import { track } from '../../lib/analytics.js';

const ICEBREAKERS = ['chat.ice1', 'chat.ice2', 'chat.ice3', 'chat.ice4', 'chat.ice5'];
const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function ExtendNotice({ chat }) {
    const t = useT();
    const { extend, actions } = chat;
    return (
        <div className="notice">
            <p>{extend === 'received' ? <Rich text={t('ext.received')} /> : extend === 'sent' ? t('ext.asked') : t('ext.prompt')}</p>
            <div className="notice-btns">
                {extend === 'none' && <button className="btn btn-lamp" onClick={actions.askExtend}><Clock /> {t('ext.ask')}</button>}
                {extend === 'received' && <>
                    <button className="btn btn-lamp" onClick={() => actions.respondExtend(true)}><Check /> {t('ext.yes')}</button>
                    <button className="btn btn-quiet" onClick={() => actions.respondExtend(false)}>{t('ext.no')}</button>
                </>}
                {extend !== 'received' && <button className="btn btn-ghost" onClick={actions.dismissExtend}>{t('ext.dismiss')}</button>}
            </div>
        </div>
    );
}

export default function Messages({ chat, onIcebreaker }) {
    const t = useT();
    const end = useRef(null);
    const { messages, isDirect, showExtend } = chat;
    const iSpoke = messages.some(m => m.from === 'me');
    useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, showExtend]);

    return (
        <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
            {messages.map(m => (m.from === 'system'
                ? <div key={m.id} className="sys"><span>{m.text}</span></div>
                : (
                    <div key={m.id} className="msg" data-from={m.from}>
                        <div className="bubble">{m.text}<time>{fmt(m.ts)}</time></div>
                    </div>
                )))}

            {!isDirect && !iSpoke && (
                <div className="icebreakers" aria-label={t('chat.icebreakers')}>
                    <p className="label"><Sparkles aria-hidden="true" /> {t('chat.icebreakers')}</p>
                    <div className="chips">
                        {ICEBREAKERS.slice(0, 3).map(k => (
                            <button key={k} className="chip" onClick={() => { track('icebreaker_used', { k }); onIcebreaker(t(k)); }}>{t(k)}</button>
                        ))}
                    </div>
                </div>
            )}

            {!isDirect && showExtend && <ExtendNotice chat={chat} />}
            <div ref={end} />
        </div>
    );
}
