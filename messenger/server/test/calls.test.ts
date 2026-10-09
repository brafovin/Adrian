import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { befriend, Client, makeEnv, makeUser, tick, type Env } from './helpers.js';

let env: Env;
let alice: Client, bob: Client, carol: Client, stranger: Client;

beforeAll(async () => {
  env = await makeEnv({ CALL_RING_SECONDS: '1', CALL_DROP_GRACE_SECONDS: '1', TURN_URLS: 'turn:turn.example.test:3478', TURN_SECRET: 'turn-secret' });
  [alice, bob, carol, stranger] = [await makeUser(env, 'alice'), await makeUser(env, 'bob'), await makeUser(env, 'carol'), await makeUser(env, 'stranger')];
  await befriend(alice, bob); await befriend(alice, carol); await befriend(bob, carol);
});
afterAll(async () => { await env.close(); });

describe('Anruf-Signaling', () => {
  it('Sprachanruf: klingeln, annehmen, WebRTC-Signale weiterleiten, beenden, Verlauf', async () => {
    const wa = await alice.ws();
    const wb = await bob.ws();
    const wb2 = await bob.ws(); // zweites Gerät klingelt ebenfalls
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    const invited = await wa.waitFor((m) => m.type === 'call.invited');
    const inc = await wb.waitFor((m) => m.type === 'call.incoming');
    await wb2.waitFor((m) => m.type === 'call.incoming');
    expect(inc).toMatchObject({ callId: invited.callId, kind: 'audio', peer: { username: 'alice' } });
    // TURN-Zugangsdaten sind zeitlich begrenzt und enthalten die Benutzer-ID
    const turn = inc.iceServers.find((s: any) => s.credential);
    expect(turn.urls).toEqual(['turn:turn.example.test:3478']);
    expect(turn.username).toMatch(new RegExp(`^\\d+:${bob.user.id}$`));
    expect(Number(turn.username.split(':')[0])).toBeGreaterThan(Date.now() / 1000);

    wb.send({ type: 'call.accept', callId: inc.callId });
    await wa.waitFor((m) => m.type === 'call.accepted');
    await wb.waitFor((m) => m.type === 'call.accepted');
    expect((await wb2.waitFor((m) => m.type === 'call.handled')).callId).toBe(inc.callId);

    // Offer/Answer/ICE wird NUR an das annehmende Gerät weitergegeben
    wa.send({ type: 'call.signal', callId: inc.callId, data: { type: 'offer', sdp: 'v=0 fake' } });
    expect((await wb.waitFor((m) => m.type === 'call.signal')).data).toEqual({ type: 'offer', sdp: 'v=0 fake' });
    wb.send({ type: 'call.signal', callId: inc.callId, data: { type: 'answer', sdp: 'v=0 fake-answer' } });
    expect((await wa.waitFor((m) => m.type === 'call.signal')).data.type).toBe('answer');
    await wb2.expectNone((m) => m.type === 'call.signal');

    await tick(1100);
    wa.send({ type: 'call.end', callId: inc.callId });
    expect((await wb.waitFor((m) => m.type === 'call.ended')).reason).toBe('hangup');
    await wa.waitFor((m) => m.type === 'call.ended');

    const hist = (await bob.get('/api/calls')).json.calls;
    expect(hist[0]).toMatchObject({ id: inc.callId, kind: 'audio', direction: 'incoming', state: 'ended', missed: false, peer: { username: 'alice' } });
    expect(hist[0].durationSeconds).toBeGreaterThanOrEqual(1);
    expect((await alice.get('/api/calls')).json.calls[0].direction).toBe('outgoing');
    wa.close(); wb.close(); wb2.close();
  });

  it('Dritte können keine Signale einschleusen oder fremde Anrufe beenden', async () => {
    const wa = await alice.ws(); const wb = await bob.ws(); const wc = await carol.ws();
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'video' });
    const inc = await wb.waitFor((m) => m.type === 'call.incoming');
    wb.send({ type: 'call.accept', callId: inc.callId });
    await wa.waitFor((m) => m.type === 'call.accepted');
    wc.send({ type: 'call.signal', callId: inc.callId, data: { type: 'offer', sdp: 'evil' } });
    wc.send({ type: 'call.end', callId: inc.callId });
    wc.send({ type: 'call.accept', callId: inc.callId });
    await wb.expectNone((m) => m.type === 'call.signal' || m.type === 'call.ended');
    await wa.expectNone((m) => m.type === 'call.ended', 100);
    wa.send({ type: 'call.end', callId: inc.callId });
    await wb.waitFor((m) => m.type === 'call.ended');
    wa.close(); wb.close(); wc.close();
  });

  it('Ablehnen, Abbrechen, Zeitüberschreitung → verpasster Anruf, Besetzt', async () => {
    const wa = await alice.ws(); const wb = await bob.ws();
    // ablehnen
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    let inc = await wb.waitFor((m) => m.type === 'call.incoming');
    wb.send({ type: 'call.decline', callId: inc.callId });
    expect((await wa.waitFor((m) => m.type === 'call.ended')).state).toBe('declined');
    await wb.waitFor((m) => m.type === 'call.ended');
    // abbrechen → verpasst für Bob
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    inc = await wb.waitFor((m) => m.type === 'call.incoming');
    wa.send({ type: 'call.cancel', callId: inc.callId });
    await wb.waitFor((m) => m.type === 'call.missed');
    await wb.waitFor((m) => m.type === 'call.ended');
    await wa.waitFor((m) => m.type === 'call.ended');
    // Timeout (1 s)
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'video' });
    inc = await wb.waitFor((m) => m.type === 'call.incoming');
    const ended = await wb.waitFor((m) => m.type === 'call.ended', 3000);
    expect(ended.reason).toBe('timeout');
    await wb.waitFor((m) => m.type === 'call.missed');
    const hist = (await bob.get('/api/calls')).json.calls;
    expect(hist.slice(0, 3).map((c: any) => [c.state, c.missed])).toEqual([['missed', true], ['missed', true], ['declined', false]]);
    // besetzt
    const wc = await carol.ws();
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    const inc2 = await wb.waitFor((m) => m.type === 'call.incoming');
    wb.send({ type: 'call.accept', callId: inc2.callId });
    await wa.waitFor((m) => m.type === 'call.accepted');
    wc.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    expect((await wc.waitFor((m) => m.type === 'call.ended')).reason).toBe('busy');
    wa.send({ type: 'call.end', callId: inc2.callId });
    await wb.waitFor((m) => m.type === 'call.ended');
    wa.close(); wb.close(); wc.close();
  });

  it('Verbindungsabbruch: aktiver Anruf wird nach der Karenzzeit beendet, Rückkehr rettet ihn', async () => {
    let wa = await alice.ws(); const wb = await bob.ws();
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    const inc = await wb.waitFor((m) => m.type === 'call.incoming');
    wb.send({ type: 'call.accept', callId: inc.callId });
    await wa.waitFor((m) => m.type === 'call.accepted');
    // Alice verliert kurz die Verbindung und kommt zurück
    wa.close(); await tick(200);
    wa = await alice.ws();
    wa.send({ type: 'call.rejoin', callId: inc.callId });
    expect((await wa.waitFor((m) => m.type === 'call.rejoined')).state).toBe('active');
    await tick(1300);
    await wb.expectNone((m) => m.type === 'call.ended', 50);
    // Jetzt bricht Bob endgültig weg
    wb.close();
    const ended = await wa.waitFor((m) => m.type === 'call.ended', 4000);
    expect(ended.reason).toBe('connection_lost');
    wa.close();
  });

  it('Datenschutz: Blockierte/Fremde/„niemand“ können nicht anrufen', async () => {
    const ws = await stranger.ws(); const wb = await bob.ws();
    ws.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    expect((await ws.waitFor((m) => m.type === 'call.error')).code).toBe('not_allowed');
    await wb.expectNone((m) => m.type === 'call.incoming', 150);
    await bob.patch('/api/me/privacy', { callsFrom: 'everyone' });
    ws.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    const inc = await wb.waitFor((m) => m.type === 'call.incoming');
    ws.send({ type: 'call.cancel', callId: inc.callId });
    await bob.post('/api/blocks', { userId: stranger.user.id });
    ws.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    expect((await ws.waitFor((m) => m.type === 'call.error' && m.code === 'not_allowed')).code).toBe('not_allowed');
    await bob.del(`/api/blocks/${stranger.user.id}`);
    await bob.patch('/api/me/privacy', { callsFrom: 'nobody' });
    const wa = await alice.ws();
    wa.send({ type: 'call.invite', toUserId: bob.user.id, kind: 'audio' });
    expect((await wa.waitFor((m) => m.type === 'call.error')).code).toBe('not_allowed');
    await bob.patch('/api/me/privacy', { callsFrom: 'contacts' });
    ws.close(); wb.close(); wa.close();
  });

  it('Anrufverlauf ist privat', async () => {
    expect((await stranger.get('/api/calls')).json.calls.every((c: any) => c.peer.username === 'bob')).toBe(true);
    const own = (await env.ctx.db.query(`select count(*)::int c from calls where caller_id = $1 or callee_id = $1`, [carol.user.id])).rows[0].c;
    expect((await carol.get('/api/calls')).json.calls.length).toBe(own);
    expect((await env.ctx.db.query(`select count(*)::int c from calls`)).rows[0].c).toBeGreaterThan(own);
    expect((await new Client(env).get('/api/calls')).status).toBe(401);
    expect((await alice.get('/api/calls/ice')).json.turn).toBe(true);
  });

  it('klingelnde Anrufe werden nach dem Verbinden zugestellt (z. B. nach Push-Öffnung)', async () => {
    const wa = await alice.ws();
    wa.send({ type: 'call.invite', toUserId: carol.user.id, kind: 'audio' });
    await wa.waitFor((m) => m.type === 'call.invited');
    const wc = await carol.ws(); // erst jetzt online
    expect((await wc.waitFor((m) => m.type === 'call.incoming')).peer.username).toBe('alice');
    wa.send({ type: 'call.cancel', callId: (await wc.waitFor((m) => m.type === 'call.ended')).callId });
    wa.close(); wc.close();
  });
});
