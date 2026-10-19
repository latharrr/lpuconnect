import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Wordmark from '../components/Wordmark.jsx';
import Print from '../components/Print.jsx';
import { getSocket, call } from '../lib/socket.js';
import { useT } from '../lib/i18n-context.js';

export default function DirectCalling({ userName, friend, onMatched, onCancel }) {
    const t = useT();
    const [room, setRoom] = useState(null);

    useEffect(() => {
        const s = getSocket();
        if (!s) return undefined;
        const onMatch = (m) => onMatched(m);
        s.on('direct_matched', onMatch);
        const join = () => call('join_direct', { friendId: friend.id }).then(r => {
            if (r.error) onCancel(r.error);
            else if (r.room) setRoom(r.room);
        });
        if (s.connected) join();
        s.on('connect', join);
        return () => { s.off('direct_matched', onMatch); s.off('connect', join); };
    }, [friend.id, onMatched, onCancel]);

    function cancel() {
        if (room) call('skip', { room });
        onCancel();
    }

    return (
        <div className="interior waiting">
            <header className="topbar">
                <Wordmark />
                <button className="btn btn-quiet" onClick={cancel}><X /> {t('match.cancel')}</button>
            </header>
            <main className="waiting-body" aria-live="polite">
                <div className="calling-prints" aria-hidden="true">
                    <Print name={userName} size={80} />
                    <div className="calling-line"><i /><i /><i /></div>
                    <Print name={friend.name} size={80} />
                </div>
                <h1 className="display">{t('calling.title', { name: friend.name })}</h1>
                <p>{t('calling.body')}</p>
            </main>
        </div>
    );
}
