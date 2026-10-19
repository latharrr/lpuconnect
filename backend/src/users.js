import { run, get, all, tx } from './db.js';
import { LRU } from './cache.js';
import { now, safeJson, isGuestEmail } from './util.js';

export const userCache = new LRU({ max: 5000, ttlMs: 30_000 });
export const friendCache = new LRU({ max: 5000, ttlMs: 30_000 });

export function getUser(email) {
    if (!email) return null;
    const cached = userCache.get(email);
    if (cached !== undefined) return cached;
    return userCache.set(email, get('SELECT * FROM users WHERE email = ?', email) || null);
}

export function invalidateUser(email) {
    userCache.delete(email);
    friendCache.delete(email);
}

// What the owner sees about themselves.
export function selfView(u) {
    return {
        name: u.name,
        gender: u.gender,
        bio: u.bio || '',
        verified: !!u.verified,
        provider: u.auth_provider,
        guest: isGuestEmail(u.email),
        email: isGuestEmail(u.email) ? null : u.email,
        interests: safeJson(u.interests, []),
        createdAt: u.created_at,
    };
}

// What a friend sees after reveal. Friends are addressed by public id, never email.
export function friendView(u) {
    return { id: u.public_id, name: u.name, gender: u.gender, bio: u.bio || '', verified: !!u.verified };
}

export function friendEmails(email) {
    const cached = friendCache.get(email);
    if (cached !== undefined) return cached;
    return friendCache.set(email, all('SELECT user_id_2 AS e FROM friends WHERE user_id_1 = ?', email).map(r => r.e));
}

export function friendsOf(email) {
    return all(`SELECT u.public_id, u.name, u.gender, u.bio, u.verified, f.last_chat_at
        FROM friends f JOIN users u ON u.email = f.user_id_2
        WHERE f.user_id_1 = ? ORDER BY COALESCE(f.last_chat_at, f.created_at) DESC`, email)
        .map(r => ({ ...friendView(r), lastChatAt: r.last_chat_at }));
}

export const areFriends = (a, b) => friendEmails(a).includes(b);

export function addFriendship(a, b) {
    tx(() => {
        run('INSERT OR IGNORE INTO friends (user_id_1, user_id_2) VALUES (?, ?)', a, b);
        run('INSERT OR IGNORE INTO friends (user_id_1, user_id_2) VALUES (?, ?)', b, a);
    });
    friendCache.delete(a);
    friendCache.delete(b);
}

export function removeFriendship(a, b) {
    run('DELETE FROM friends WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)', a, b, b, a);
    friendCache.delete(a);
    friendCache.delete(b);
}

export function touchFriendChat(a, b) {
    const t = new Date().toISOString();
    run('UPDATE friends SET last_chat_at = ? WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)', t, a, b, b, a);
}

export function emailByPublicId(publicId) {
    return get('SELECT email FROM users WHERE public_id = ?', publicId)?.email || null;
}

export function isBlockedEither(a, b) {
    return !!get('SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)', a, b, b, a);
}

export function block(blocker, blocked) {
    run('INSERT OR IGNORE INTO blocks (blocker, blocked, ts) VALUES (?, ?, ?)', blocker, blocked, now());
    removeFriendship(blocker, blocked);
}

export function banState(user) {
    if (!user) return null;
    if (user.banned_until && Date.parse(user.banned_until) > now()) {
        return { until: user.banned_until, reason: user.ban_reason || null };
    }
    if (user.device_hash) {
        const d = get('SELECT until, reason FROM device_bans WHERE device_hash = ? AND until > ?', user.device_hash, now());
        if (d) return { until: new Date(d.until).toISOString(), reason: d.reason };
    }
    return null;
}

export function deviceBanned(deviceHash) {
    if (!deviceHash) return null;
    return get('SELECT until, reason FROM device_bans WHERE device_hash = ? AND until > ?', deviceHash, now()) || null;
}

export function setBan(email, untilMs, reason) {
    const u = getUser(email);
    run('UPDATE users SET banned_until = ?, ban_reason = ? WHERE email = ?',
        untilMs ? new Date(untilMs).toISOString() : null, untilMs ? reason : null, email);
    if (u?.device_hash) {
        if (untilMs) {
            run('INSERT INTO device_bans (device_hash, until, reason) VALUES (?, ?, ?) ON CONFLICT(device_hash) DO UPDATE SET until = excluded.until, reason = excluded.reason',
                u.device_hash, untilMs, reason);
        } else {
            run('DELETE FROM device_bans WHERE device_hash = ?', u.device_hash);
        }
    }
    invalidateUser(email);
}

// DPDP: everything we hold about one person, as JSON.
export function exportUser(email) {
    const u = get('SELECT * FROM users WHERE email = ?', email);
    if (!u) return null;
    const { device_hash, ...profile } = u;
    return {
        exportedAt: new Date().toISOString(),
        profile,
        friends: friendsOf(email).map(f => ({ name: f.name, since: f.lastChatAt })),
        consents: all('SELECT kind, version, accepted_at FROM consents WHERE email = ?', email),
        blocks: all('SELECT ts FROM blocks WHERE blocker = ?', email).length,
        reportsFiled: all('SELECT ts, reason, status FROM reports WHERE reporter = ?', email),
        note: 'Message text and video are never stored. Analytics events are pseudonymous and are not linked to your email.',
    };
}

// DPDP: delete the account and everything tied to it. Reports about other people keep a
// pseudonymous marker so moderation history stays coherent.
export function deleteUser(email, analyticsUserId) {
    const u = get('SELECT public_id FROM users WHERE email = ?', email);
    if (!u) return false;
    const marker = `deleted:${u.public_id}`;
    tx(() => {
        run('DELETE FROM friends WHERE user_id_1 = ? OR user_id_2 = ?', email, email);
        run('DELETE FROM sessions WHERE email = ?', email);
        run('DELETE FROM consents WHERE email = ?', email);
        run('DELETE FROM blocks WHERE blocker = ? OR blocked = ?', email, email);
        run('DELETE FROM push_subscriptions WHERE email = ?', email);
        run('DELETE FROM notify_log WHERE email = ?', email);
        run('UPDATE reports SET reporter = ? WHERE reporter = ?', marker, email);
        run('UPDATE reports SET reported = ? WHERE reported = ?', marker, email);
        if (analyticsUserId) run("UPDATE events SET user_id = 'deleted' WHERE user_id = ?", analyticsUserId);
        run('DELETE FROM users WHERE email = ?', email);
    });
    invalidateUser(email);
    return true;
}
