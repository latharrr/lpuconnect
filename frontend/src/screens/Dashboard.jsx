import { useState } from 'react';
import { ArrowRight, LogOut, BadgeCheck, Share2 } from 'lucide-react';
import Print from '../components/Print.jsx';
import Wordmark from '../components/Wordmark.jsx';
import FriendList from './FriendList.jsx';
import Settings from './Settings.jsx';
import { api } from '../lib/api.js';
import { track } from '../lib/analytics.js';
import { useT } from '../lib/i18n-context.js';
import { useToast } from '../components/toast-context.js';

export default function Dashboard({ user, friends, onlineIds, config, onUser, onFriends, onStartMatch, onStartDirect, onLogout, onDeleted }) {
    const t = useT();
    const toast = useToast();
    const [bio, setBio] = useState(user.bio || '');
    const [bioState, setBioState] = useState('');
    const [interests, setInterests] = useState(user.interests || []);

    async function saveBio() {
        if (bio === (user.bio || '')) return;
        setBioState('saving');
        try {
            const r = await api('/api/me', { method: 'PATCH', body: { bio } });
            onUser(r.user);
            setBioState('saved');
        } catch (err) {
            setBioState('');
            toast(err.message);
        }
    }

    async function toggleInterest(i) {
        const next = interests.includes(i) ? interests.filter(x => x !== i) : [...interests, i].slice(0, 5);
        setInterests(next);
        try { onUser((await api('/api/me', { method: 'PATCH', body: { interests: next } })).user); } catch (err) { toast(err.message); }
    }

    async function invite() {
        const url = `${location.origin}/?ref=invite`;
        track('invite_shared', { via: navigator.share ? 'share' : 'copy' });
        try {
            if (navigator.share) await navigator.share({ title: 'LpuTV', text: t('landing.promise'), url });
            else { await navigator.clipboard.writeText(url); toast(t('dash.inviteCopied')); }
        } catch { /* share sheet dismissed */ }
    }

    return (
        <div className="interior">
            <header className="topbar">
                <Wordmark />
                <button className="btn btn-ghost" onClick={onLogout}><LogOut /> {t('dash.logout')}</button>
            </header>

            <main className="dash">
                <div className="dash-left">
                    <section aria-label="Your profile">
                        <div className="me">
                            <Print name={user.name} size={96} />
                            <div style={{ minWidth: 0 }}>
                                <h1 className="display me-name">{user.name}</h1>
                                <div className="me-meta label">
                                    <span>{t(`gender.${user.gender}`)}</span>
                                    {user.verified && <span className="verified"><BadgeCheck aria-hidden="true" /> {t('dash.verified')}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="bio">
                            <label className="field-label label" htmlFor="bio">{t('dash.bio')}</label>
                            <textarea id="bio" value={bio} maxLength={config?.bioMax || 200}
                                onChange={e => { setBio(e.target.value); setBioState(''); }}
                                onBlur={saveBio} placeholder={t('dash.bioPlaceholder')} />
                            <div className="bio-status" aria-live="polite">
                                <span>{t('dash.bioHint')}</span>
                                <span className="tabular">
                                    {bioState === 'saving' ? t('dash.saving') : bioState === 'saved' ? <span data-state="saved">{t('dash.saved')}</span> : `${bio.length}/${config?.bioMax || 200}`}
                                </span>
                            </div>
                        </div>

                        {config?.interests?.length > 0 && (
                            <fieldset className="interests">
                                <legend className="field-label label">{t('dash.interests')}</legend>
                                <div className="chips">
                                    {config.interests.map(i => (
                                        <button key={i} type="button" className="chip" aria-pressed={interests.includes(i)} onClick={() => toggleInterest(i)}>{i}</button>
                                    ))}
                                </div>
                                <p className="hint">{t('dash.interestsHint')}</p>
                            </fieldset>
                        )}
                    </section>

                    <section className="stepin" aria-labelledby="stepin-title">
                        <div className="plate">
                            <h2 id="stepin-title" className="display">{t('dash.random')}</h2>
                            <p>{t('dash.randomBody')}</p>
                            <button className="btn-go" onClick={() => onStartMatch(interests)}>{t('landing.stepIn')} <ArrowRight /></button>
                        </div>
                    </section>
                </div>

                <div className="dash-right">
                    <FriendList friends={friends} onlineIds={onlineIds} onChat={onStartDirect} onFriends={onFriends} onInvite={invite} />
                    {friends.length > 0 && <button className="btn btn-quiet invite-btn" onClick={invite}><Share2 /> {t('dash.invite')}</button>}
                    <Settings config={config} onDeleted={onDeleted} />
                </div>
            </main>
        </div>
    );
}
