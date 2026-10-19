import { useState } from 'react';
import { MessageCircle, MoreHorizontal, BadgeCheck, UserMinus, Ban } from 'lucide-react';
import Print from '../components/Print.jsx';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n-context.js';
import { useToast } from '../components/toast-context.js';

function ago(iso, lang = 'en') {
    if (!iso) return null;
    const diff = Date.now() - Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const mins = Math.round(diff / 60000);
    if (mins < 60) return rtf.format(-mins, 'minute');
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return rtf.format(-hrs, 'hour');
    return rtf.format(-Math.round(hrs / 24), 'day');
}

export default function FriendList({ friends, onlineIds, onChat, onFriends, onInvite }) {
    const t = useT();
    const toast = useToast();
    const [menu, setMenu] = useState(null);
    const online = friends.filter(f => onlineIds.has(f.id)).length;

    async function act(friend, kind) {
        const q = kind === 'block' ? t('dash.confirmBlock', { name: friend.name }) : t('dash.confirmRemove', { name: friend.name });
        setMenu(null);
        if (!window.confirm(q)) return;
        try {
            const r = kind === 'block'
                ? await api(`/api/me/friends/${friend.id}/block`, { method: 'POST' })
                : await api(`/api/me/friends/${friend.id}`, { method: 'DELETE' });
            onFriends(r.friends);
        } catch (err) { toast(err.message); }
    }

    // Online friends first, then most recent chat.
    const sorted = [...friends].sort((a, b) => (onlineIds.has(b.id) - onlineIds.has(a.id)));

    return (
        <section aria-labelledby="friends-title">
            <div className="friends-head">
                <h2 id="friends-title" className="display">{t('dash.friends')}</h2>
                <span className="label tabular">{friends.length === 0 ? t('dash.none') : t('dash.counts', { total: friends.length, online })}</span>
            </div>

            {friends.length === 0 ? (
                <div className="empty">
                    <div className="empty-frame" aria-hidden="true"><div /></div>
                    <div>
                        <h3>{t('dash.emptyTitle')}</h3>
                        <p>{t('dash.emptyBody')}</p>
                        <button className="btn btn-lamp" style={{ marginTop: 12 }} onClick={onInvite}>{t('dash.invite')}</button>
                    </div>
                </div>
            ) : (
                <ul className="friend-list">
                    {sorted.map(friend => {
                        const isOn = onlineIds.has(friend.id);
                        return (
                            <li key={friend.id} className="friend">
                                <Print name={friend.name} size={48} />
                                <div style={{ minWidth: 0 }}>
                                    <div className="friend-name">
                                        <span>{friend.name}</span>
                                        {friend.verified && <BadgeCheck className="verified-icon" aria-label={t('dash.verified')} />}
                                    </div>
                                    <div className="friend-sub">
                                        <span className="live-dot" data-off={!isOn} aria-hidden="true" />
                                        <span data-online={isOn}>{isOn ? t('dash.online') : (friend.lastChatAt ? t('dash.lastChat', { when: ago(friend.lastChatAt) }) : t('dash.offline'))}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{friend.bio || t('dash.noBio')}</span>
                                    </div>
                                </div>
                                <div className="friend-actions">
                                    <button className="btn btn-quiet" onClick={() => onChat(friend)} aria-label={`${t('dash.chat')}: ${friend.name}`}>
                                        <MessageCircle /> <span className="hide-sm">{t('dash.chat')}</span>
                                    </button>
                                    <button className="btn btn-ghost btn-icon" aria-haspopup="menu" aria-expanded={menu === friend.id}
                                        aria-label={`More: ${friend.name}`} onClick={() => setMenu(menu === friend.id ? null : friend.id)}>
                                        <MoreHorizontal />
                                    </button>
                                    {menu === friend.id && (
                                        <div className="menu" role="menu">
                                            <button role="menuitem" onClick={() => act(friend, 'remove')}><UserMinus /> {t('dash.remove')}</button>
                                            <button role="menuitem" onClick={() => act(friend, 'block')}><Ban /> {t('dash.block')}</button>
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
