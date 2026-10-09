import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnv, makeUser, WsClient, type Client, type Env } from './helpers.js';

let env: Env;
let alice: Client;
beforeAll(async () => { env = await makeEnv(); alice = await makeUser(env, 'alice'); });
afterAll(async () => { await env.close(); });

const url = () => env.base.replace('http', 'ws') + '/api/ws';

describe('WebSocket per Einmal-Ticket (Client auf anderer Domain)', () => {
  it('Ticket verbindet ohne Cookie, ist einmalig verwendbar', async () => {
    const { ticket } = (await alice.post('/api/ws-ticket')).json;
    const w = new WsClient(url(), { origin: 'http://localhost:8080' });
    await w.opened;
    w.send({ type: 'auth', ticket });
    expect((await w.waitFor((m) => m.type === 'ready')).userId).toBe(alice.user.id);
    w.close();
    const again = new WsClient(url(), { origin: 'http://localhost:8080' });
    await again.opened;
    again.send({ type: 'auth', ticket });
    expect(await again.closed).toBe(4401);
  });

  it('Ticket ohne Anmeldung nicht erhältlich; fremder Origin und erfundene Tickets scheitern', async () => {
    expect((await new (alice.constructor as new (e: Env) => Client)(env).post('/api/ws-ticket')).status).toBe(401);
    const { ticket } = (await alice.post('/api/ws-ticket')).json;
    const evil = new WsClient(url(), { origin: 'https://evil.example' });
    await evil.opened;
    evil.send({ type: 'auth', ticket });
    expect(await evil.closed).toBe(4403);
    const fake = new WsClient(url(), { origin: 'http://localhost:8080' });
    await fake.opened;
    fake.send({ type: 'auth', ticket: 'erfunden' });
    expect(await fake.closed).toBe(4401);
  });

  it('Ticket einer beendeten Sitzung ist wertlos', async () => {
    const { ticket } = (await alice.post('/api/ws-ticket')).json;
    await alice.post('/api/auth/logout');
    const w = new WsClient(url(), { origin: 'http://localhost:8080' });
    await w.opened;
    w.send({ type: 'auth', ticket });
    expect(await w.closed).toBe(4401);
  });
});
