import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import ServerWakeup from './components/ServerWakeup.jsx';
import Wordmark from './components/Wordmark.jsx';
import Landing from './screens/Landing.jsx';
import { useToast } from './components/toast-context.js';
import { api, bus } from './lib/api.js';
import { openSocket, closeSocket } from './lib/socket.js';
import { getToken, setToken, captureRef } from './lib/session.js';
import { COOKIE_AUTH } from './lib/config.js';
import { track } from './lib/analytics.js';
import { useT } from './lib/i18n-context.js';

// Screens after login are split out so the landing page loads fast.
const Dashboard = lazy(() => import('./screens/Dashboard.jsx'));
const Matching = lazy(() => import('./screens/Matching.jsx'));
const DirectCalling = lazy(() => import('./screens/DirectCalling.jsx'));
const Chat = lazy(() => import('./screens/chat/Chat.jsx'));
const Legal = lazy(() => import('./screens/Legal.jsx'));

const LEGAL = ['privacy', 'safety', 'terms'];

function Booting() {
    const t = useT();
    return (
        <div className="interior waiting">
            <main className="waiting-body" aria-live="polite">
                <span className="lamp lamp-pulse" style={{ width: 20, height: 20, marginBottom: 24 }} />
                <p className="label" style={{ color: 'var(--text-2)' }}>{t('boot.opening')}</p>
            </main>
        </div>
    );
}

