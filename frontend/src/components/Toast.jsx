import { useCallback, useState } from 'react';
import { ToastCtx } from './toast-context.js';

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const push = useCallback((text, { action, onAction, ms = 5000 } = {}) => {
        const id = Math.random().toString(36).slice(2);
        setToasts(ts => [...ts.slice(-2), { id, text, action, onAction }]);
        setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), ms);
    }, []);
    const dismiss = (id) => setToasts(ts => ts.filter(x => x.id !== id));
    return (
        <ToastCtx.Provider value={push}>
            {children}
            <div className="toasts" role="status" aria-live="polite">
                {toasts.map(x => (
                    <div key={x.id} className="toast">
                        <span>{x.text}</span>
                        {x.action && <button className="btn btn-lamp" onClick={() => { dismiss(x.id); x.onAction?.(); }}>{x.action}</button>}
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}
