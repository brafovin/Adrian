import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCleanup } from '../src/jobs.js';
import { befriend, Client, makeEnv, makeUser, PNG_1x1, type Env } from './helpers.js';

let env: Env;
let alice: Client, bob: Client, carol: Client, dave: Client, stranger: Client;

beforeAll(async () => {
  env = await makeEnv();
  [alice, bob, carol, dave, stranger] = [await makeUser(env, 'alice'), await makeUser(env, 'bob'), await makeUser(env, 'carol'), await makeUser(env, 'dave'), await makeUser(env, 'stranger')];
  await befriend(alice, bob); await befriend(alice, carol); await befriend(alice, dave);
});
afterAll(async () => { await env.close(); });

const feedUsers = async (c: Client) => (await c.get('/api/statuses/feed')).json.groups.map((g: any) => g.user.username);

describe('Status', () => {
  it('Text-Status: Kontakte sehen ihn, Fremde nicht, Ansichten & Reaktionen', async () => {
    const wsB = await bob.ws();
    const r = await alice.post('/api/statuses', { kind: 'text', body: 'Guten Morgen ☀️', style: { bg: '#112233', color: '#ffffff', font: 'serif' } });
    expect(r.status).toBe(201);
    const s = r.json.status;
    expect(new Date(s.expiresAt).getTime() - new Date(s.publishedAt).getTime()).toBe(24 * 3600_000);
    expect((await wsB.waitFor((m) => m.type === 'status.new')).userId).toBe(alice.user.id);
    expect(await feedUsers(bob)).toEqual(['alice']);
    expect(await feedUsers(stranger)).toEqual([]);
    expect((await stranger.post(`/api/statuses/${s.id}/view`)).status).toBe(404);
    expect((await stranger.put(`/api/statuses/${s.id}/reaction`, { emoji: '😀' })).status).toBe(404);

    const g = (await bob.get('/api/statuses/feed')).json.groups[0];
    expect(g.statuses[0]).toMatchObject({ body: 'Guten Morgen ☀️', viewed: false });
    const wsA = await alice.ws();
    await bob.post(`/api/statuses/${s.id}/view`);
    expect((await wsA.waitFor((m) => m.type === 'status.viewed')).viewerId).toBe(bob.user.id);
    await bob.put(`/api/statuses/${s.id}/reaction`, { emoji: '❤️' });
    expect((await wsA.waitFor((m) => m.type === 'status.reaction')).emoji).toBe('❤️');
    await carol.post(`/api/statuses/${s.id}/view`);

    const v = (await alice.get(`/api/statuses/${s.id}/views`)).json;
    expect(v.views.map((x: any) => x.user.username).sort()).toEqual(['bob', 'carol']);
    expect(v.reactions[0]).toMatchObject({ emoji: '❤️' });
    expect((await alice.get('/api/statuses/mine')).json.statuses[0]).toMatchObject({ viewCount: 2, reactionCount: 1 });
    // Nur der Besitzer sieht die Liste
    expect((await bob.get(`/api/statuses/${s.id}/views`)).status).toBe(404);
    expect((await alice.put(`/api/statuses/${s.id}/reaction`, { emoji: '👍' })).status).toBe(403);
    wsA.close(); wsB.close();
  });

  it('läuft nach 24 Stunden serverseitig ab – auch ohne Cleanup-Job', async () => {
    const s = (await alice.post('/api/statuses', { kind: 'text', body: 'kurzlebig' })).json.status;
    expect((await feedUsers(bob))).toContain('alice');
    await env.ctx.db.query(`update statuses set published_at = now() - interval '24 hours 1 minute', expires_at = now() - interval '1 minute' where id = $1`, [s.id]);
    const feed = (await bob.get('/api/statuses/feed')).json.groups.flatMap((g: any) => g.statuses.map((x: any) => x.id));
    expect(feed).not.toContain(s.id);
    expect((await bob.post(`/api/statuses/${s.id}/view`)).status).toBe(404);
    expect((await bob.put(`/api/statuses/${s.id}/reaction`, { emoji: '👍' })).status).toBe(404);
    expect((await alice.get('/api/statuses/mine')).json.statuses.map((x: any) => x.id)).not.toContain(s.id);
  });

  it('Cleanup entfernt abgelaufene Status samt Medien', async () => {
    const up = await alice.upload(PNG_1x1, 's.png', 'image/png', { purpose: 'status' });
    const s = (await alice.post('/api/statuses', { kind: 'image', mediaId: up.json.media.id, body: 'Bild' })).json.status;
    expect((await bob.get(up.json.media.url)).status).toBe(200);
    expect((await stranger.get(up.json.media.url)).status).toBe(404);
    await env.ctx.db.query(`update statuses set expires_at = now() - interval '2 hours' where id = $1`, [s.id]);
    expect((await bob.get(up.json.media.url)).status).toBe(404); // sofort unzugänglich
    await env.ctx.db.query(`update media set created_at = now() - interval '2 days' where id = $1`, [up.json.media.id]);
    const res = await runCleanup(env.ctx);
    expect(res.statuses).toBeGreaterThanOrEqual(1);
    expect((await env.ctx.db.query('select 1 from media where id = $1', [up.json.media.id])).rowCount).toBe(0);
    expect((await env.ctx.db.query('select 1 from statuses where id = $1', [s.id])).rowCount).toBe(0);
  });

  it('Zielgruppe: nur ausgewählte Personen / alle außer', async () => {
    const only = (await alice.post('/api/statuses', { kind: 'text', body: 'nur Bob', visibility: 'only', audienceIds: [bob.user.id] })).json.status;
    const except = (await alice.post('/api/statuses', { kind: 'text', body: 'außer Bob', visibility: 'except', audienceIds: [bob.user.id] })).json.status;
    const bodies = async (c: Client) => (await c.get('/api/statuses/feed')).json.groups.flatMap((g: any) => g.statuses.map((x: any) => x.body));
    expect(await bodies(bob)).toContain('nur Bob');
    expect(await bodies(bob)).not.toContain('außer Bob');
    expect(await bodies(carol)).not.toContain('nur Bob');
    expect(await bodies(carol)).toContain('außer Bob');
    expect((await carol.post(`/api/statuses/${only.id}/view`)).status).toBe(404);
    expect((await bob.post(`/api/statuses/${except.id}/view`)).status).toBe(404);
    // Nur Kontakte auswählbar
    expect((await alice.post('/api/statuses', { kind: 'text', body: 'x', visibility: 'only', audienceIds: [stranger.user.id] })).status).toBe(400);
    expect((await alice.post('/api/statuses', { kind: 'text', body: 'x', visibility: 'only', audienceIds: [] })).status).toBe(400);
  });

  it('Entwürfe sind bearbeitbar, veröffentlichte nicht; Löschen entfernt sofort', async () => {
    const d = (await alice.post('/api/statuses', { kind: 'text', body: 'Entwurf', publish: false })).json.status;
    expect(d.publishedAt).toBeNull();
    expect((await bob.get('/api/statuses/feed')).json.groups.flatMap((g: any) => g.statuses.map((x: any) => x.id))).not.toContain(d.id);
    expect((await alice.patch(`/api/statuses/${d.id}`, { body: 'Entwurf v2' })).json.status.body).toBe('Entwurf v2');
    expect((await alice.post(`/api/statuses/${d.id}/publish`)).json.status.publishedAt).toBeTruthy();
    expect((await alice.patch(`/api/statuses/${d.id}`, { body: 'zu spät' })).status).toBe(409);
    expect((await bob.del(`/api/statuses/${d.id}`)).status).toBe(404);
    expect((await alice.del(`/api/statuses/${d.id}`)).status).toBe(200);
    expect((await bob.post(`/api/statuses/${d.id}/view`)).status).toBe(404);
  });

  it('Privatsphäre: Status-Sichtbarkeit aus, Blockierung, Lesebestätigungen', async () => {
    await alice.patch('/api/me/privacy', { statusVis: 'nobody' });
    await alice.post('/api/statuses', { kind: 'text', body: 'unsichtbar' });
    expect((await feedUsers(bob))).toEqual([]);
    await alice.patch('/api/me/privacy', { statusVis: 'contacts' });
    expect((await feedUsers(bob))).toEqual(['alice']);

    await alice.post('/api/blocks', { userId: dave.user.id });
    expect((await feedUsers(dave))).toEqual([]);
    await alice.del(`/api/blocks/${dave.user.id}`);
    expect((await feedUsers(dave))).toEqual([]); // Kontakt wurde durch Blockieren entfernt
    await befriend(alice, dave);

    // Wer Lesebestätigungen deaktiviert, hinterlässt keine Ansicht und sieht keine fremden Ansichten
    const sid = (await alice.get('/api/statuses/mine')).json.statuses[0].id;
    await dave.patch('/api/me/privacy', { readReceipts: false });
    await dave.post(`/api/statuses/${sid}/view`);
    expect((await alice.get(`/api/statuses/${sid}/views`)).json.views.map((v: any) => v.user.username)).not.toContain('dave');
    await alice.patch('/api/me/privacy', { readReceipts: false });
    expect((await alice.get(`/api/statuses/${sid}/views`)).json).toMatchObject({ hidden: true, views: [] });
    await alice.patch('/api/me/privacy', { readReceipts: true });
  });
});

