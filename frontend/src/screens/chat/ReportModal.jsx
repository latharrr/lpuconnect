import { useState } from 'react';
import { Check, Ban } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { call } from '../../lib/socket.js';
import { useT } from '../../lib/i18n-context.js';

const REASONS = ['Harassment', 'Inappropriate content', 'Spam', 'Underage', 'Other'];

export default function ReportModal({ room, isDirect, onClose, onDone }) {
    const t = useT();
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    async function send(kind) {
        setBusy(true);
        const r = kind === 'block' ? await call('block', { room }) : await call('report', { room, reason, note });
        setBusy(false);
        if (!r.error) setDone(true);
    }

    return (
        <Modal labelledBy="report-title" onClose={done ? null : onClose}>
            <h2 id="report-title" className="display" style={{ marginTop: 8 }}>{t('report.title')}</h2>
            {done ? (
                <>
                    <p className="modal-ok"><Check /> {t('report.done')}</p>
                    <button className="btn btn-red btn-block" onClick={onDone}>{isDirect ? t('report.leave') : t('report.next')}</button>
                </>
            ) : (
                <>
                    <p>{t('report.what')}</p>
                    <div className="report-list" role="radiogroup" aria-label={t('report.what')}>
                        {REASONS.map(r => (
                            <button key={r} className="btn btn-quiet" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}>
                                {t(`report.reason.${r}`)}
                            </button>
                        ))}
                    </div>
                    {reason && (
                        <>
                            <label className="field-label label" htmlFor="report-note" style={{ marginTop: 12 }}>{t('report.note')}</label>
                            <textarea id="report-note" className="report-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
                        </>
                    )}
                    <div className="modal-btns" style={{ marginTop: 16 }}>
                        <button className="btn btn-quiet" disabled={busy} onClick={() => send('block')}><Ban /> {t('report.block')}</button>
                        <button className="btn btn-red" disabled={!reason || busy} onClick={() => send('report')}>{t('report.send')}</button>
                    </div>
                    <button className="btn btn-text" onClick={onClose}>{t('report.cancel')}</button>
                </>
            )}
        </Modal>
    );
}
