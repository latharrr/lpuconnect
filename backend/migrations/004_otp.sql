-- WhatsApp OTP login. Codes are stored only as HMACs; phones only as salted hashes.
CREATE TABLE otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_hash TEXT NOT NULL,
    code_hmac TEXT NOT NULL,
    session_id TEXT NOT NULL,
    ip TEXT,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX idx_otp_phone ON otp_codes(phone_hash, created_at);
CREATE INDEX idx_otp_created ON otp_codes(created_at);

ALTER TABLE users ADD COLUMN phone_hash TEXT;
CREATE UNIQUE INDEX idx_users_phone_hash ON users(phone_hash) WHERE phone_hash IS NOT NULL;
