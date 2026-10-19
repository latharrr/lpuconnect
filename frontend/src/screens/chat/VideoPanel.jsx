import { Mic, MicOff, Video, VideoOff, PhoneOff, AudioLines } from 'lucide-react';
import { useT } from '../../lib/i18n-context.js';

function Stream({ stream, muted }) {
    return (
        <video autoPlay playsInline muted={muted}
            ref={el => { if (el && stream && el.srcObject !== stream) el.srcObject = stream; }} />
    );
}

export default function VideoPanel({ video, partnerName }) {
    const t = useT();
    if (video.state !== 'active') return null;
    return (
        <>
            <div className="video">
                <div className="video-main">
                    <Stream stream={video.remote} />
                    <span className="video-tag label">{partnerName}</span>
                    <span className="lamp lamp-pulse video-rec" aria-hidden="true" />
                </div>
                <div className="video-pip">
                    <Stream stream={video.local} muted />
                    <span className="video-tag label">{t('video.you')}</span>
                </div>
                {video.poor && (
                    <div className="video-poor" role="status">
                        <span>{t('video.poor')}</span>
                        <button className="btn btn-lamp" onClick={video.voiceOnly}><AudioLines /> {t('video.voiceOnly')}</button>
                    </div>
                )}
            </div>
            <div className="video-controls">
                <button className="btn btn-quiet" onClick={video.toggleMute} aria-pressed={video.muted}>
                    {video.muted ? <><MicOff /> {t('video.unmute')}</> : <><Mic /> {t('video.mute')}</>}
                </button>
                <button className="btn btn-quiet" onClick={video.toggleCam} aria-pressed={video.camOff}>
                    {video.camOff ? <><VideoOff /> {t('video.camOn')}</> : <><Video /> {t('video.camOff')}</>}
                </button>
                <button className="btn btn-danger" onClick={video.end}><PhoneOff /> {t('video.end')}</button>
            </div>
        </>
    );
}