function Banned({ message, onLogout }) {
    const t = useT();
    return (
        <div className="interior waiting">
            <header className="topbar"><Wordmark /></header>
            <main className="waiting-body">
                <h1 className="display">{t('banned.title')}</h1>
                <p>{t('banned.body')}</p>
                {message && <p className="who label">{message}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <a className="btn btn-quiet" href="/safety">{t('foot.safety')}</a>
                    <button className="btn btn-ghost" onClick={onLogout}>{t('dash.logout')}</button>
                </div>
            </main>
        </div>
    );
}

export default function App() {
    const legalPage = LEGAL.find(p => location.pathname === `/${p}`);
    const t = useT();
    const toast = useToast();
    const [phase, setPhase] = useState(() => (legalPage ? 'legal' : (!getToken() && !COOKIE_AUTH ? 'landing' : 'boot')));
    const [config, setConfig] = useState(null);
    const [user, setUser] = useState(null);
    const [friends, setFriends] = useState([]);
    const [onlineIds, setOnlineIds] = useState(() => new Set());
    const [screen, setScreen] = useState({ name: 'dashboard' });
    const [slow, setSlow] = useState(false);
    const [banMsg, setBanMsg] = useState('');
    const [flashKey, setFlashKey] = useState(0);
    const friendsRef = useRef(friends);
    useEffect(() => { friendsRef.current = friends; }, [friends]);

    const refreshFriends = useCallback(() => api('/api/me/friends').then(r => setFriends(r.friends)).catch(() => {}), []);

    const logout = useCallback(async (callServer = true) => {
        if (callServer) api('/api/auth/logout', { method: 'POST' }).catch(() => {});
        closeSocket();
        setToken(null);
        setUser(null);
        setFriends([]);
        setScreen({ name: 'dashboard' });
        setPhase('landing');
    }, []);

    const enter = useCallback((data) => {
        setToken(data.token, !COOKIE_AUTH);
        setUser(data.user);
        setFriends(data.friends || []);
        openSocket();
        setPhase('app');
        const direct = new URLSearchParams(location.search).get('direct');
        if (direct) {
            history.replaceState(null, '', location.pathname);
            const f = (data.friends || []).find(x => x.id === direct);
            if (f) setScreen({ name: 'direct', friend: f });
        }
    }, []);

    // Boot: config, then resume with the stored token if there is one.
    useEffect(() => {
        if (legalPage) return;
        const ref = captureRef();
        track('landing_view', { ref: !!ref, w: window.innerWidth });
        if (ref) track('ref_captured', {});
        api('/api/config', { auth: false }).then(setConfig).catch(() => setConfig({}));
        if (!getToken() && !COOKIE_AUTH) return;
        api('/api/auth/resume', { method: 'POST' })
            .then(enter)
            .catch((err) => { if (err.code !== 'banned') { setToken(null); setPhase('landing'); } });
    }, [legalPage, enter]);

    useEffect(() => {
        const onSlow = (e) => setSlow(e.detail);
        const onUnauth = () => logout(false);
        const onBanned = (e) => { setBanMsg(e.detail || ''); closeSocket(); setPhase('banned'); };
        bus.addEventListener('slow', onSlow);
        bus.addEventListener('unauthorized', onUnauth);
        bus.addEventListener('banned', onBanned);
        return () => {
            bus.removeEventListener('slow', onSlow);
            bus.removeEventListener('unauthorized', onUnauth);
            bus.removeEventListener('banned', onBanned);
        };
    }, [logout]);

    // App-wide socket events: presence, friend list changes, invites, kicks.
    useEffect(() => {
        if (phase !== 'app') return undefined;
        const s = openSocket();
        const on = {
            hello: (h) => setOnlineIds(new Set(h.onlineFriends)),
            presence: ({ id, online }) => setOnlineIds(prev => { const n = new Set(prev); if (online) n.add(id); else n.delete(id); return n; }),
            friends_changed: refreshFriends,
            direct_invite: ({ from }) => {
                const f = friendsRef.current.find(x => x.id === from.id) || from;
                toast(t('dash.invite_from', { name: from.name }), { action: t('dash.join'), ms: 15000, onAction: () => setScreen({ name: 'direct', friend: f }) });
            },
            kicked: ({ reason }) => {
                if (reason === 'suspended') { setPhase('banned'); closeSocket(); }
                else { toast(t(`kicked.${reason}`)); logout(false); }
            },
            connect_error: (err) => {
                if (err.message === 'unauthorized') logout(false);
                if (err.message === 'banned') { setPhase('banned'); closeSocket(); }
            },
            server_restart: () => toast(t('restart')),
        };
        for (const [ev, fn] of Object.entries(on)) s.on(ev, fn);
        return () => { for (const [ev, fn] of Object.entries(on)) s.off(ev, fn); };
    }, [phase, refreshFriends, logout, toast, t]);

    const onRandomMatched = useCallback((m) => {
        setFlashKey(k => k + 1);
        setScreen({ name: 'chat', session: { room: m.room, type: 'match', partner: m.partner, endsAt: m.endsAt, videoUnlockAt: m.videoUnlockAt, serverNow: m.serverNow } });
    }, []);

    const onDirectMatched = useCallback((m) => {
        setFlashKey(k => k + 1);
        setScreen({ name: 'chat', session: { room: m.room, type: 'direct', partner: m.partner, serverNow: m.serverNow } });
    }, []);

    const toDashboard = useCallback((reason) => {
        if (reason === 'not_friends') refreshFriends();
        setScreen({ name: 'dashboard' });
    }, [refreshFriends]);

    const screenRef = useRef(screen);
    useEffect(() => { screenRef.current = screen; }, [screen]);
    const interestsRef = useRef([]);

    const onEnded = useCallback((reason, byPartner) => {
        const session = screenRef.current.session;
        if (byPartner) toast(t(`chat.left.${reason}`));
        if (!session || session.type === 'direct') {
            refreshFriends();
            setScreen({ name: 'dashboard' });
            return;
        }
        const reportable = !['report', 'block'].includes(reason);
        setScreen({ name: 'matching', interests: interestsRef.current, lastRoom: reportable ? session.room : null });
    }, [refreshFriends, toast, t]);

    if (phase === 'legal') return <Suspense fallback={<Booting />}><Legal page={legalPage} /></Suspense>;

    let body;
    if (phase === 'boot') body = <Booting />;
    else if (phase === 'landing') body = <Landing config={config} onAuthed={enter} />;
    else if (phase === 'banned') body = <Banned message={banMsg} onLogout={() => logout()} />;
    else if (screen.name === 'matching') {
        body = <Matching key={screen.lastRoom || 'm'} userName={user.name} interests={screen.interests || []} lastRoom={screen.lastRoom}
            onMatched={onRandomMatched} onCancel={toDashboard} />;
    } else if (screen.name === 'direct') {
        body = <DirectCalling userName={user.name} friend={screen.friend} onMatched={onDirectMatched} onCancel={toDashboard} />;
    } else if (screen.name === 'chat') {
        body = <Chat key={screen.session.room} session={screen.session} onEnded={onEnded} />;
    } else {
        body = <Dashboard user={user} friends={friends} onlineIds={onlineIds} config={config}
            onUser={setUser} onFriends={setFriends}
            onStartMatch={(interests) => { interestsRef.current = interests; setScreen({ name: 'matching', interests }); }}
            onStartDirect={(friend) => setScreen({ name: 'direct', friend })}
            onLogout={() => logout()} onDeleted={() => logout(false)} />;
    }

    return (
        <>
            {slow && <ServerWakeup />}
            {flashKey > 0 && <div key={flashKey} className="flash" aria-hidden="true" />}
            <Suspense fallback={<Booting />}>{body}</Suspense>
        </>
    );
}
