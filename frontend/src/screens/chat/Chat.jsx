import { useRef, useState } from 'react';
import { X, Video } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import Print from '../../components/Print.jsx';
import ChatHeader from './ChatHeader.jsx';
import ConsentRail from './ConsentRail.jsx';
import VideoPanel from './VideoPanel.jsx';
import Messages from './Messages.jsx';
import Composer from './Composer.jsx';
import ReportModal from './ReportModal.jsx';
import { useChat } from './useChat.js';
import { useVideo } from './useVideo.js';
import { useT } from '../../lib/i18n-context.js';

export default function Chat({ session, onEnded }) {
    const t = useT();
    const chat = useChat(session, onEnded);
    const video = useVideo(chat.room, chat.system);
    const [input, setInput] = useState('');
    const [reporting, setReporting] = useState(false);
    const inputRef = useRef(null);

    const friends = chat.friend === 'friends';
    const displayName = friends ? chat.partner.name : (chat.partner.alias || t('chat.student'));

    async function send() {
        const text = input;
        setInput('');
        if (!(await chat.actions.send(text))) setInput(text);
        inputRef.current?.focus();
    }

    return (
        <div className="chat">
            {chat.offline && <div className="banner" role="status">{t('chat.reconnecting')}</div>}
            <ChatHeader chat={chat} onReport={() => setReporting(true)} />
            <ConsentRail chat={chat} />
            <VideoPanel video={video} partnerName={displayName} />
            <Messages chat={chat} onIcebreaker={(q) => { setInput(q); inputRef.current?.focus(); }} />
            <Composer ref={inputRef} value={input} onChange={setInput} onSend={send} chat={chat} video={video} />

            {video.incoming && video.state !== 'active' && (
                <Modal labelledBy="incoming-title" onClose={() => video.respond(false)}>
                    <Print name={friends ? chat.partner.name : ''} size={64} latent={!friends} />
                    <h2 id="incoming-title" className="display">{t('video.title')}</h2>
                    <p>{t('video.incoming', { name: displayName })}</p>
                    <div className="modal-btns">
                        <button className="btn btn-quiet" onClick={() => video.respond(false)}><X /> {t('video.decline')}</button>
                        <button className="btn btn-red" onClick={() => video.respond(true)}><Video /> {t('video.accept')}</button>
                    </div>
                </Modal>
            )}

            {video.explain && (
                <Modal labelledBy="explain-title" onClose={video.cancelExplainer}>
                    <h2 id="explain-title" className="display">{t('video.explainTitle')}</h2>
                    <p>{t('video.explainBody')}</p>
                    <div className="modal-btns">
                        <button className="btn btn-quiet" onClick={video.cancelExplainer}>{t('report.cancel')}</button>
                        <button className="btn btn-red" onClick={video.confirmExplainer}>{t('video.continue')}</button>
                    </div>
                </Modal>
            )}

            {reporting && (
                <ReportModal room={chat.room} isDirect={chat.isDirect} onClose={() => setReporting(false)}
                    onDone={() => { setReporting(false); onEnded(chat.isDirect ? 'left' : 'report', false); }} />
            )}
        </div>
    );
}
