import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, makeEnv, makeUser, type Env } from './helpers.js';

let env: Env;
beforeAll(async () => { env = await makeEnv({ LOGIN_MAX_FAILURES: '3' }); });
afterAll(async () => { await env.close(); });

const outbox = () => (env.ctx.mailer as { outbox: { to: string; subject: string; text: string }[] }).outbox;
const tokenFor = (email: string, subject: RegExp) => {
  const m = [...outbox()].reverse().find((x) => x.to === email && subject.test(x.subject))!;
  return /token=([\w-]+)/.exec(m.text)![1]!;
};

describe('Registrierung & Anmeldung', () => {
  const c = new Client(null as never);
  const body = { email: 'Anna@Example.test', username: 'anna_1', displayName: 'Anna', password: 'correct-horse-battery' };

  it('registriert ohne Telefonnummer, Login erst nach E-Mail-Verifizierung', async () => {
    const cl = new Client(env);
    const r = await cl.post('/api/auth/register', body);
    expect(r.status).toBe(201);
    expect(r.json.verificationRequired).toBe(true);
    const l = await cl.post('/api/auth/login', { identifier: 'anna@example.test', password: body.password });
    expect(l.status).toBe(403);
    expect(l.json.error.code).toBe('email_not_verified');
    const bad = await cl.post('/api/auth/verify-email', { token: 'x'.repeat(30) });
    expect(bad.status).toBe(400);
    const v = await cl.post('/api/auth/verify-email', { token: tokenFor('anna@example.test', /bestätige/i) });
    expect(v.status).toBe(200);
    // Token ist einmalig
    expect((await cl.post('/api/auth/verify-email', { token: tokenFor('anna@example.test', /bestätige/i) })).status).toBe(400);
    const ok = await cl.post('/api/auth/login', { identifier: '@Anna_1', password: body.password });
    expect(ok.status).toBe(200);
    expect(ok.json.user.username).toBe('anna_1');
    expect(ok.json.user.email).toBe('anna@example.test');
    expect(ok.json.token).toBeUndefined(); // Browser: nur httpOnly-Cookie
    const setCookie = ok.headers.getSetCookie().join(';');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const me = await cl.get('/api/me');
    expect(me.json.user.id).toBe(ok.json.user.id);
    void c;
  });

  it('Passwort wird nur gehasht gespeichert', async () => {
    const { rows } = await env.ctx.db.query(`select password_hash from users where username = 'anna_1'`);
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(rows[0].password_hash).not.toContain(body.password);
  });

  it('lehnt doppelten Benutzernamen, reservierte Namen und schwache Passwörter ab', async () => {
    const cl = new Client(env);
    expect((await cl.post('/api/auth/register', { ...body, email: 'x@example.test', username: 'ANNA_1' })).status).toBe(409);
    expect((await cl.post('/api/auth/register', { ...body, email: 'x@example.test', username: 'admin' })).status).toBe(409);
    expect((await cl.post('/api/auth/register', { ...body, email: 'x@example.test', username: 'xx' })).status).toBe(400);
    expect((await cl.post('/api/auth/register', { ...body, email: 'x@example.test', username: 'bob', password: 'kurz' })).status).toBe(400);
    expect((await cl.post('/api/auth/register', { ...body, email: 'x@example.test', username: 'bob', password: 'password' })).status).toBe(400);
    expect((await cl.post('/api/auth/register', { ...body, email: 'x@example.test', username: 'bobbobbob', password: 'xx bobbobbob xx' })).status).toBe(400);
  });

  it('verrät nicht, ob eine E-Mail registriert ist', async () => {
    const cl = new Client(env);
    const before = outbox().length;
    const r = await cl.post('/api/auth/register', { ...body, username: 'anna_zwei' });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ ok: true, verificationRequired: true });
    expect(outbox().length).toBe(before + 1);
    const { rowCount } = await env.ctx.db.query(`select 1 from users where username = 'anna_zwei'`);
    expect(rowCount).toBe(0);
  });

  it('Honeypot-Feld: Bots werden still verworfen', async () => {
    const cl = new Client(env);
    const r = await cl.post('/api/auth/register', { ...body, email: 'bot@example.test', username: 'botuser', website: 'http://spam' });
    expect(r.status).toBe(200);
    expect((await env.ctx.db.query(`select 1 from users where username = 'botuser'`)).rowCount).toBe(0);
  });

  it('prüft Benutzernamen-Verfügbarkeit', async () => {
    const cl = new Client(env);
    expect((await cl.get('/api/auth/username-available?username=anna_1')).json.available).toBe(false);
    expect((await cl.get('/api/auth/username-available?username=frei_123')).json.available).toBe(true);
  });

  it('sperrt nach zu vielen Fehlversuchen (auch mit richtigem Passwort)', async () => {
    const u = await makeUser(env, 'lockme');
    const cl = new Client(env);
    for (let i = 0; i < 3; i++) expect((await cl.post('/api/auth/login', { identifier: 'lockme', password: 'falsch-falsch-1' })).status).toBe(401);
    const locked = await cl.post('/api/auth/login', { identifier: 'lockme', password: 'correct-horse-battery' });
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe('too_many_attempts');
    void u;
  });

  it('Abmelden beendet die Sitzung serverseitig', async () => {
    const u = await makeUser(env, 'leaver');
    const stolenCookie = u.cookie;
    expect((await u.post('/api/auth/logout')).status).toBe(200);
    const again = new Client(env);
    again.cookie = stolenCookie;
    expect((await again.get('/api/me')).status).toBe(401);
    expect((await u.get('/api/me', { bearer: true })).status).toBe(401);
  });

  it('CSRF: Cookie-Anfragen mit fremdem oder fehlendem Origin werden abgelehnt', async () => {
    const u = await makeUser(env, 'csrf_u');
    const evil = await u.call('PATCH', '/api/me', { displayName: 'Hacked' }, { headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const none = await u.call('PATCH', '/api/me', { displayName: 'Hacked' }, { noOrigin: true });
    expect(none.status).toBe(403);
    expect((await u.get('/api/me')).json.user.displayName).toBe('CSRF_U');
    // Bearer-Token (native Apps) ist nicht CSRF-anfällig
    const viaBearer = await u.call('PATCH', '/api/me', { displayName: 'Neu' }, { bearer: true, noOrigin: true });
    expect(viaBearer.status).toBe(200);
  });

  it('Sicherheits-Header sind gesetzt', async () => {
    const r = await new Client(env).get('/api/health');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('permissions-policy')).toContain('microphone=(self)');
  });
});

