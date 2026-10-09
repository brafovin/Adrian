import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { befriend, Client, makeEnv, makeUser, makeUserDb, PNG_1x1, type Env } from './helpers.js';

describe('Rate-Limits & Missbrauchsschutz', () => {
  let env: Env;
  beforeAll(async () => { env = await makeEnv({ RATE_LIMIT_ENABLED: 'true', MESSAGE_RATE_PER_MINUTE: '5', NEW_CHAT_LIMIT_PER_HOUR: '2' }); });
  afterAll(async () => { await env.close(); });

  it('Registrierung ist pro IP begrenzt', async () => {
    const c = new Client(env);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await c.post('/api/auth/register', { email: `r${i}@example.test`, username: `reg_user_${i}`, displayName: 'R', password: 'correct-horse-battery' })).status);
    expect(codes.filter((s) => s === 201).length).toBe(10);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it('Passwort-Reset-Anfragen sind begrenzt', async () => {
    const c = new Client(env);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await c.post('/api/auth/forgot', { email: 'x@example.test' })).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
  });

  it('Nachrichten-Flut wird gedrosselt', async () => {
    const env2 = env;
    const [a, b] = [await makeUserDb(env2, 'floodera'), await makeUserDb(env2, 'flooderb')];
    await befriend(a, b);
    const conv = (await a.post('/api/conversations/direct', { userId: b.user.id })).json.conversation.id;
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await a.post(`/api/conversations/${conv}/messages`, { clientMsgId: `flood-${i}-xxxxx`, body: 'spam' })).status);
    expect(codes.filter((s) => s === 201).length).toBe(5);
    expect(codes.filter((s) => s === 429).length).toBe(3);
  });

  it('Begrenzung neuer Chats mit Fremden', async () => {
    const spammer = await makeUserDb(env, 'spammer');
    const victims = [] as Client[];
    for (let i = 0; i < 4; i++) { const v = await makeUserDb(env, `victim${i}`); await v.patch('/api/me/privacy', { dmFrom: 'everyone' }); victims.push(v); }
    const codes: number[] = [];
    for (const v of victims) codes.push((await spammer.post('/api/conversations/direct', { userId: v.user.id })).status);
    expect(codes).toEqual([200, 200, 429, 429]);
  });
});

