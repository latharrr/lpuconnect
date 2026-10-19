-- v2: identity, consent, sessions, moderation, analytics.
ALTER TABLE users ADD COLUMN public_id TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'guest';
ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN age_confirmed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN consent_at TEXT;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN banned_until TEXT;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
ALTER TABLE users ADD COLUMN last_seen TEXT;
ALTER TABLE users ADD COLUMN ref TEXT;
ALTER TABLE users ADD COLUMN device_hash TEXT;
ALTER TABLE users ADD COLUMN interests TEXT DEFAULT '[]';

UPDATE users SET public_id = lower(hex(randomblob(12))) WHERE public_id IS NULL;
UPDATE users SET auth_provider = CASE WHEN email LIKE '%@uniconnect.local' THEN 'guest' ELSE 'google' END;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

ALTER TABLE friends ADD COLUMN last_chat_at TEXT;
CREATE INDEX IF NOT EXISTS idx_friends_user2 ON friends(user_id_2);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_email ON sessions(email);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    kind TEXT NOT NULL,
    version TEXT NOT NULL,
    accepted_at TEXT NOT NULL
);
CREATE INDEX idx_consents_email ON consents(email);

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    user_id TEXT,
    session_id TEXT,
    event TEXT NOT NULL,
    props TEXT,
    ref TEXT,
    device TEXT,
    app_version TEXT
);
CREATE INDEX idx_events_ts_event ON events(ts, event);
CREATE INDEX idx_events_user ON events(user_id);

CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    reporter TEXT NOT NULL,
    reported TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_by TEXT,
    resolved_at INTEGER,
    resolution_note TEXT
);
CREATE INDEX idx_reports_status ON reports(status, ts);
CREATE INDEX idx_reports_reported ON reports(reported, ts);

CREATE TABLE blocks (
    blocker TEXT NOT NULL,
    blocked TEXT NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (blocker, blocked)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked);

CREATE TABLE device_bans (
    device_hash TEXT PRIMARY KEY,
    until INTEGER NOT NULL,
    reason TEXT
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT
);
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE daily_stats (
    day TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (day, metric)
);

CREATE TABLE referrals (
    code TEXT PRIMARY KEY,
    label TEXT,
    created_at INTEGER NOT NULL,
    created_by TEXT
);

CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    keys TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_email ON push_subscriptions(email);

CREATE TABLE notify_log (
    email TEXT NOT NULL,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    ts INTEGER NOT NULL
);
CREATE INDEX idx_notify ON notify_log(email, kind, subject, ts);
