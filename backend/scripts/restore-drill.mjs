// Monthly restore drill: take a fresh backup, restore it to a scratch file, verify
// integrity and that every table has exactly the same row count. Exit 1 on mismatch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, closeDb, all, get } from '../src/db.js';
import { backupNow } from '../src/jobs.js';

openDb();
const file = backupNow();
const restored = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uc-restore-')), 'restored.sqlite');
fs.copyFileSync(file, restored);
const copy = new DatabaseSync(restored, { readOnly: true });
const integrity = copy.prepare('PRAGMA integrity_check').get().integrity_check;
let ok = integrity === 'ok';
console.log(`backup ${path.basename(file)} integrity: ${integrity}`);
for (const { name } of all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
    const live = get(`SELECT COUNT(*) AS n FROM "${name}"`).n;
    const back = copy.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n;
    const match = live === back;
    if (!match) ok = false;
    console.log(`${match ? 'ok ' : 'BAD'} ${name.padEnd(20)} live=${live} restored=${back}`);
}
copy.close();
closeDb();
console.log(ok ? 'RESTORE DRILL PASSED' : 'RESTORE DRILL FAILED');
process.exit(ok ? 0 : 1);
