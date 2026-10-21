import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Languages, Phone } from 'lucide-react';
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
    const [pending, setPending] = useState(null); // { kind: 'guest' } | { kind: 'google', idToken } | { kind: 'otp' }
    const [phoneOpen, setPhoneOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [otpSession, setOtpSession] = useState(null);
    const [code, setCode] = useState('');
    const [otpHint, setOtpHint] = useState('');
    const consentRef = useRef(null);
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
            if (req.kind === 'otp') {
                consentRef.current = consent;
                await requestCode();
                return;
            }
            const data = req.kind === 'google'
                ? await api('/api/auth/google', { method: 'POST', auth: false, body: { ...common, idToken: req.idToken } })
                : await api('/api/auth/guest', { method: 'POST', auth: false, body: common });
            onAuthed(data);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }

    function validPhone() {
        const d = phone.replace(/[^\d]/g, '').replace(/^0/, '');
        return /^[6-9]\d{9}$/.test(d.startsWith('91') && d.length === 12 ? d.slice(2) : d);
    }

    function startPhone() {
        if (!gender) { setError(t('landing.pickGender')); return; }
        if (!validPhone()) { setError(t('landing.badPhone')); return; }
        setError('');
        if (consentRef.current) { requestCode(); return; }
        begin({ kind: 'otp' });
    }

    async function requestCode() {
        setLoading(true);
        setError('');
        try {
            const data = await api('/api/auth/otp/request', { method: 'POST', auth: false, body: { phone } });
            setOtpSession(data.session);
            setCode('');
            setOtpHint(t('landing.codeSent'));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function verifyCode(e) {
        e.preventDefault();
        if (!/^\d{6}$/.test(code)) { setError(t('landing.badCode')); return; }
        setLoading(true);
        setError('');
        try {
            const data = await api('/api/auth/otp/verify', {
                method: 'POST', auth: false,
                body: { phone, session: otpSession, code, gender, consent: consentRef.current, deviceId: deviceId(), ref: getRef(), appVersion: APP_VERSION },
            });
            onAuthed(data);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }

    function changeNumber() {
        setOtpSession(null);
        setCode('');
        setOtpHint('');
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

                        <h1 className="display landing-title">Lpu<em>TV</em></h1>

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

                        {config?.otpEnabled && (
                            <div className="phone-row">
                                {!phoneOpen ? (
                                    <button type="button" className="btn btn-quiet phone-cta" onClick={() => setPhoneOpen(true)} disabled={loading}>
                                        <Phone aria-hidden="true" /> {t('landing.phoneCta')}
                                    </button>
                                ) : !otpSession ? (
                                    <>
                                        <div className="phone-form">
                                            <span className="phone-prefix">+91</span>
                                            <input
                                                className="phone-input"
                                                type="tel"
                                                inputMode="numeric"
                                                autoComplete="tel-national"
                                                maxLength={12}
                                                placeholder={t('landing.phonePlaceholder')}
                                                value={phone}
                                                onChange={e => { setPhone(e.target.value); setError(''); }}
                                                aria-label={t('landing.phonePlaceholder')}
                                            />
                                            <button type="button" className="btn btn-go-small" onClick={startPhone} disabled={loading}>
                                                {loading ? t('landing.sending') : t('landing.getCode')}
                                            </button>
                                        </div>
                                        <p className="phone-hint">{t('landing.phoneHint')}</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="phone-form">
                                            <input
                                                className="code-input"
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="one-time-code"
                                                maxLength={6}
                                                placeholder={t('landing.codePlaceholder')}
                                                value={code}
                                                onChange={e => { setCode(e.target.value.replace(/[^\d]/g, '')); setError(''); }}
                                                aria-label={t('landing.codePlaceholder')}
                                                autoFocus
                                            />
                                            <button type="button" className="btn btn-go-small" onClick={verifyCode} disabled={loading}>
                                                {loading ? <LoaderCircle className="spin" /> : t('landing.verify')}
                                            </button>
                                        </div>
                                        <p className="phone-hint" role="status">{otpHint}</p>
                                        <p className="phone-hint">
                                            <button type="button" className="link-btn" onClick={requestCode} disabled={loading}>{t('landing.resend')}</button>
                                            {' · '}
                                            <button type="button" className="link-btn" onClick={changeNumber} disabled={loading}>{t('landing.changeNumber')}</button>
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

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
