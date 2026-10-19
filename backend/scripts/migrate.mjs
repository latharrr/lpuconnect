// Applies pending migrations to DB_PATH and prints the schema version list.
import { openDb, closeDb, all } from '../src/db.js';
import { config } from '../src/config.js';

openDb();
console.log(`database: ${config.dbPath}`);
for (const r of all('SELECT version, applied_at FROM schema_migrations ORDER BY version')) console.log(`  ${r.version}  ${r.applied_at}`);
closeDb();
