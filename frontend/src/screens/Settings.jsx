import { useEffect, useState } from 'react';
import { Bell, BellOff, Mic, Languages, Download, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { store, audioOnlyPref } from '../lib/session.js';
import { pushState, enablePush, disablePush } from '../lib/push.js';
import { track } from '../lib/analytics.js';
import { useI18n } from '../lib/i18n-context.js';
import { useToast } from '../components/toast-context.js';

export default function Settings({ config, onDeleted }) {
    const { t, lang, setLang } = useI18n();
    const toast = useToast();
    const [push, setPush] = useState('off');
    const [audioOnly, setAudioOnly] = useState(audioOnlyPref);

    useEffect(() => { pushState().then(setPush).catch(() => setPush('unsupported')); }, []);
    const canPush = push !== 'unsupported' && !!config?.vapidPublicKey;

    async function togglePush() {
        try {
            if (push === 'on') { await disablePush(); setPush('off'); }
            else { await enablePush(config.vapidPublicKey); setPush('on'); }
        } catch (err) { toast(err.message === 'denied' ? t('dash.notifyUnsupported') : (err.message || 'Error')); }
    }

    function toggleAudio() {
        const v = !audioOnly;
        setAudioOnly(v);
        store.set('uc_audio_only', v ? '1' : '0');
        track('audio_only', { on: v });
    }

    async function exportData() {
        try {
            const data = await api('/api/me/export');
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: 'lputv-my-data.json' });
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) { toast(err.message); }
    }

    async function deleteAccount() {
        if (!window.confirm(t('dash.confirmDelete'))) return;
        try { await api('/api/me', { method: 'DELETE' }); onDeleted(); } catch (err) { toast(err.message); }
    }

    return (
        <section className="settings" aria-labelledby="settings-title">
            <h2 id="settings-title" className="display">{t('dash.settings')}</h2>
            <ul className="setting-list">
                {config?.vapidPublicKey && (
                    <li>
                        <div>
                            <h3>{t('dash.notify')}</h3>
                            <p>{canPush ? t('dash.notifyBody') : t('dash.notifyUnsupported')}</p>
                        </div>
                        <button className="btn btn-quiet" disabled={!canPush} onClick={togglePush} aria-pressed={push === 'on'}>
                            {push === 'on' ? <><BellOff /> {t('dash.notifyOff')}</> : <><Bell /> {t('dash.notifyOn')}</>}
                        </button>
                    </li>
                )}
                <li>
                    <div>
                        <h3>{t('dash.audioOnly')}</h3>
                        <p>{t('dash.audioOnlyBody')}</p>
                    </div>
                    <button className="switch" role="switch" aria-checked={audioOnly} aria-label={t('dash.audioOnly')} onClick={toggleAudio}>
                        <Mic aria-hidden="true" /><span className="switch-knob" />
                    </button>
                </li>
                <li>
                    <div><h3>{t('dash.language')}</h3></div>
                    <button className="btn btn-quiet" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}><Languages /> {t('lang.switch')}</button>
                </li>
                <li>
                    <div><h3>{t('dash.yourData')}</h3></div>
                    <div className="setting-btns">
                        <button className="btn btn-quiet" onClick={exportData}><Download /> {t('dash.export')}</button>
                        <button className="btn btn-danger" onClick={deleteAccount}><Trash2 /> {t('dash.delete')}</button>
                    </div>
                </li>
            </ul>
        </section>
    );
}
