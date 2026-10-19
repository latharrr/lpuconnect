import { useEffect, useRef } from 'react';

// Enamel-plate dialog with a focus trap; Esc and scrim click close when `onClose` is given.
export default function Modal({ labelledBy, onClose, children, className = '' }) {
    const ref = useRef(null);
    useEffect(() => {
        const prev = document.activeElement;
        const el = ref.current;
        const focusables = () => [...el.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled);
        (focusables()[0] || el).focus();
        const onKey = (e) => {
            if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); }
            if (e.key !== 'Tab') return;
            const f = focusables();
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        };
        el.addEventListener('keydown', onKey);
        return () => { el.removeEventListener('keydown', onKey); prev?.focus?.(); };
    }, [onClose]);
    return (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
            <div ref={ref} tabIndex={-1} className={`plate modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
                {children}
            </div>
        </div>
    );
}
