import { useCallback, useEffect, useState } from 'react';
import { getSocket, call } from '../../lib/socket.js';
import { useT } from '../../lib/i18n-context.js';

let msgSeq = 0;
const msg = (from, text, ts = Date.now()) => ({ id: ++msgSeq, from, text, ts });

// All chat state. The server is the authority for every two-sided step; this hook only
// mirrors what it says and sends requests.
export function useChat(session, onEnded) {
    const t = useT();
    const { room, type } = session;
    const isDirect = type === 'direct';
    const [skew, setSkew] = useState(() => (session.serverNow ? session.serverNow - Date.now() : 0));

    const [messages, setMessages] = useState(() => [msg('system', isDirect
        ? t('chat.startDirect', { name: session.partner.name })
        : t('chat.start', { alias: session.partner.alias }))]);
    const [partner, setPartner] = useState(session.partner);
    const [enjoy, setEnjoy] = useState(isDirect ? 'mutual' : 'none');
    const [friend, setFriend] = useState(isDirect ? 'friends' : 'none');
    const [extend, setExtend] = useState('none');
    const [dismissed, setDismissed] = useState([]);
    const [endsAt, setEndsAt] = useState(session.endsAt || null);
    const [now, setNow] = useState(() => Date.now());
    const [partnerAway, setPartnerAway] = useState(null);
    const [offline, setOffline] = useState(false);

    const system = useCallback((text) => setMessages(m => [...m, msg('system', text)]), []);

    useEffect(() => {
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
    }, []);

    const secondsLeft = endsAt ? Math.max(0, Math.round((endsAt - (now + skew)) / 1000)) : null;
    const videoLockedFor = isDirect || friend === 'friends' ? 0 : Math.max(0, Math.ceil(((session.videoUnlockAt || 0) - (now + skew)) / 1000));

    // Offer more time once the chat passes 8, 6 and 2 minutes left, until dismissed.
    const activeMark = secondsLeft === null ? null : [120, 360, 480].find(m => secondsLeft <= m) ?? null;
    const showExtend = extend !== 'none' || (activeMark !== null && !dismissed.includes(activeMark));

    useEffect(() => {
        const s = getSocket();
        if (!s) return undefined;
        const mine = (h) => (p = {}) => { if (!p.room || p.room === room) h(p); };
        const handlers = {
            receive_message: mine(p => setMessages(m => [...m, msg('partner', p.text, p.ts)])),
            enjoy_request: mine(() => setEnjoy(e => (e === 'sent' ? e : 'received'))),
            enjoy_mutual: mine(() => { setEnjoy('mutual'); system(t('sys.enjoyMutual')); }),
            friend_request: mine(() => setFriend('received')),
            friend_reject: mine(() => { setFriend('none'); system(t('sys.friendDeclined')); }),
            revealed: mine(p => { setPartner(p.partner); setFriend('friends'); system(t('sys.revealed')); }),
            extend_request: mine(() => setExtend('received')),
            extend_accept: mine(p => {
                if (p.serverNow) setSkew(p.serverNow - Date.now());
                setEndsAt(p.endsAt); setExtend('none'); setDismissed([]); system(t('sys.extended'));
            }),
            extend_reject: mine(() => { setExtend('none'); system(t('sys.extendDeclined')); }),
            partner_reconnecting: mine(p => setPartnerAway(p.graceSec || 20)),
            partner_back: mine(() => { setPartnerAway(null); system(t('sys.partnerBack')); }),
            partner_left: mine(p => onEnded(p.reason || 'left', true)),
        };
        for (const [ev, fn] of Object.entries(handlers)) s.on(ev, fn);

        const onDisconnect = () => setOffline(true);
        const onConnect = () => {
            call('rejoin', { room }).then(r => {
                setOffline(false);
                if (r.error) onEnded('disconnect', true);
                else if (r.serverNow) setSkew(r.serverNow - Date.now());
            });
        };
        s.on('disconnect', onDisconnect);
        s.io.on('reconnect', onConnect);
        return () => {
            for (const [ev, fn] of Object.entries(handlers)) s.off(ev, fn);
            s.off('disconnect', onDisconnect);
            s.io.off('reconnect', onConnect);
        };
    }, [room, onEnded, system, t]);

    async function send(text) {
        const clean = text.trim();
        if (!clean) return false;
        const r = await call('send_message', { room, text: clean });
        if (r.error) { if (r.error !== 'rate_limited') system(t('offline')); return false; }
        setMessages(m => [...m, msg('me', clean, r.ts)]);
        return true;
    }

    const actions = {
        send,
        skip: () => { call('skip', { room }); onEnded(isDirect ? 'left' : 'skip', false); },
        enjoy: async () => {
            const r = await call('enjoy', { room });
            // The mutual event can land before this ack; never downgrade from it.
            if (r.ok) setEnjoy(e => (r.mutual ? 'mutual' : e === 'none' ? 'sent' : e));
        },
        addFriend: async () => {
            const r = await call('friend_request', { room });
            if (r.ok && !r.revealed) { setFriend(f => (f === 'none' ? 'sent' : f)); system(t('sys.friendSent')); }
        },
        respondFriend: async (accept) => {
            const r = await call('friend_respond', { room, accept });
            if (!accept && r.ok) { setFriend('none'); system(t('sys.friendDeclined')); }
        },
        askExtend: async () => { if ((await call('extend_request', { room })).ok) { setExtend('sent'); system(t('sys.extendAsked')); } },
        respondExtend: async (accept) => {
            await call('extend_respond', { room, accept });
            setExtend('none');
            if (!accept && activeMark !== null) setDismissed(d => [...d, activeMark]);
        },
        dismissExtend: () => { if (activeMark !== null) setDismissed(d => [...d, activeMark]); },
    };

    useEffect(() => {
        if (partnerAway === null) return undefined;
        const iv = setInterval(() => setPartnerAway(n => (n > 1 ? n - 1 : n)), 1000);
        return () => clearInterval(iv);
    }, [partnerAway]);

    return {
        room, isDirect, partner, messages, system, enjoy, friend, extend, showExtend, secondsLeft,
        videoLockedFor, partnerAway, offline, actions,
    };
}
