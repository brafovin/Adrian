/* Baut die Oberfläche für Vercel (statisches Hosting) und leitet /api/* an den separat gehosteten Server weiter.
   Vercel kann den Server selbst nicht ausführen (dauerhafte WebSocket-Verbindungen, PostgreSQL) – siehe docs/VERCEL.md.

   Pflicht:  BACKEND_URL=https://dein-server.example.com   (ohne abschließenden Slash)
   Optional: WS_URL=wss://dein-server.example.com/api/ws   (Standard: aus BACKEND_URL abgeleitet) */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const backend = (process.env.BACKEND_URL ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+$/.test(backend)) {
  console.error('\nFEHLER: Umgebungsvariable BACKEND_URL fehlt oder ist ungültig (erwartet z. B. https://chat-api.example.com).');
  console.error('Ohne Backend gibt es beim Registrieren/Anmelden den Fehler 405. Siehe messenger/docs/VERCEL.md.\n');
  process.exit(1);
}
const wsUrl = process.env.WS_URL || `${backend.replace(/^https/, 'wss')}/api/ws`;

execSync('npx tsc --noEmit && npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_WS_URL: wsUrl } });

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/static`, { recursive: true });
cpSync('dist', `${out}/static`, { recursive: true });

const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' blob:",
  `connect-src 'self' ${wsUrl.replace(/\/api\/ws$/, '')}`, "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');

const config = {
  version: 3,
  routes: [
    { src: '/(.*)', headers: {
      'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=()', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    }, continue: true },
    { src: '/(sw\\.js|manifest\\.webmanifest)', headers: { 'Cache-Control': 'no-cache' }, continue: true },
    { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    // API über denselben Ursprung → Sitzungs-Cookie (httpOnly) bleibt erste-Partei-Cookie
    { src: '/api/(.*)', dest: `${backend}/api/$1` },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
};
writeFileSync(`${out}/config.json`, JSON.stringify(config, null, 2));
console.log(`Vercel-Ausgabe erstellt: /api/* → ${backend}, WebSocket → ${wsUrl}`);
