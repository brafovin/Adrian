import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { befriend, Client, makeEnv, makeUser, tick, type Env } from './helpers.js';

let env: Env;
let alice: Client, bob: Client;
beforeAll(async () => {
  env = await makeEnv();
  [alice, bob] = [await makeUser(env, 'alice'), await makeUser(env, 'bob')];
  await befriend(alice, bob);
});
afterAll(async () => { await env.close(); });

/** Zweites Gerät desselben Kontos = eigene Sitzung. */
async function secondDevice(c: Client): Promise<Client> {
  const d = new Client(env, `${c.name}-device2`);
  const r = await d.post('/api/auth/login', { identifier: c.name, password: 'correct-horse-battery', deviceName: 'Tablet' });
  d.user = r.json.user;
  return d;
}

describe('Mehrere Geräte pro Konto', () => {
  it('alle Geräte erhalten Nachrichten, Lesestatus und Einstellungen synchron', async () => {
    const bob2 = await secondDevice(bob);
    const w1 = await bob.ws(); const w2 = await bob2.ws();
    const conv = (await alice.post('/api/conversations/direct', { userId: bob.user.id })).json.conversation.id;
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'sync-0001-xx', body: 'an beide Geräte' });
    expect((await w1.waitFor((m) => m.type === 'message.new')).message.body).toBe('an beide Geräte');
    expect((await w2.waitFor((m) => m.type === 'message.new')).message.body).toBe('an beide Geräte');

    // Auf Gerät 1 gelesen → Gerät 2 setzt den Zähler zurück
    expect((await bob2.get('/api/conversations')).json.conversations[0].unreadCount).toBe(1);
    await bob.post(`/api/conversations/${conv}/read`, {});
    await w2.waitFor((m) => m.type === 'conversation.read');
    expect((await bob2.get('/api/conversations')).json.conversations[0].unreadCount).toBe(0);

    // Einstellungen & Archivierung auf Gerät 2 sichtbar
    await bob.patch('/api/me/settings', { theme: 'dark' });
    expect((await w2.waitFor((m) => m.type === 'settings.updated')).settings.theme).toBe('dark');
    await bob.patch(`/api/conversations/${conv}/me`, { archived: true });
    await w2.waitFor((m) => m.type === 'conversation.updated');
    expect((await bob2.get('/api/conversations')).json.conversations[0].archived).toBe(true);

    // Für-mich-Löschen auf Gerät 1 → Gerät 2 erhält Ereignis
    const msgs = (await bob.get(`/api/conversations/${conv}/messages`)).json.messages;
    await bob.del(`/api/messages/${msgs[0].id}?scope=me`);
    expect((await w2.waitFor((m) => m.type === 'message.hidden')).messageId).toBe(msgs[0].id);
    w1.close(); w2.close();
  });

  it('Gerät nach Offline-Phase: Verlauf und Zähler stimmen nach dem Nachladen', async () => {
    const conv = (await alice.post('/api/conversations/direct', { userId: bob.user.id })).json.conversation.id;
    const w = await bob.ws();
    await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: 'off-0001-xxx', body: 'eins' });
    const seen = await w.waitFor((m) => m.type === 'message.new');
    w.close(); await tick(100);
    for (let i = 0; i < 5; i++) await alice.post(`/api/conversations/${conv}/messages`, { clientMsgId: `off-000${i + 2}-xx`, body: `offline ${i}` });
    const sync = await bob.get(`/api/conversations/${conv}/messages?after=${seen.message.seq}`);
    expect(sync.json.messages.map((m: any) => m.body)).toEqual(['offline 0', 'offline 1', 'offline 2', 'offline 3', 'offline 4']);
    expect(sync.json.messages.map((m: any) => m.seq)).toEqual([seen.message.seq + 1, seen.message.seq + 2, seen.message.seq + 3, seen.message.seq + 4, seen.message.seq + 5]);
  });

  it('Abmelden eines Geräts beendet nur dessen WebSocket', async () => {
    const bob2 = await secondDevice(bob);
    const w1 = await bob.ws(); const w2 = await bob2.ws();
    await bob2.post('/api/auth/logout');
    expect(await w2.closed).toBe(4001);
    expect(w1.ws.readyState).toBe(1);
    w1.close();
  });

  it('Sitzung widerrufen → WebSocket wird sofort getrennt', async () => {
    const bob3 = await secondDevice(bob);
    const w3 = await bob3.ws();
    const list = (await bob.get('/api/me/sessions')).json.sessions;
    const target = list.find((s: any) => s.deviceName === 'Tablet' && !s.current);
    expect((await bob.del(`/api/me/sessions/${target.id}`)).status).toBe(200);
    expect(await w3.closed).toBe(4001);
    expect((await bob3.get('/api/me')).status).toBe(401);
  });
});
