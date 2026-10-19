import { Check, ThumbsUp, UserPlus } from 'lucide-react';
import { Rich } from '../../lib/i18n.jsx';
import { useT } from '../../lib/i18n-context.js';

// Two-step unlock (both enjoy, then both add) with one sentence saying whose move it is.
export default function ConsentRail({ chat }) {
    const t = useT();
    const { enjoy, friend, isDirect, actions } = chat;
    if (isDirect) return null;
    if (friend === 'friends') {
        return (
            <div className="rail" data-compact="true" aria-live="polite">
                <p className="rail-copy label"><Check aria-hidden="true" /> {t('rail.friends')}</p>
            </div>
        );
    }

    let copy; let buttons = null; let attention = false;
    if (friend === 'received') {
        attention = true;
        copy = 'rail.received';
        buttons = <>
            <button className="btn btn-quiet" onClick={() => actions.respondFriend(false)}>{t('rail.decline')}</button>
            <button className="btn btn-lamp" onClick={() => actions.respondFriend(true)}><Check /> {t('rail.accept')}</button>
        </>;
    } else if (friend === 'sent') {
        copy = 'rail.sent';
    } else if (enjoy === 'mutual') {
        copy = 'rail.mutual';
        buttons = <button className="btn btn-red" onClick={actions.addFriend}><UserPlus /> {t('rail.addFriend')}</button>;
    } else if (enjoy === 'received') {
        attention = true;
        copy = 'rail.theyEnjoy';
        buttons = <button className="btn btn-lamp" onClick={actions.enjoy}><ThumbsUp /> {t('rail.meToo')}</button>;
    } else if (enjoy === 'sent') {
        copy = 'rail.youEnjoy';
        buttons = <button className="btn btn-quiet" disabled><Check /> {t('rail.enjoying')}</button>;
    } else {
        copy = 'rail.ask';
        buttons = <button className="btn btn-quiet" onClick={actions.enjoy}><ThumbsUp /> {t('rail.enjoyThis')}</button>;
    }

    const enjoyStep = enjoy === 'mutual' ? 'done' : (enjoy === 'sent' || enjoy === 'received') ? 'half' : 'todo';
    const friendStep = (friend === 'sent' || friend === 'received') ? 'half' : 'todo';

    return (
        <div className="rail" data-attention={attention} aria-live="polite">
            <ol className="rail-steps" aria-label="Unlock progress">
                <li data-state={enjoyStep}>{t('rail.enjoy')}</li>
                <li data-state={friendStep}>{t('rail.reveal')}</li>
            </ol>
            <div className="rail-row">
                <p className="rail-copy"><Rich text={t(copy)} /></p>
                {buttons && <div className="rail-btns">{buttons}</div>}
            </div>
        </div>
    );
}
