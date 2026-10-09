import { generateKeyPairSync, createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { befriend, Client, makeEnv, makeUser, type Env } from './helpers.js';

let env: Env;
let alice: Client, bob: Client;
const sent: { endpoint: string; body: any; opts: any }[] = [];

beforeAll(async () => {
  const vapid = webpush.generateVAPIDKeys();
  env = await makeEnv({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:test@example.test' });
  env.ctx.push.webSender = async (sub, body, opts) => { sent.push({ endpoint: sub.endpoint, body: JSON.parse(body), opts }); };
  [alice, bob] = [await makeUser(env, 'alice'), await makeUser(env, 'bob')];
  await befriend(alice, bob);
  void generateKeyPairSync; void createECDH; void randomBytes;
});
afterAll(async () => { await env.close(); });

const sub = (n: string) => ({ provider: 'webpush', endpoint: `https://push.example.test/${n}`, keys: { p256dh: 'BP' + 'x'.repeat(86), auth: 'a'.repeat(22) } });

describe('Push-Benachrichtigungen', () => {
  it('liefert den öffentlichen VAPID-Schlüssel', async () => {
    expect((await alice.get('/api/push/config')).json.webPushPublicKey).toBe(env.cfg.VAPID_PUBLIC_KEY);
  });

  it('Offline-Gerät bekommt Push, online verbundenes nicht', async () => {
    expect((await bob.put('/api/push/subscription', sub('bob-1'))).status).toBe(200);
    const conv = (await alice.post('/api/conversations/direct', { userId: bob.user.id })).json.conversation.id;
    sent.length = 0;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0001-xx', body: 'Hallo offline' });
    expect(sent.length).toBe(1);
    expect(sent[0]!.body).toMatchObject({ kind: 'message', title: 'ALICE', body: 'Hallo offline', url: `/chats/${conv}` });

    const ws = await bob.ws();
    sent.length = 0;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0002-xx', body: 'Hallo online' });
    expect(sent.length).toBe(0);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // Absender bekommt nie eine Push für die eigene Nachricht
    expect((await alice.put('/api/push/subscription', sub('alice-1'))).status).toBe(200);
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0003-xx', body: 'x' });
    expect(sent.every((s) => !s.endpoint.endsWith('alice-1'))).toBe(true);
  });

  it('beachtet Stummschaltung, Einstellungen und „Inhalte ausblenden“', async () => {
    const conv = (await alice.post('/api/conversations/direct', { userId: bob.user.id })).json.conversation.id;
    await bob.patch(`/api/conversations/${conv}/me`, { mutedUntil: new Date(Date.now() + 3600e3).toISOString() });
    sent.length = 0;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0010-xx', body: 'leise' });
    expect(sent.length).toBe(0);
    await bob.patch(`/api/conversations/${conv}/me`, { mutedUntil: null });

    await bob.patch('/api/me/settings', { notify: { hidePreviews: true } });
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0011-xx', body: 'Geheimer Inhalt' });
    expect(sent.at(-1)!.body).toMatchObject({ title: 'Adrian', body: 'Neue Nachricht' });
    expect(JSON.stringify(sent.at(-1))).not.toContain('Geheimer');
    await bob.patch('/api/me/settings', { notify: { hidePreviews: false, messages: false } });
    sent.length = 0;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0012-xx', body: 'aus' });
    expect(sent.length).toBe(0);
    await bob.patch('/api/me/settings', { notify: { messages: true } });
  });

  it('Kontaktanfragen, Anrufe, verpasste Anrufe und Gruppenbeitritte lösen Push aus', async () => {
    const carol = await makeUser(env, 'carol');
    await carol.put('/api/push/subscription', sub('carol-1'));
    sent.length = 0;
    await alice.post('/api/contact-requests', { userId: carol.user.id });
    await new Promise((r) => setTimeout(r, 150));
    expect(sent.at(-1)!.body).toMatchObject({ kind: 'request', title: 'Neue Kontaktanfrage' });
    const inc = (await carol.get('/api/contact-requests')).json.incoming[0];
    await carol.post(`/api/contact-requests/${inc.id}/accept`);

    sent.length = 0;
    await alice.post('/api/conversations/group', { title: 'Pushgruppe', memberIds: [carol.user.id] });
    await new Promise((r) => setTimeout(r, 150));
    expect(sent.some((s) => s.body.kind === 'group' && s.body.title === 'Neue Gruppe')).toBe(true);

    // Anruf: auch wenn das Gerät offline ist; danach verpasst
    const wa = await alice.ws();
    sent.length = 0;
    wa.send({ type: 'call.invite', toUserId: carol.user.id, kind: 'video' });
    await wa.waitFor((m) => m.type === 'call.invited');
    await new Promise((r) => setTimeout(r, 150));
    expect(sent.find((s) => s.body.kind === 'call')!.opts.urgency).toBe('high');
    wa.send({ type: 'call.cancel', callId: (await wa.waitFor(() => false, 50).catch(() => null), [...env.calls['live'].keys()][0]) });
    await new Promise((r) => setTimeout(r, 200));
    expect(sent.some((s) => s.body.kind === 'missed_call')).toBe(true);
    wa.close();
  });

  it('entfernt ungültige Abos (410) und beim Abmelden', async () => {
    const dave = await makeUser(env, 'dave');
    await befriend(alice, dave);
    await dave.put('/api/push/subscription', sub('dave-gone'));
    env.ctx.push.webSender = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); };
    const conv = (await alice.post('/api/conversations/direct', { userId: dave.user.id })).json.conversation.id;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'push-0020-xx', body: 'x' });
    expect((await env.ctx.db.query(`select 1 from push_subscriptions where endpoint like '%dave-gone'`)).rowCount).toBe(0);
    await dave.put('/api/push/subscription', sub('dave-2'));
    await dave.post('/api/auth/logout');
    expect((await env.ctx.db.query(`select 1 from push_subscriptions where endpoint like '%dave-2'`)).rowCount).toBe(0);
  });
});
