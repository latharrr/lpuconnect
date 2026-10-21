import { ArrowLeft } from 'lucide-react';
import Wordmark from '../components/Wordmark.jsx';

// Draft legal pages. Not legal advice: have the wording reviewed before launch (spec section 7).
const UPDATED = '19 October 2026';
const GRIEVANCE_NAME = import.meta.env.VITE_GRIEVANCE_NAME || '';
const GRIEVANCE_EMAIL = import.meta.env.VITE_GRIEVANCE_EMAIL || '';

function Grievance() {
    if (GRIEVANCE_NAME && GRIEVANCE_EMAIL) {
        return <p>Grievance officer: <strong>{GRIEVANCE_NAME}</strong>, <a href={`mailto:${GRIEVANCE_EMAIL}`}>{GRIEVANCE_EMAIL}</a>. We acknowledge complaints within 24 hours and aim to resolve them within 15 days.</p>;
    }
    return <p>Grievance officer contact details are being published. Until then, use Report inside any chat; reports go straight to the moderation queue.</p>;
}

const PAGES = {
    privacy: {
        title: 'Privacy notice',
        body: (
            <>
                <p>LpuTV is a non-profit student project. This notice explains what we hold about you, why, for how long, and your rights under India's Digital Personal Data Protection Act, 2023.</p>
                <h2>What we store</h2>
                <table className="legal-table">
                    <thead><tr><th>Data</th><th>Why</th><th>Kept for</th></tr></thead>
                    <tbody>
                        <tr><td>Random guest handle, the gender you choose, optional bio and interests</td><td>To run your account and matching</td><td>Until you delete your account</td></tr>
                        <tr><td>Google email and name (only if you sign in with Google)</td><td>To log you in and show a verified badge for college domains</td><td>Until you delete your account</td></tr>
                        <tr><td>Phone number as a one-way hash (only if you sign in with phone)</td><td>To log you in with a code we send on WhatsApp; the raw number is never saved and never shown to anyone</td><td>Until you delete your account</td></tr>
                        <tr><td>Friends list and who you blocked</td><td>Direct chats, and keeping blocked people away from you</td><td>Until you delete your account</td></tr>
                        <tr><td>Consent records (18+, terms, this notice) with a timestamp</td><td>Proof of consent</td><td>Until you delete your account</td></tr>
                        <tr><td>A hashed device identifier</td><td>Stopping banned users from coming back</td><td>Until you delete your account</td></tr>
                        <tr><td>Usage events (for example "chat started", "chat lasted 4 minutes") under a pseudonymous id</td><td>Understanding and improving the product</td><td>90 days, then only daily totals</td></tr>
                        <tr><td>Reports you file or that are filed about you, with a short note and chat metadata (length, whether video was on)</td><td>Safety and moderation</td><td>1 year after they are closed</td></tr>
                        <tr><td>Push notification subscription (only if you turn notifications on)</td><td>Telling you when a friend wants to chat</td><td>Until you turn it off</td></tr>
                    </tbody>
                </table>
                <h2>What we never store</h2>
                <p>The text of your messages and your audio or video. Messages pass through our server to the other person and are not saved. Video and audio go directly between the two devices. Your raw phone number: only a one-way hash is kept, and WhatsApp login codes are deleted within 7 days.</p>
                <h2>Your rights</h2>
                <ul>
                    <li>Download everything we hold about you: Dashboard, Settings, "Download my data".</li>
                    <li>Correct your bio and interests at any time.</li>
                    <li>Delete your account: Dashboard, Settings, "Delete my account". This removes your profile, friends, consents and subscriptions at once; your usage events are detached from you.</li>
                    <li>Withdraw consent by deleting your account.</li>
                </ul>
                <h2>Age</h2>
                <p>LpuTV is for people aged 18 and over. We do not knowingly allow anyone younger to use it; report accounts that seem underage.</p>
                <h2>Security and breaches</h2>
                <p>Connections are encrypted in transit (HTTPS). Session tokens are stored hashed. If a personal data breach happens we will inform the Data Protection Board of India and affected users as the law requires.</p>
                <h2>Contact</h2>
                <Grievance />
            </>
        ),
    },
    safety: {
        title: 'Safety',
        body: (
            <>
                <p>LpuTV pairs strangers, so it only works if people are decent to each other. These are the rules and the tools you have.</p>
                <h2>Rules</h2>
                <ul>
                    <li>No harassment, threats, hate speech or sexual content.</li>
                    <li>No nudity on video, ever.</li>
                    <li>No spam, scams or advertising.</li>
                    <li>You must be 18 or older.</li>
                </ul>
                <h2>Your tools</h2>
                <ul>
                    <li><strong>Skip</strong> ends a chat instantly.</li>
                    <li><strong>Report</strong> (the flag in every chat) ends the chat, blocks that person from ever matching with you, and sends the report to moderators. You can still report a stranger for a few minutes after they leave.</li>
                    <li><strong>Block</strong> removes a friend and stops future matches.</li>
                    <li>Accounts reported by several different people are suspended automatically until a moderator reviews them.</li>
                </ul>
                <h2>Protect yourself</h2>
                <ul>
                    <li>Your name stays hidden until you both accept a friend request. Don't share your number, handles or location before you trust someone.</li>
                    <li>Video is optional and only starts if you both agree.</li>
                    <li>If someone threatens you or you feel unsafe, stop the chat and report it. In an emergency call 112. Cyber crime can be reported at cybercrime.gov.in or on the helpline 1930.</li>
                    <li>If you need to talk to someone, Tele-MANAS is free and open 24 hours: 14416.</li>
                </ul>
                <h2>Grievances</h2>
                <Grievance />
            </>
        ),
    },
    terms: {
        title: 'Terms',
        body: (
            <>
                <p>By using LpuTV you agree to these terms.</p>
                <ul>
                    <li>You are at least 18 years old.</li>
                    <li>You will follow the rules on the Safety page. We may suspend or remove accounts that break them, including automatically after multiple reports.</li>
                    <li>You are responsible for what you say and show. Do not share content you do not have the right to share.</li>
                    <li>LpuTV is a free, non-profit student project provided as is. It may be unavailable at times and features may change.</li>
                    <li>We handle your data as described in the Privacy notice.</li>
                    <li>You can stop using LpuTV and delete your account at any time.</li>
                </ul>
                <h2>Contact</h2>
                <Grievance />
            </>
        ),
    },
};

export const LEGAL_PATHS = Object.keys(PAGES);

export default function Legal({ page }) {
    const p = PAGES[page];
    return (
        <div className="interior legal">
            <header className="topbar">
                <a href="/" className="wordmark-link" aria-label="LpuTV home"><Wordmark /></a>
                <a href="/" className="btn btn-ghost"><ArrowLeft /> Back</a>
            </header>
            <main className="legal-body">
                <h1 className="display">{p.title}</h1>
                <p className="label legal-updated">Last updated {UPDATED}</p>
                {p.body}
                <nav className="foot-links" aria-label="Legal">
                    {LEGAL_PATHS.filter(x => x !== page).map(x => <a key={x} href={`/${x}`}>{PAGES[x].title}</a>)}
                </nav>
            </main>
        </div>
    );
}