describe('Passwort zurücksetzen', () => {
  it('Reset-Link ist einmalig, setzt neues Passwort und beendet alle Sitzungen', async () => {
    const u = await makeUser(env, 'resetter');
    const email = 'resetter@example.test';
    const other = new Client(env);
    await other.post('/api/auth/login', { identifier: email, password: 'correct-horse-battery' });
    expect((await other.get('/api/me')).status).toBe(200);

    expect((await new Client(env).post('/api/auth/forgot', { email })).status).toBe(200);
    expect((await new Client(env).post('/api/auth/forgot', { email: 'unbekannt@example.test' })).status).toBe(200); // gleiche Antwort
    const token = tokenFor(email, /zurücksetzen/i);
    expect((await new Client(env).post('/api/auth/reset', { token, password: 'kurz' })).status).toBe(400);
    expect((await new Client(env).post('/api/auth/reset', { token, password: 'brand-new-passphrase-9' })).status).toBe(200);
    expect((await new Client(env).post('/api/auth/reset', { token, password: 'brand-new-passphrase-9' })).status).toBe(400);

    expect((await other.get('/api/me')).status).toBe(401);
    expect((await u.get('/api/me')).status).toBe(401);
    expect((await new Client(env).post('/api/auth/login', { identifier: email, password: 'correct-horse-battery' })).status).toBe(401);
    expect((await new Client(env).post('/api/auth/login', { identifier: email, password: 'brand-new-passphrase-9' })).status).toBe(200);
  });

  it('abgelaufene Tokens werden abgelehnt', async () => {
    await makeUser(env, 'expirer');
    await new Client(env).post('/api/auth/forgot', { email: 'expirer@example.test' });
    const token = tokenFor('expirer@example.test', /zurücksetzen/i);
    await env.ctx.db.query(`update email_tokens set expires_at = now() - interval '1 minute' where kind = 'reset'`);
    expect((await new Client(env).post('/api/auth/reset', { token, password: 'brand-new-passphrase-9' })).status).toBe(400);
  });
});

describe('Konto', () => {
  it('Passwort ändern beendet andere Sitzungen, Profil & Einstellungen', async () => {
    const u = await makeUser(env, 'changer');
    const second = new Client(env);
    await second.post('/api/auth/login', { identifier: 'changer', password: 'correct-horse-battery' });
    expect((await u.put('/api/me/password', { currentPassword: 'falsch', newPassword: 'another-long-pass-1' })).status).toBe(403);
    expect((await u.put('/api/me/password', { currentPassword: 'correct-horse-battery', newPassword: 'another-long-pass-1' })).status).toBe(200);
    expect((await second.get('/api/me')).status).toBe(401);
    expect((await u.get('/api/me')).status).toBe(200);

    const p = await u.patch('/api/me', { displayName: 'Neuer Name', bio: 'Hallo!' });
    expect(p.json.user.displayName).toBe('Neuer Name');
    const s = await u.patch('/api/me/settings', { theme: 'dark', accent: '#ff0000', notify: { hidePreviews: true } });
    expect(s.json.settings).toMatchObject({ theme: 'dark', accent: '#ff0000', notify: { hidePreviews: true, messages: true } });
    expect((await u.patch('/api/me/settings', { accent: 'rot' })).status).toBe(400);
    const sessions = await u.get('/api/me/sessions');
    expect(sessions.json.sessions.length).toBe(1);
    expect(sessions.json.sessions[0].current).toBe(true);
  });

  it('Konto löschen entfernt alle personenbezogenen Daten', async () => {
    const a = await makeUser(env, 'goner');
    const b = await makeUser(env, 'stayer');
    const up = await a.upload(Buffer.from('%PDF-1.4 test'), 'doc.pdf', 'application/pdf', { purpose: 'message' });
    expect(up.status).toBe(200);
    await a.post('/api/contact-requests', { userId: b.user.id });
    await a.patch('/api/me', { bio: 'geheim' });
    expect((await a.del('/api/me', { password: 'falsch-falsch-1' })).status).toBe(403);
    expect((await a.del('/api/me', { password: 'correct-horse-battery' })).status).toBe(200);
    expect((await a.get('/api/me')).status).toBe(401);
    const { rows } = await env.ctx.db.query(`select 1 from users where username = 'goner' or email = 'goner@example.test'`);
    expect(rows.length).toBe(0);
    expect((await env.ctx.db.query(`select 1 from media where owner_id = $1`, [a.user.id])).rowCount).toBe(0);
    expect((await env.ctx.db.query(`select 1 from audit_log where user_id = $1`, [a.user.id])).rowCount).toBe(0);
    expect((await new Client(env).post('/api/auth/login', { identifier: 'goner', password: 'correct-horse-battery' })).status).toBe(401);
    // Benutzername wieder frei
    expect((await b.get('/api/auth/username-available?username=goner')).json.available).toBe(true);
  });
});
