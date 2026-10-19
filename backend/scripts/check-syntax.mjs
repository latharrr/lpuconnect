// Syntax-checks every backend source file (deploy gate step 1).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const files = [];
(function walk(dir) {
    for (const f of readdirSync(dir)) {
        if (f === 'node_modules' || f === 'data') continue;
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(m?js)$/.test(f)) files.push(p);
    }
})(root);
let bad = 0;
for (const f of files) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (err) { bad++; console.error(`syntax error: ${f}\n${err.stderr}`); }
}
console.log(`${files.length - bad}/${files.length} files OK`);
process.exit(bad ? 1 : 0);
