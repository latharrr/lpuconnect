// Outbound alerts. ALERT_WEBHOOK_URL can point at Slack/Discord-compatible webhooks or a
// small relay to WhatsApp/email; the body is {"text": "..."}.
import { config } from './config.js';
import { logger } from './logger.js';

export async function sendAlert(text) {
    logger.info({ alert: text }, 'alert');
    if (!config.alertWebhookUrl) return false;
    try {
        const res = await fetch(config.alertWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, content: text }),
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch (err) {
        logger.warn({ err: err.message }, 'alert delivery failed');
        return false;
    }
}
