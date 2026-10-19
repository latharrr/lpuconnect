import { Router } from 'express';
import { run, all } from '../db.js';
import { requireAuth } from './auth.js';
import { getUser, selfView, friendsOf, invalidateUser, exportUser, deleteUser, emailByPublicId, areFriends, removeFriendship, block } from '../users.js';
import { revokeAllFor } from '../sessions.js';
import { track } from '../events.js';
import { HttpError } from '../errors.js';
import { analyticsId, clampText, now } from '../util.js';
import { kickUser, notifyFriendsChanged } from '../realtime/index.js';

export const BIO_MAX = 200;
export const INTERESTS = ['Coding', 'Music', 'Movies', 'Sports', 'Gaming', 'Books', 'Art', 'Fitness', 'Food', 'Travel', 'Startups', 'Anime', 'Memes', 'Placements', 'Exams'];

export const meRouter = Router();

meRouter.get('/', requireAuth(), (req, res) => {
    res.json({ user: selfView(req.user), friends: friendsOf(req.email) });
});

meRouter.patch('/', requireAuth(), (req, res) => {
    const { bio, interests } = req.body || {};
    if (bio !== undefined) {
        if (typeof bio !== 'string') throw new HttpError(400, 'bad_bio');
        run('UPDATE users SET bio = ? WHERE email = ?', clampText(bio, BIO_MAX), req.email);
    }
    if (interests !== undefined) {
        if (!Array.isArray(interests)) throw new HttpError(400, 'bad_interests');
        const clean = [...new Set(interests.filter(i => INTERESTS.includes(i)))].slice(0, 5);
        run('UPDATE users SET interests = ? WHERE email = ?', JSON.stringify(clean), req.email);
    }
    invalidateUser(req.email);
    res.json({ user: selfView(getUser(req.email)) });
});

meRouter.get('/export', requireAuth({ allowBanned: true }), (req, res) => {
    track('data_export', { email: req.email });
    res.set('Content-Disposition', 'attachment; filename="uniconnect-my-data.json"');
    res.json(exportUser(req.email));
});

meRouter.delete('/', requireAuth({ allowBanned: true }), (req, res) => {
    const aid = analyticsId(req.user.public_id);
    const friendEmails = all('SELECT user_id_2 AS e FROM friends WHERE user_id_1 = ?', req.email).map(r => r.e);
    track('account_delete', { userId: 'deleted' });
    kickUser(req.email, 'account_deleted');
    revokeAllFor(req.email);
    deleteUser(req.email, aid);
    friendEmails.forEach(e => { invalidateUser(e); notifyFriendsChanged(e); });
    res.json({ ok: true });
});

meRouter.get('/friends', requireAuth(), (req, res) => {
    res.json({ friends: friendsOf(req.email) });
});

meRouter.delete('/friends/:id', requireAuth(), (req, res) => {
    const other = emailByPublicId(req.params.id);
    if (!other || !areFriends(req.email, other)) throw new HttpError(404, 'not_found');
    removeFriendship(req.email, other);
    notifyFriendsChanged(other);
    res.json({ friends: friendsOf(req.email) });
});

meRouter.post('/friends/:id/block', requireAuth(), (req, res) => {
    const other = emailByPublicId(req.params.id);
    if (!other || !areFriends(req.email, other)) throw new HttpError(404, 'not_found');
    block(req.email, other);
    track('block', { email: req.email, props: { from: 'friends' } });
    notifyFriendsChanged(other);
    res.json({ friends: friendsOf(req.email) });
});

meRouter.get('/blocks', requireAuth(), (req, res) => {
    res.json({ count: all('SELECT COUNT(*) AS n FROM blocks WHERE blocker = ?', req.email)[0].n });
});

meRouter.post('/push', requireAuth(), (req, res) => {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !/^https:\/\//.test(sub.endpoint)) {
        throw new HttpError(400, 'bad_subscription');
    }
    run(`INSERT INTO push_subscriptions (endpoint, email, keys, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, keys = excluded.keys`,
        sub.endpoint.slice(0, 600), req.email, JSON.stringify(sub.keys), now());
    track('push_subscribe', { email: req.email });
    res.json({ ok: true });
});

meRouter.delete('/push', requireAuth(), (req, res) => {
    run('DELETE FROM push_subscriptions WHERE email = ?', req.email);
    res.json({ ok: true });
});
