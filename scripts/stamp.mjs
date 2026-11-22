// Copies app/ to dist/ and stamps the git sha into index.html (meta + footer).
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
const sha = execSync('git rev-parse --short=12 HEAD').toString().trim();
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const p = 'dist/index.html';
writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__BUILD_SHA__', sha));
console.log('stamped', sha);
