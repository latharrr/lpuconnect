// SQLite via Node's built-in driver. Synchronous calls are fine at this size and keep
// transactions simple; heavy reads go through daily_stats rollups, not raw scans.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

let db = null;

export function openDb(file = config.dbPath) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate();
    return db;
}

export function getDb() {
    if (!db) throw new Error('Database not opened');
    return db;
}

export function closeDb() {
    if (db) {
        try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* closing anyway */ }
        db.close();
        db = null;
    }
}

const stmtCache = new Map();
function prepared(sql) {
    let s = stmtCache.get(sql);
    if (!s || s.__db !== db) {
        s = db.prepare(sql);
        s.__db = db;
        stmtCache.set(sql, s);
    }
    return s;
}

export const run = (sql, ...params) => prepared(sql).run(...params);
export const get = (sql, ...params) => prepared(sql).get(...params);
export const all = (sql, ...params) => prepared(sql).all(...params);

export function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const out = fn();
        db.exec('COMMIT');
        return out;
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

// Versioned SQL files in /migrations, applied once each, in order.
export function migrate() {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const dir = path.join(config.root, 'migrations');
    const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
        if (applied.has(file)) continue;
        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        tx(() => {
            db.exec(sql);
            db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
        });
    }
    stmtCache.clear();
}

export function schemaSnapshot() {
    return db.prepare(`SELECT type, name, sql FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name`).all();
}

// Consistent online copy; safe while the app keeps writing.
export function backupTo(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.unlinkSync(file);
    db.prepare('VACUUM INTO ?').run(file);
    return file;
}

export function ping() {
    return db.prepare('SELECT 1 AS ok').get().ok === 1;
}
