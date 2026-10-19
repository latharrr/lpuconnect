import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Languages } from 'lucide-react';
import SampleStrip from '../components/SampleStrip.jsx';
import Onboarding from './Onboarding.jsx';
import { api } from '../lib/api.js';
import { deviceId, getRef, onboarded, setOnboarded } from '../lib/session.js';
import { APP_VERSION } from '../lib/config.js';
import { renderGoogleButton } from '../lib/google.js';
import { Rich } from '../lib/i18n.jsx';
import { useI18n } from '../lib/i18n-context.js';

const GENDERS = ['Male', 'Female', 'Other'];

export default function Landing({ config, onAuthed }) {
    const { t, lang, setLang } = useI18n();
    const [gender, setGender] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(null); // { kind: 'guest' } | { kind: 'google', idToken }
    const googleRef = useRef(null);
    const genderRef = useRef(gender);
    genderRef.current = gender;

    useEffect(() => {
        if (!config?.googleClientId || !googleRef.current) return;
        renderGoogleButton(googleRef.current, config.googleClientId, (idToken) => {
            if (!genderRef.current) { setError(t('landing.pickGender')); return; }
            begin({ kind: 'google', idToken });
        }, lang).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config?.googleClientId, lang]);

    function begin(kind) {
        setError('');
        setPending(kind);
    }

    async function submit(consent) {
        const req = pending;
        setPending(null);
        setOnboarded();
        setLoading(true);
        const common = { gender, consent, deviceId: deviceId(), ref: getRef(), appVersion: APP_VERSION };
        try {
            const data = req.kind === 'google'
                ? await api('/api/auth/google', { method: 'POST', auth: false, body: { ...common, idToken: req.idToken } })
                : await api('/api/auth/guest', { method: 'POST', auth: false, body: common });
            onAuthed(data);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }

    function stepIn(e) {
        e.preventDefault();
        if (!gender) { setError(t('landing.pickGender')); return; }
        begin({ kind: 'guest' });
    }

    return (
        <>
            <main className="landing">
                <div className="curtain" aria-hidden="true" />
                <div className="rod" aria-hidden="true" />

                <div className="booth-front">
                    <form className="plate landing-plate" onSubmit={stepIn}>
                        <span className="lamp lamp-pulse plate-lamp" aria-hidden="true" />

                        <h1 className="display landing-title">Uni<em>connect</em></h1>

                        <p className="landing-promise">
                            {t('landing.promise')} <strong>{t('landing.promiseStrong')}</strong>
                        </p>

                        <fieldset className="gender">
                            <legend className="label">{t('landing.iam')}</legend>
                            <div className="push-row">
                                {GENDERS.map(g => (
                                    <label className="push" key={g}>
                                        <input type="radio" name="gender" value={g} checked={gender === g}
                                            onChange={e => { setGender(e.target.value); setError(''); }} />
                                        <span>{t(`gender.${g}`)}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {error && <p className="form-error" role="alert">{error}</p>}

                        <button type="submit" className="btn-go" disabled={loading}>
                            {loading ? <><LoaderCircle className="spin" /> {t('landing.opening')}</> : <>{t('landing.stepIn')} <ArrowRight /></>}
                        </button>

                        {config?.googleClientId && (
                            <div className="google-row">
                                <div ref={googleRef} className="google-btn" />
                                <p className="google-hint">{t('landing.googleHint')}</p>
                            </div>
                        )}

                        <div className="plate-foot">
                            <span className="label">{t('landing.noSignup')}</span>
                        </div>
                    </form>

                    <SampleStrip />
                </div>
            </main>

            <section className="how" aria-labelledby="how-title">
                <div className="how-inner">
                    <h2 id="how-title" className="display"><Rich text={t('how.title')} /></h2>
                    <ol className="how-steps">
                        {[1, 2, 3, 4].map(n => (
                            <li key={n}>
                                <span className="n tabular">{n}</span>
                                <div>
                                    <h3>{t(`how.${n}.title`)}</h3>
                                    <p>{t(`how.${n}.body`)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <footer className="how-foot">
                        <span>{t('foot.project')}</span>
                        <nav className="foot-links" aria-label="Legal">
                            <a href="/safety">{t('foot.safety')}</a>
                            <a href="/privacy">{t('foot.privacy')}</a>
                            <a href="/terms">{t('foot.terms')}</a>
                            <button className="link-btn" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>
                                <Languages aria-hidden="true" /> {t('lang.switch')}
                            </button>
                        </nav>
                    </footer>
                </div>
            </section>

            {pending && <Onboarding full={!onboarded()} onDone={submit} onCancel={() => setPending(null)} />}
        </>
    );
}