describe('Privatsphäre & Profile', () => {
  it('Profilbild, Online-Status, zuletzt online und Beschreibung folgen den Einstellungen', async () => {
    const up = await alice.upload(PNG_1x1, 'a.png', 'image/png', { purpose: 'avatar' });
    await alice.put('/api/me/avatar', { mediaId: up.json.media.id });
    await alice.patch('/api/me', { bio: 'Hi, ich bin Alice' });
    const wsA = await alice.ws();
    const view = async (c: Client) => (await c.get(`/api/users/${alice.user.id}`)).json.user;

    expect(await view(bob)).toMatchObject({ avatarUrl: expect.stringContaining('/api/media/'), online: true, bio: 'Hi, ich bin Alice' });
    expect(await view(stranger)).toMatchObject({ avatarUrl: expect.any(String), online: true, relation: 'none' });

    await alice.patch('/api/me/privacy', { avatarVis: 'contacts', onlineVis: 'nobody', bioVis: 'contacts' });
    expect(await view(bob)).toMatchObject({ avatarUrl: expect.any(String), online: null });
    const s = await view(stranger);
    expect(s.avatarUrl).toBeNull();
    expect(s.bio).toBe('');
    expect(s.online).toBeNull();
    // Das Avatar-Bild selbst ist ebenfalls geschützt
    expect((await stranger.get(up.json.media.url)).status).toBe(404);
    expect((await bob.get(up.json.media.url)).status).toBe(200);

    // zuletzt online
    wsA.close();
    await new Promise((r) => setTimeout(r, 150));
    await alice.patch('/api/me/privacy', { lastSeenVis: 'nobody' });
    expect((await view(bob)).lastSeenAt).toBeNull();
    await alice.patch('/api/me/privacy', { lastSeenVis: 'contacts' });
    expect((await view(bob)).lastSeenAt).toBeTruthy();
    expect((await view(stranger)).lastSeenAt).toBeNull();
    await alice.patch('/api/me/privacy', { avatarVis: 'everyone', onlineVis: 'everyone', bioVis: 'everyone' });
  });

  it('Presence-Events respektieren die Privatsphäre', async () => {
    const wsB = await bob.ws();
    const wsA = await alice.ws();
    expect((await wsB.waitFor((m) => m.type === 'presence' && m.userId === alice.user.id)).online).toBe(true);
    await alice.patch('/api/me/privacy', { onlineVis: 'nobody', lastSeenVis: 'nobody' });
    wsA.close();
    await wsB.expectNone((m) => m.type === 'presence' && m.userId === alice.user.id, 400);
    await alice.patch('/api/me/privacy', { onlineVis: 'everyone', lastSeenVis: 'contacts' });
    wsB.close();
  });

  it('gemeinsame Gruppen nur, wenn freigegeben', async () => {
    const g = await alice.post('/api/conversations/group', { title: 'Gemeinsam', memberIds: [bob.user.id] });
    expect((await bob.get(`/api/users/${alice.user.id}`)).json.user.sharedGroups).toEqual([{ id: g.json.conversation.id, title: 'Gemeinsam' }]);
    await alice.patch('/api/me/privacy', { groupsVis: 'nobody' });
    expect((await bob.get(`/api/users/${alice.user.id}`)).json.user.sharedGroups).toBeNull();
    await alice.patch('/api/me/privacy', { groupsVis: 'contacts' });
  });

  it('Datenexport enthält die eigenen Daten und keine fremden Konten', async () => {
    const r = await bob.get('/api/me/export');
    expect(r.status).toBe(200);
    expect(r.json.account.username).toBe('bob');
    expect(JSON.stringify(r.json)).not.toContain('stranger@example.test');
    expect(JSON.stringify(r.json)).not.toContain('password_hash');
  });

  it('Meldungen werden gespeichert', async () => {
    expect((await bob.post('/api/reports', { userId: stranger.user.id, reason: 'spam', details: 'unerwünscht' })).status).toBe(200);
    expect((await env.ctx.db.query('select count(*)::int c from reports')).rows[0].c).toBe(1);
    expect((await bob.post('/api/reports', { userId: bob.user.id, reason: 'spam' })).status).toBe(400);
  });
});
