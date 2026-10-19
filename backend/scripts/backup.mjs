// Writes a consistent backup to BACKUP_DIR (keeps BACKUP_KEEP) and, when BACKUP_REMOTE is set,
// copies it off the machine with rclone, e.g. BACKUP_REMOTE=gdrive:uniconnect-backups
import { execFileSync } from 'node:child_process';
import { openDb, closeDb } from '../src/db.js';
import { backupNow } from '../src/jobs.js';

openDb();
const file = backupNow();
closeDb();
console.log(`backup: ${file}`);
if (process.env.BACKUP_REMOTE) {
    execFileSync('rclone', ['copy', file, process.env.BACKUP_REMOTE], { stdio: 'inherit' });
    console.log(`copied to ${process.env.BACKUP_REMOTE}`);
}
