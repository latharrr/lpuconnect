import { useCallback, useEffect, useMemo, useState } from 'react';
import en from '../i18n/en.js';
import hi from '../i18n/hi.js';
import { store } from './session.js';
import { I18n } from './i18n-context.js';

const DICTS = { en, hi };

function initialLang() {
    const saved = store.get('uc_lang');
    if (saved && DICTS[saved]) return saved;
    return (navigator.language || '').toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

export function I18nProvider({ children }) {
    const [lang, setLangState] = useState(initialLang);
    useEffect(() => { document.documentElement.lang = lang; }, [lang]);
    const setLang = useCallback((l) => {
        setLangState(l);
        store.set('uc_lang', l);
        document.documentElement.lang = l;
    }, []);
    const t = useCallback((key, vars) => {
        let s = DICTS[lang][key] ?? en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
        return s;
    }, [lang]);
    const value = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang]);
    return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

// Renders a translated string containing <b>…</b> / <em>…</em> and named link tags safely
// (no innerHTML): `links` maps a tag name to a render function for its inner text.
export function Rich({ text, links = {} }) {
    const parts = [];
    const re = /<(\w+)>(.*?)<\/\1>/g;
    let last = 0;
    let m;
    let i = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        const [, tag, inner] = m;
        if (tag === 'b') parts.push(<strong key={i++}>{inner}</strong>);
        else if (tag === 'em') parts.push(<em key={i++}>{inner}</em>);
        else if (links[tag]) parts.push(<span key={i++}>{links[tag](inner)}</span>);
        else parts.push(inner);
        last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <>{parts}</>;
}
