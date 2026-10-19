import { useState } from 'react';
import { ArrowRight, ShieldCheck, Video, Check } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { Rich } from '../lib/i18n.jsx';
import { useT } from '../lib/i18n-context.js';
import { track } from '../lib/analytics.js';

// First run: rules, camera/mic explainer, then the 18+ and terms consent.
// Later sign-ups on the same device only see the consent step.
export default function Onboarding({ full, onDone, onCancel }) {
    const t = useT();
    const [step, setStep] = useState(full ? 1 : 3);
    const [age, setAge] = useState(false);
    const [terms, setTerms] = useState(false);
    const [error, setError] = useState('');

    const go = (n) => { track('onboarding_step', { step: n }); setStep(n); };
    const skip = () => { track('onboarding_skip', { from: step }); setStep(3); };

    function finish() {
        if (!age || !terms) { setError(t('onb.needBoth')); return; }
        onDone({ age18: true, terms: true });
    }

    const legal = (path) => (inner) => <a href={path} target="_blank" rel="noopener">{inner}</a>;

    return (
        <Modal labelledBy="onb-title" onClose={onCancel} className="onboarding">
            {full && <p className="label onb-step tabular">{t('onb.step', { n: step })}</p>}

            {step === 1 && (
                <>
                    <h2 id="onb-title" className="display"><ShieldCheck aria-hidden="true" /> {t('onb.1.title')}</h2>
                    <ul className="onb-rules">
                        {['r1', 'r2', 'r3', 'r4'].map(k => <li key={k}>{t(`onb.1.${k}`)}</li>)}
                    </ul>
                </>
            )}

            {step === 2 && (
                <>
                    <h2 id="onb-title" className="display"><Video aria-hidden="true" /> {t('onb.2.title')}</h2>
                    <p>{t('onb.2.body')}</p>
                    <p className="onb-hint">{t('onb.2.hint')}</p>
                </>
            )}

            {step === 3 && (
                <>
                    <h2 id="onb-title" className="display">{t('onb.3.title')}</h2>
                    <label className="check">
                        <input type="checkbox" checked={age} onChange={e => { setAge(e.target.checked); setError(''); }} />
                        <span className="check-box" aria-hidden="true"><Check /></span>
                        <span>{t('onb.3.age')}</span>
                    </label>
                    <label className="check">
                        <input type="checkbox" checked={terms} onChange={e => { setTerms(e.target.checked); setError(''); }} />
                        <span className="check-box" aria-hidden="true"><Check /></span>
                        <span><Rich text={t('onb.3.terms')} links={{ terms: legal('/terms'), privacy: legal('/privacy') }} /></span>
                    </label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                </>
            )}

            <div className="onb-actions">
                {step > 1 && full && <button className="btn btn-quiet" onClick={() => go(step - 1)}>{t('onb.back')}</button>}
                {step < 3 && <button className="btn btn-text" onClick={skip}>{t('onb.skip')}</button>}
                {step < 3
                    ? <button className="btn btn-red" onClick={() => go(step + 1)}>{t('onb.next')} <ArrowRight /></button>
                    : <button className="btn btn-red" onClick={finish}>{t('onb.agree')} <ArrowRight /></button>}
            </div>
        </Modal>
    );
}
