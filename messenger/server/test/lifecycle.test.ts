import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { runCleanup } from '../src/jobs.js';
import { befriend, Client, makeEnv, makeUser, PNG_1x1, type Env } from './helpers.js';

let env: Env;
let alice: Client, bob: Client, carol: Client;
beforeAll(async () => {
  env = await makeEnv();
  [alice, bob, carol] = [await makeUser(env, 'alice'), await makeUser(env, 'bob'), await makeUser(env, 'carol')];
  await befriend(alice, bob); await befriend(alice, carol); await befriend(bob, carol);
});
afterAll(async () => { await env.close(); });

describe('Migrationen', () => {
  it('sind idempotent und erkennen nachträgliche Änderungen', async () => {
    expect(await migrate(env.ctx.db)).toEqual([]);
    await env.ctx.db.query(`update schema_migrations set checksum = 'manipuliert' where version = '001_init.sql'`);
    await expect(migrate(env.ctx.db)).rejects.toThrow(/verändert/);
  });
});

describe('Bereinigung', () => {
  it('entfernt verwaiste Uploads, alte Tokens, hängende Anrufe', async () => {
    const orphan = await alice.upload(PNG_1x1, 'o.png', 'image/png', { purpose: 'message' });
    const used = await alice.upload(PNG_1x1, 'u.png', 'image/png', { purpose: 'message' });
    const conv = (await alice.post('/api/conversations/direct', { userId: bob.user.id })).json.conversation.id;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'clean-0001-x', kind: 'image', mediaId: used.json.media.id });
    await env.ctx.db.query(`update media set created_at = now() - interval '2 days'`);
    await env.ctx.db.query(`insert into email_tokens(user_id, kind, token_hash, expires_at) values ($1,'reset','h1', now() - interval '30 days')`, [alice.user.id]);
    await env.ctx.db.query(`insert into calls(caller_id, callee_id, kind, state, created_at) values ($1,$2,'audio','ringing', now() - interval '1 hour')`, [alice.user.id, bob.user.id]);
    const res = await runCleanup(env.ctx);
    expect(res).toMatchObject({ orphanMedia: 1, tokens: 1, stuckCalls: 1 });
    expect((await alice.get(orphan.json.media.url)).status).toBe(404);
    expect((await bob.get(used.json.media.url)).status).toBe(200);
  });
});

describe('Konto löschen mit Gruppen und Chats', () => {
  it('Inhaber geht → Rolle wird weitergegeben; Nachrichten werden unkenntlich; Gegenüber sieht „Gelöschter Nutzer“', async () => {
    const dave = await makeUser(env, 'dave');
    await befriend(dave, alice); await befriend(dave, bob);
    const g = (await dave.post('/api/conversations/group', { title: 'Davegruppe', memberIds: [alice.user.id, bob.user.id] })).json.conversation;
    await dave.post(`/api/conversations/${g.id}/messages`, { clientMsgId: 'dave-g-0001x', body: 'Gruppentext von Dave' });
    const direct = (await dave.post('/api/conversations/direct', { userId: alice.user.id })).json.conversation;
    await dave.post(`/api/conversations/${direct.id}/messages`, { clientMsgId: 'dave-d-0001x', body: 'Privates von Dave' });
    const wa = await alice.ws();

    expect((await dave.del('/api/me', { password: 'correct-horse-battery' })).status).toBe(200);
    await wa.waitFor((m) => m.type === 'conversation.updated');

    const members = (await alice.get(`/api/conversations/${g.id}`)).json.members;
    expect(members.length).toBe(2);
    expect(members.filter((m: any) => m.role === 'owner').length).toBe(1);
    const gm = (await alice.get(`/api/conversations/${g.id}/messages`)).json.messages;
    expect(gm.find((m: any) => m.body === 'Gruppentext von Dave')).toBeUndefined();
    expect(gm.find((m: any) => m.deletedAt && m.senderId === null && m.body === '')).toBeTruthy(); // Tombstone ohne Absender
    const dm = (await alice.get(`/api/conversations/${direct.id}/messages`)).json.messages;
    expect(JSON.stringify(dm)).not.toContain('Privates von Dave');
    const list = (await alice.get('/api/conversations')).json.conversations.find((c: any) => c.id === direct.id);
    expect(list.peer.displayName).toBe('Gelöschter Nutzer');
    expect((await alice.post(`/api/conversations/${direct.id}/messages`, { clientMsgId: 'to-gone-0001', body: 'hallo?' })).status).toBe(403);
    wa.close();
  });
});
