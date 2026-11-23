// Fails the build if anything secret reached the web bundle: the App Check debug token (or its variable name),
// a service-account key, or a private key. Runs after `vite build`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '..');
const DIST = join(WEB, 'dist');
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

const forbidden = [/VITE_APPCHECK_DEBUG_TOKEN/, /"type":\s*"service_account"/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
// The real debug token value, if this machine has one, must never appear either.
for (const env of ['.env.development.local', '.env.local', '.env']) {
  const p = join(WEB, env);
  if (!existsSync(p)) continue;
  const m = readFileSync(p, 'utf8').match(/^VITE_APPCHECK_DEBUG_TOKEN=(.+)$/m);
  if (m && m[1].trim().length >= 8) forbidden.push(new RegExp(m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const leaks = [];
for (const f of files(DIST).filter((p) => /\.(js|html|css|json|txt|webmanifest|map)$/.test(p))) {
  const text = readFileSync(f, 'utf8');
  for (const re of forbidden) if (re.test(text)) leaks.push(`${f.slice(WEB.length + 1)} matches ${re.source.slice(0, 40)}`);
}
if (leaks.length) { console.error(`Secret found in the web bundle:\n  ${leaks.join('\n  ')}`); process.exit(1); }
console.log(`check-dist: ${files(DIST).length} files, no secrets`);
