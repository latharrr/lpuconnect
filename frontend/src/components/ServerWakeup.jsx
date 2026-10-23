import { useT } from '../lib/i18n-context.js';

export default function ServerWakeup() {
    const t = useT();
    return (
        <div className="wake waiting" role="alertdialog" aria-live="polite" aria-labelledby="wake-title">
            <div className="waiting-body">
                <span className="lamp wake-lamp" style={{
                    opacity: 1,
                    boxShadow: '0 0 64px 16px rgba(255,181,71,0.7)',
                }} />
                <h1 id="wake-title" className="display">{t('wake.title')}</h1>
                <p>{t('wake.body')}</p>
                <p className="who">{t('wake.keep')}</p>
            </div>
        </div>
    );
}