describe('Zugriffsschutz (IDOR)', () => {
  let env: Env;
  let alice: Client, bob: Client, eve: Client;
  let conv: string, msgId: string, mediaUrl: string, statusId: string, callId: string;
  beforeAll(async () => {
    env = await makeEnv();
    [alice, bob, eve] = [await makeUser(env, 'alice'), await makeUser(env, 'bob'), await makeUser(env, 'eve')];
    await befriend(alice, bob);
    conv = (await alice.post('/api/conversations/direct', { userId: bob.user.id })).json.conversation.id;
    const up = await alice.upload(PNG_1x1, 'a.png', 'image/png', { purpose: 'message' });
    const m = await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'idor-0001-xx', kind: 'image', mediaId: up.json.media.id, body: 'privat' });
    msgId = m.json.message.id; mediaUrl = up.json.media.url;
    statusId = (await alice.post('/api/statuses', { kind: 'text', body: 'privater Status' })).json.status.id;
    const wa = await alice.ws(); const wb = await bob.ws();
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    callId = (await wa.waitFor((m) => m.type === 'call.invited')).callId;
    wb.send({ type: 'call.decline', callId });
    await wa.waitFor((m) => m.type === 'call.ended');
    wa.close(); wb.close();
  });
  afterAll(async () => { await env.close(); });

  it('Fremder (eve) bekommt auf keinem Endpunkt private Daten von Alice/Bob', async () => {
    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/conversations/${conv}`], ['GET', `/api/conversations/${conv}/messages`], ['GET', `/api/conversations/${conv}/messages?around=${msgId}`],
      ['GET', `/api/conversations/${conv}/search?q=privat`], ['GET', `/api/conversations/${conv}/invites`], ['POST', `/api/conversations/${conv}/read`, {}],
      ['POST', `/api/conversations/${conv}/clear`, {}], ['PATCH', `/api/conversations/${conv}/me`, { pinned: true }],
      ['POST', `/api/conversations/${conv}/members`, { userIds: [eve.user.id] }],
      ['GET', mediaUrl], ['GET', `${mediaUrl}?thumb=1`], ['DELETE', mediaUrl],
      ['PUT', `/api/chat-backgrounds/${conv}`, { mediaId: '00000000-0000-4000-8000-000000000000' }],
      ['POST', `/api/statuses/${statusId}/view`, {}], ['PUT', `/api/statuses/${statusId}/reaction`, { emoji: '👍' }], ['GET', `/api/statuses/${statusId}/views`],
      ['PATCH', `/api/statuses/${statusId}`, { body: 'x' }], ['DELETE', `/api/statuses/${statusId}`], ['POST', `/api/statuses/${statusId}/publish`, {}],
      ['PATCH', `/api/messages/${msgId}`, { body: 'x' }], ['DELETE', `/api/messages/${msgId}?scope=all`], ['DELETE', `/api/messages/${msgId}?scope=me`],
      ['PUT', `/api/messages/${msgId}/reaction`, { emoji: '👍' }], ['POST', `/api/messages/${msgId}/forward`, { conversationIds: [conv] }],
    ];
    for (const [method, url, body] of attempts) {
      const r = await eve.call(method, url, body);
      expect([401, 403, 404], `${method} ${url} → ${r.status} ${JSON.stringify(r.json)}`).toContain(r.status);
      expect(JSON.stringify(r.json)).not.toContain('privat');
    }
    expect((await eve.get('/api/calls')).json.calls).toEqual([]);
    expect((await eve.get('/api/statuses/feed')).json.groups).toEqual([]);
    expect((await eve.get('/api/conversations')).json.conversations).toEqual([]);
    expect((await eve.get('/api/me/export')).json.messages).toEqual([]);
    // Nichts wurde verändert
    expect((await alice.get(`/api/conversations/${conv}/messages`)).json.messages.find((x: any) => x.id === msgId).body).toBe('privat');
  });

  it('Anruf-Signalisierung von Fremden hat keine Wirkung auf fremde Anrufe', async () => {
    const wa = await alice.ws(); const wb = await bob.ws(); const we = await eve.ws();
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    const inc = await wb.waitFor((m) => m.type === 'call.incoming');
    we.send({ type: 'call.decline', callId: inc.callId });
    we.send({ type: 'call.cancel', callId: inc.callId });
    we.send({ type: 'call.end', callId: inc.callId });
    await wa.expectNone((m) => m.type === 'call.ended', 200);
    wb.send({ type: 'call.accept', callId: inc.callId });
    await wa.waitFor((m) => m.type === 'call.accepted');
    wa.send({ type: 'call.end', callId: inc.callId });
    await wb.waitFor((m) => m.type === 'call.ended');
    wa.close(); wb.close(); we.close();
  });

  it('SQL-Injection-Versuche in Suchen sind wirkungslos', async () => {
    const evil = encodeURIComponent(`' OR '1'='1'; drop table users; --`);
    expect((await eve.get(`/api/users/search?q=${evil}`)).json.users).toEqual([]);
    expect((await alice.get(`/api/conversations/${conv}/search?q=${evil}`)).json.messages).toEqual([]);
    expect((await alice.get(`/api/users/${evil}`)).status).toBe(404);
    expect((await env.ctx.db.query('select count(*)::int c from users')).rows[0].c).toBe(3);
  });

  it('Ungültige Eingaben: zu großer Body, kaputtes JSON, Pfad-Tricks im Dateinamen', async () => {
    const big = await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'big-0001-xxx', body: 'x'.repeat(9000) });
    expect(big.status).toBe(400);
    const huge = await fetch(env.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'a', password: 'x'.repeat(2_000_000) }) });
    expect(huge.status).toBe(413);
    const bad = await fetch(env.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{kaputt' });
    expect(bad.status).toBe(400);
    const up = await alice.upload(PNG_1x1, '../../../etc/passwd.png', 'image/png', { purpose: 'message' });
    expect(up.status).toBe(200);
    expect(up.json.media.name).toBe('passwd.png');
    const row = (await env.ctx.db.query('select storage_key from media where id = $1', [up.json.media.id])).rows[0];
    expect(row.storage_key).not.toContain('..');
  });

  it('Passwörter & Tokens landen nie in API-Antworten oder im Export', async () => {
    const me = await alice.get('/api/me');
    expect(JSON.stringify(me.json)).not.toMatch(/password|token_hash|scrypt/i);
    const exp = await alice.get('/api/me/export');
    expect(JSON.stringify(exp.json)).not.toMatch(/scrypt|token_hash|password_hash/i);
    const sessions = await alice.get('/api/me/sessions');
    expect(JSON.stringify(sessions.json)).not.toMatch(/token/i);
  });
});
