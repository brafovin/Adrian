import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { befriend, Client, makeEnv, makeUser, PNG_1x1, tick, type Env } from './helpers.js';

let env: Env;
let alice: Client, bob: Client, carol: Client, mallory: Client;
let convId: string;

beforeAll(async () => {
  env = await makeEnv();
  [alice, bob, carol, mallory] = [await makeUser(env, 'alice'), await makeUser(env, 'bob'), await makeUser(env, 'carol'), await makeUser(env, 'mallory')];
  await befriend(alice, bob);
  await befriend(alice, carol);
  await befriend(bob, carol);
});
afterAll(async () => { await env.close(); });

describe('Kontakte', () => {
  it('Suche nach Benutzernamen und Anzeigenamen, Privatsphäre (nicht auffindbar)', async () => {
    const r = await alice.get('/api/users/search?q=mall');
    expect(r.json.users.map((u: any) => u.username)).toEqual(['mallory']);
    expect(r.json.users[0].relation).toBe('none');
    expect((await alice.get('/api/users/search?q=@MALLORY')).json.users.length).toBe(1);
    expect((await alice.get('/api/users/search?q=CAROL')).json.users[0].relation).toBe('contact');
    await mallory.patch('/api/me/privacy', { discoverable: false });
    expect((await alice.get('/api/users/search?q=mallory')).json.users.length).toBe(0);
    expect((await alice.get(`/api/users/${mallory.user.id}`)).status).toBe(404);
    await mallory.patch('/api/me/privacy', { discoverable: true });
  });

  it('Kontaktanfragen: annehmen, ablehnen, Duplikate, Anfragen deaktivieren', async () => {
    const r1 = await mallory.post('/api/contact-requests', { userId: alice.user.id });
    expect(r1.status).toBe(201);
    expect((await mallory.post('/api/contact-requests', { userId: alice.user.id })).status).toBe(409);
    const inc = await alice.get('/api/contact-requests');
    expect(inc.json.incoming[0].user.username).toBe('mallory');
    expect((await alice.post(`/api/contact-requests/${inc.json.incoming[0].id}/decline`)).status).toBe(200);
    expect((await alice.get('/api/contacts')).json.contacts.map((c: any) => c.username).sort()).toEqual(['bob', 'carol']);
    await alice.patch('/api/me/privacy', { contactRequests: 'nobody' });
    expect((await mallory.post('/api/contact-requests', { userId: alice.user.id })).status).toBe(403);
    await alice.patch('/api/me/privacy', { contactRequests: 'everyone' });
  });

  it('Gegenseitige Anfragen werden automatisch zum Kontakt', async () => {
    const dave = await makeUser(env, 'dave');
    const erin = await makeUser(env, 'erin');
    await dave.post('/api/contact-requests', { userId: erin.user.id });
    const r = await erin.post('/api/contact-requests', { userId: dave.user.id });
    expect(r.json.status).toBe('accepted');
    expect((await dave.get('/api/contacts')).json.contacts.length).toBe(1);
  });
});

describe('Nachrichten in Echtzeit', () => {
  it('Einzelchat: Zustellung, Zustellstatus, Gelesen, Tippindikator, Offline-Sync', async () => {
    const wsA = await alice.ws();
    const wsB = await bob.ws();
    const c = await alice.post('/api/conversations/direct', { userId: bob.user.id });
    expect(c.status).toBe(200);
    convId = c.json.conversation.id;
    expect((await bob.post('/api/conversations/direct', { userId: alice.user.id })).json.conversation.id).toBe(convId);

    const send = await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'client-msg-0001', body: 'Hallo Bob 👋' });
    expect(send.status).toBe(201);
    expect(send.json.message.seq).toBe(1);
    const ev = await wsB.waitFor((m) => m.type === 'message.new');
    expect(ev.message.body).toBe('Hallo Bob 👋');
    expect(ev.message.senderId).toBe(alice.user.id);
    // Alice (anderes Gerät) sieht ihre Nachricht ebenfalls
    await wsA.waitFor((m) => m.type === 'message.new');
    // Zustellung → Alice bekommt „delivered“
    const rec = await wsA.waitFor((m) => m.type === 'receipt' && m.kind === 'delivered');
    expect(rec).toMatchObject({ userId: bob.user.id, seq: 1 });

    // Tippen
    wsB.send({ type: 'typing', conversationId: convId, typing: true });
    expect(await wsA.waitFor((m) => m.type === 'typing')).toMatchObject({ userId: bob.user.id, typing: true });

    // Lesen
    expect((await bob.get('/api/conversations')).json.conversations[0].unreadCount).toBe(1);
    await bob.post(`/api/conversations/${convId}/read`, {});
    expect(await wsA.waitFor((m) => m.type === 'receipt' && m.kind === 'read')).toMatchObject({ userId: bob.user.id, seq: 1 });
    expect((await bob.get('/api/conversations')).json.conversations[0].unreadCount).toBe(0);
    expect((await alice.get('/api/conversations')).json.conversations[0].receipts).toEqual({ deliveredSeq: 1, readSeq: 1 });
    const detail = await alice.get(`/api/conversations/${convId}`);
    expect(detail.json.members.find((m: any) => m.id === bob.user.id)).toMatchObject({ deliveredSeq: 1, readSeq: 1 });

    // Bob offline → Nachricht wird gespeichert und beim nächsten Verbinden synchronisiert
    wsB.close();
    await tick(100);
    await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'client-msg-0002', body: 'Bist du da?' });
    const list = await bob.get('/api/conversations');
    expect(list.json.conversations[0]).toMatchObject({ unreadCount: 1, lastSeq: 2 });
    const wsB2 = await bob.ws(); // verbindet → zugestellt
    expect(await wsA.waitFor((m) => m.type === 'receipt' && m.kind === 'delivered' && m.seq === 2)).toBeTruthy();
    const sync = await bob.get(`/api/conversations/${convId}/messages?after=1`);
    expect(sync.json.messages.map((m: any) => m.body)).toEqual(['Bist du da?']);
    wsA.close(); wsB2.close();
  });

  it('Wiederholte Sendeversuche erzeugen keine doppelten Nachrichten (Idempotenz)', async () => {
    const body = { clientMsgId: 'dup-0001-xxxx', body: 'nur einmal' };
    const [r1, r2, r3] = await Promise.all([1, 2, 3].map(() => alice.post(`/api/conversations/${convId}/messages`, body)));
    expect([r1!.json.message.id, r2!.json.message.id, r3!.json.message.id].every((id) => id === r1!.json.message.id)).toBe(true);
    const { rows } = await env.ctx.db.query(`select count(*)::int c from messages where body = 'nur einmal'`);
    expect(rows[0].c).toBe(1);
    expect([r1, r2, r3].filter((r) => r!.status === 201).length).toBe(1);
  });

  it('seq ist lückenlos bei parallelen Sendern', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? alice : bob).post(`/api/conversations/${convId}/messages`, { clientMsgId: `par-${i}-xxxxxx`, body: `p${i}` })));
    const { rows } = await env.ctx.db.query('select seq from messages where conversation_id = $1 order by seq', [convId]);
    expect(rows.map((r) => r.seq)).toEqual(rows.map((_, i) => i + 1));
  });

  it('Verlauf wird seitenweise geladen und durchsucht', async () => {
    const page1 = await alice.get(`/api/conversations/${convId}/messages?limit=5`);
    expect(page1.json.messages.length).toBe(5);
    expect(page1.json.hasMore).toBe(true);
    const seqs = page1.json.messages.map((m: any) => m.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    const page2 = await alice.get(`/api/conversations/${convId}/messages?limit=5&before=${seqs[0]}`);
    expect(page2.json.messages.at(-1).seq).toBe(seqs[0] - 1);
    const s = await alice.get(`/api/conversations/${convId}/search?q=einmal`);
    expect(s.json.messages.length).toBe(1);
    expect((await alice.get(`/api/conversations/${convId}/search?q=%25%25`)).json.messages.length).toBe(0); // % ist kein Platzhalter
  });

  it('Bearbeiten, Antworten, Reaktionen, Löschen, Weiterleiten', async () => {
    const m = (await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'edit-0001-xx', body: 'Tippfehlr' })).json.message;
    const ed = await alice.patch(`/api/messages/${m.id}`, { body: 'Tippfehler' });
    expect(ed.json.message.body).toBe('Tippfehler');
    expect(ed.json.message.editedAt).toBeTruthy();
    expect((await bob.patch(`/api/messages/${m.id}`, { body: 'fremd' })).status).toBe(403);

    const reply = await bob.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'reply-001-xx', body: 'Antwort', replyToId: m.id });
    expect(reply.json.message.replyTo).toMatchObject({ id: m.id, body: 'Tippfehler' });

    const wsA = await alice.ws();
    const rx = await bob.put(`/api/messages/${m.id}/reaction`, { emoji: '👍' });
    expect(rx.json.message.reactions).toEqual([{ userId: bob.user.id, emoji: '👍' }]);
    expect((await wsA.waitFor((e) => e.type === 'message.updated')).message.reactions.length).toBe(1);
    expect((await bob.put(`/api/messages/${m.id}/reaction`, { emoji: 'abc' })).status).toBe(400);
    expect((await bob.put(`/api/messages/${m.id}/reaction`, { emoji: null })).json.message.reactions).toEqual([]);

    // Weiterleiten in anderen Chat
    const c2 = (await alice.post('/api/conversations/direct', { userId: carol.user.id })).json.conversation;
    const fw = await alice.post(`/api/messages/${m.id}/forward`, { conversationIds: [c2.id] });
    expect(fw.json.messages[0]).toMatchObject({ forwarded: true, body: 'Tippfehler', conversationId: c2.id });

    // „Für mich löschen“ betrifft nur mich
    expect((await bob.del(`/api/messages/${m.id}?scope=me`)).status).toBe(200);
    expect((await bob.get(`/api/conversations/${convId}/messages?limit=100`)).json.messages.find((x: any) => x.id === m.id)).toBeUndefined();
    expect((await alice.get(`/api/conversations/${convId}/messages?limit=100`)).json.messages.find((x: any) => x.id === m.id)).toBeTruthy();

    // „Für alle löschen“: nur Absender
    expect((await bob.del(`/api/messages/${reply.json.message.id}?scope=all`)).status).toBe(200);
    expect((await alice.del(`/api/messages/${m.id}?scope=all`)).status).toBe(200);
    const after = (await alice.get(`/api/conversations/${convId}/messages?limit=100`)).json.messages.find((x: any) => x.id === m.id);
    expect(after).toMatchObject({ body: '', reactions: [] });
    expect(after.deletedAt).toBeTruthy();
    const other = await makeUser(env, 'someone');
    expect((await other.del(`/api/messages/${reply.json.message.id}?scope=all`)).status).toBe(404);
    wsA.close();
  });

  it('Löschfenster: nach Ablauf kein „für alle löschen“ / Bearbeiten mehr', async () => {
    const m = (await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'old-0001-xxxx', body: 'alt' })).json.message;
    await env.ctx.db.query(`update messages set created_at = now() - interval '3 days' where id = $1`, [m.id]);
    expect((await alice.del(`/api/messages/${m.id}?scope=all`)).status).toBe(403);
    expect((await alice.patch(`/api/messages/${m.id}`, { body: 'neu' })).status).toBe(403);
  });
});

describe('Berechtigungen (fremde Daten)', () => {
  it('Nicht-Mitglieder sehen weder Chats, Nachrichten, Suche noch Reaktionen', async () => {
    const m = (await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'secret-001-x', body: 'streng geheim' })).json.message;
    expect((await mallory.get(`/api/conversations/${convId}`)).status).toBe(404);
    expect((await mallory.get(`/api/conversations/${convId}/messages`)).status).toBe(404);
    expect((await mallory.get(`/api/conversations/${convId}/search?q=geheim`)).status).toBe(404);
    expect((await mallory.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'evil-0001-xx', body: 'hi' })).status).toBe(404);
    expect((await mallory.put(`/api/messages/${m.id}/reaction`, { emoji: '😈' })).status).toBe(404);
    expect((await mallory.patch(`/api/messages/${m.id}`, { body: 'x' })).status).toBe(404);
    expect((await mallory.del(`/api/messages/${m.id}?scope=all`)).status).toBe(404);
    expect((await mallory.post(`/api/messages/${m.id}/forward`, { conversationIds: [convId] })).status).toBe(404);
    expect((await mallory.post(`/api/conversations/${convId}/read`, {})).status).toBe(404);
    expect((await mallory.get('/api/conversations')).json.conversations).toEqual([]);
    expect((await new Client(env).get(`/api/conversations/${convId}/messages`)).status).toBe(401);
    // WebSocket ohne Sitzung
    const w = await mallory.ws();
    await w.expectNone((e) => e.type === 'message.new');
    w.close();
  });

  it('Ungültige IDs liefern saubere Fehler statt 500', async () => {
    expect((await alice.get('/api/conversations/not-a-uuid/messages')).status).toBe(400);
    expect((await alice.get('/api/conversations/00000000-0000-4000-8000-000000000000/messages')).status).toBe(404);
  });

  it('Direktnachricht an Fremde nur, wenn erlaubt; Blockieren sperrt Nachrichten', async () => {
    expect((await mallory.post('/api/conversations/direct', { userId: alice.user.id })).status).toBe(403);
    await alice.patch('/api/me/privacy', { dmFrom: 'everyone' });
    const c = await mallory.post('/api/conversations/direct', { userId: alice.user.id });
    expect(c.status).toBe(200);
    await alice.patch('/api/me/privacy', { dmFrom: 'contacts' });
    // Alice blockiert Mallory
    expect((await alice.post('/api/blocks', { userId: mallory.user.id })).status).toBe(200);
    const send = await mallory.post(`/api/conversations/${c.json.conversation.id}/messages`, { clientMsgId: 'blocked-001-x', body: 'hallo?' });
    expect(send.status).toBe(403);
    expect((await mallory.get(`/api/users/${alice.user.id}`)).status).toBe(404);
    expect((await mallory.get('/api/users/search?q=alice')).json.users.length).toBe(0);
    expect((await alice.get('/api/blocks')).json.blocked.map((b: any) => b.username)).toEqual(['mallory']);
    await alice.del(`/api/blocks/${mallory.user.id}`);
  });
});

describe('Gruppen', () => {
  let gid: string;
  it('erstellen, Mitglieder, Rollen, Berechtigungen, Verlassen', async () => {
    const wsC = await carol.ws();
    const g = await alice.post('/api/conversations/group', { title: 'Team', memberIds: [bob.user.id, carol.user.id] });
    expect(g.status).toBe(200);
    gid = g.json.conversation.id;
    expect(g.json.conversation).toMatchObject({ type: 'group', memberCount: 3, myRole: 'owner' });
    expect((await wsC.waitFor((m) => m.type === 'message.new')).message.system.type).toBe('group_created');
    // Nur Kontakte hinzufügen
    expect((await alice.post('/api/conversations/group', { title: 'X', memberIds: [mallory.user.id] })).status).toBe(403);
    // Mitglied darf nicht umbenennen / hinzufügen
    expect((await bob.patch(`/api/conversations/${gid}`, { title: 'Hack' })).status).toBe(403);
    expect((await bob.post(`/api/conversations/${gid}/members`, { userIds: [mallory.user.id] })).status).toBe(403);
    expect((await alice.patch(`/api/conversations/${gid}`, { title: 'Team Alpha' })).json.conversation.title).toBe('Team Alpha');
    // Bob zum Admin machen → Bob darf jetzt umbenennen
    expect((await alice.patch(`/api/conversations/${gid}/members/${bob.user.id}`, { role: 'admin' })).status).toBe(200);
    expect((await bob.patch(`/api/conversations/${gid}`, { title: 'Team Beta' })).status).toBe(200);
    // Admin darf Inhaber nicht entfernen
    expect((await bob.del(`/api/conversations/${gid}/members/${alice.user.id}`)).status).toBe(403);
    // Nachrichten
    const m = await carol.post(`/api/conversations/${gid}/messages`, { clientMsgId: 'grp-0001-xxx', body: 'Hallo Team' });
    expect(m.status).toBe(201);
    // Nur-Admins-dürfen-schreiben
    await alice.patch(`/api/conversations/${gid}`, { sendAdminsOnly: true });
    expect((await carol.post(`/api/conversations/${gid}/messages`, { clientMsgId: 'grp-0002-xxx', body: 'darf ich?' })).status).toBe(403);
    expect((await bob.post(`/api/conversations/${gid}/messages`, { clientMsgId: 'grp-0003-xxx', body: 'Admin darf' })).status).toBe(201);
    await alice.patch(`/api/conversations/${gid}`, { sendAdminsOnly: false });
    // Entfernen: Carol sieht danach nichts mehr
    expect((await alice.del(`/api/conversations/${gid}/members/${carol.user.id}`)).status).toBe(200);
    expect((await carol.get(`/api/conversations/${gid}/messages`)).status).toBe(404);
    // Wieder hinzufügen: Verlauf davor bleibt verborgen
    await alice.post(`/api/conversations/${gid}/members`, { userIds: [carol.user.id] });
    const seen = await carol.get(`/api/conversations/${gid}/messages`);
    expect(seen.json.messages.every((x: any) => x.kind === 'system' && x.system.type === 'member_added')).toBe(true);
    // Inhaber verlässt → Admin wird Inhaber
    expect((await alice.del(`/api/conversations/${gid}/members/${alice.user.id}`)).status).toBe(200);
    const d = await bob.get(`/api/conversations/${gid}`);
    expect(d.json.members.find((x: any) => x.id === bob.user.id).role).toBe('owner');
    expect(d.json.members.length).toBe(2);
    wsC.close();
  });

  it('Einladungslinks: Ablauf, Nutzungslimit, Widerruf', async () => {
    const g = (await bob.post('/api/conversations/group', { title: 'Linkgruppe', memberIds: [] })).json.conversation;
    expect((await carol.post(`/api/conversations/${g.id}/invites`, {})).status).toBe(404);
    const inv = await bob.post(`/api/conversations/${g.id}/invites`, { maxUses: 1 });
    const code = inv.json.code;
    expect((await mallory.get(`/api/invites/${code}`)).json.title).toBe('Linkgruppe');
    const j = await mallory.post(`/api/invites/${code}/join`);
    expect(j.status).toBe(200);
    expect((await carol.post(`/api/invites/${code}/join`)).status).toBe(404); // Limit erreicht
    const inv2 = await bob.post(`/api/conversations/${g.id}/invites`, { expiresInHours: 1 });
    await bob.del(`/api/conversations/${g.id}/invites/${inv2.json.code}`);
    expect((await carol.post(`/api/invites/${inv2.json.code}/join`)).status).toBe(404);
    const inv3 = await bob.post(`/api/conversations/${g.id}/invites`, { expiresInHours: 1 });
    await env.ctx.db.query(`update group_invites set expires_at = now() - interval '1 second' where code = $1`, [inv3.json.code]);
    expect((await carol.post(`/api/invites/${inv3.json.code}/join`)).status).toBe(404);
  });

  it('Chats anheften, stummschalten, archivieren', async () => {
    expect((await alice.patch(`/api/conversations/${convId}/me`, { pinned: true, archived: true, mutedUntil: new Date(Date.now() + 3600e3).toISOString() })).status).toBe(200);
    const c = (await alice.get('/api/conversations')).json.conversations.find((x: any) => x.id === convId);
    expect(c).toMatchObject({ archived: true });
    expect(c.pinnedAt).toBeTruthy();
    expect(c.mutedUntil).toBeTruthy();
    // gilt nur für mich
    const bc = (await bob.get('/api/conversations')).json.conversations.find((x: any) => x.id === convId);
    expect(bc).toMatchObject({ archived: false, pinnedAt: null, mutedUntil: null });
  });
});

describe('Medien', () => {
  it('Bild-Upload: Typ wird am Inhalt erkannt, nur Mitglieder dürfen laden', async () => {
    const up = await alice.upload(PNG_1x1, 'foto.png', 'image/png', { purpose: 'message' });
    expect(up.status).toBe(200);
    expect(up.json.media).toMatchObject({ kind: 'image', mime: 'image/png', width: 1, height: 1 });
    const sent = await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'img-0001-xxx', kind: 'image', mediaId: up.json.media.id, body: 'Schau mal' });
    expect(sent.json.message.media.id).toBe(up.json.media.id);
    const dl = await bob.call('GET', up.json.media.url);
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toBe('image/png');
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await bob.get(up.json.media.url + '?thumb=1')).status).toBe(200);
    // Fremde
    expect((await mallory.get(up.json.media.url)).status).toBe(404);
    expect((await new Client(env).get(up.json.media.url)).status).toBe(401);
    // Bob kann das Medium nicht in eigenen Nachrichten „klauen“
    expect((await bob.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'steal-001-xx', kind: 'image', mediaId: up.json.media.id })).status).toBe(400);
  });

  it('nicht gesendete Uploads sind nur für den Besitzer abrufbar', async () => {
    const up = await alice.upload(PNG_1x1, 'x.png', 'image/png', { purpose: 'message' });
    expect((await alice.get(up.json.media.url)).status).toBe(200);
    expect((await bob.get(up.json.media.url)).status).toBe(404);
  });

  it('lehnt Skripte, HTML, SVG, Fake-Endungen und zu große Dateien ab', async () => {
    expect((await alice.upload(Buffer.from('<script>alert(1)</script>'), 'x.html', 'text/html', { purpose: 'message' })).status).toBe(400);
    expect((await alice.upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg', 'image/svg+xml', { purpose: 'message' })).status).toBe(400);
    expect((await alice.upload(Buffer.from('MZ\x90\x00\x03'), 'virus.exe', 'application/octet-stream', { purpose: 'message' })).status).toBe(400);
    expect((await alice.upload(Buffer.from('<script>alert(1)</script>'), 'bild.png', 'image/png', { purpose: 'message' })).status).toBe(400); // „PNG“ ohne Inhalt
    expect((await alice.upload(Buffer.from('kein bild'), 'bg.pdf', 'application/pdf', { purpose: 'background' })).status).toBe(400);
    expect((await alice.upload(Buffer.alloc(11 * 1024 * 1024, 1), 'a.png', 'image/png', { purpose: 'avatar' })).status).toBe(413);
    expect((await alice.upload(Buffer.from('x'), 'x.png', 'image/png', { purpose: 'nope' })).status).toBe(400);
  });

  it('Dokumente werden als Download (nicht inline) ausgeliefert', async () => {
    const up = await alice.upload(Buffer.from('%PDF-1.4\n%test\n'), 'Rechnung ä.pdf', 'application/pdf', { purpose: 'message' });
    expect(up.json.media).toMatchObject({ kind: 'file', mime: 'application/pdf' });
    const m = await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'doc-0001-xxx', kind: 'file', mediaId: up.json.media.id });
    const dl = await bob.get(m.json.message.media.url);
    expect(dl.headers.get('content-disposition')).toContain('attachment');
    expect(dl.headers.get('content-type')).toBe('application/octet-stream');
    const txt = await alice.upload(Buffer.from('a,b\n1,2\n'), 'daten.csv', 'text/csv', { purpose: 'message' });
    expect(txt.status).toBe(200);
  });

  it('Sprachnachricht (Audio) und Video mit Range-Anfragen', async () => {
    // Minimale WAV-Datei
    const wav = Buffer.alloc(44 + 1600);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + 1600, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(1600, 40);
    const up = await alice.upload(wav, 'voice.wav', 'audio/wav', { purpose: 'message', durationMs: '100' });
    expect(up.json.media).toMatchObject({ kind: 'audio', durationMs: 100 });
    const m = await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'voice-001-xx', kind: 'voice', mediaId: up.json.media.id });
    expect(m.status).toBe(201);
    const rng = await bob.get(m.json.message.media.url, { headers: { range: 'bytes=0-9' } });
    expect(rng.status).toBe(206);
    expect(rng.headers.get('content-range')).toBe(`bytes 0-9/${wav.length}`);
    expect((await bob.get(m.json.message.media.url, { headers: { range: 'bytes=99999-' } })).status).toBe(416);
    // Falscher Nachrichtentyp für das Medium
    expect((await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'voice-002-xx', kind: 'image', mediaId: up.json.media.id })).status).toBe(400);
  });

  it('Gelöschte Nachricht gibt den Anhang nicht mehr frei', async () => {
    const up = await alice.upload(PNG_1x1, 'p.png', 'image/png', { purpose: 'message' });
    const m = await alice.post(`/api/conversations/${convId}/messages`, { clientMsgId: 'delmedia-01x', kind: 'image', mediaId: up.json.media.id });
    expect((await bob.get(up.json.media.url)).status).toBe(200);
    await alice.del(`/api/messages/${m.json.message.id}?scope=all`);
    expect((await bob.get(up.json.media.url)).status).toBe(404);
  });
});

describe('Individuelle Chat-Hintergründe', () => {
  it('pro Chat, privat, synchronisiert über Geräte, zurücksetzbar', async () => {
    const src = await alice.upload(PNG_1x1, 'galerie.png', 'image/png', { purpose: 'background' });
    const cropped = await alice.upload(PNG_1x1, 'zugeschnitten.png', 'image/png', { purpose: 'background' });
    const wsA2 = await alice.ws(); // zweites Gerät
    const put = await alice.put(`/api/chat-backgrounds/${convId}`, {
      mediaId: cropped.json.media.id, sourceMediaId: src.json.media.id, params: { zoom: 1.5, x: 0.2, y: -0.1, brightness: 0.8, overlay: 0.3, blur: 2 },
    });
    expect(put.status).toBe(200);
    expect(put.json.background.params).toMatchObject({ zoom: 1.5, overlay: 0.3 });
    expect((await wsA2.waitFor((m) => m.type === 'background.updated')).background.mediaId).toBe(cropped.json.media.id);

    // Standard-Hintergrund für alle Chats
    const def = await alice.upload(PNG_1x1, 'default.png', 'image/png', { purpose: 'background' });
    expect((await alice.put('/api/chat-backgrounds/default', { mediaId: def.json.media.id })).status).toBe(200);
    const list = await alice.get('/api/chat-backgrounds');
    expect(list.json.backgrounds.length).toBe(2);

    // Bob sieht nichts davon – weder in der Liste noch das Bild
    expect((await bob.get('/api/chat-backgrounds')).json.backgrounds).toEqual([]);
    expect((await bob.get(cropped.json.media.url)).status).toBe(404);
    const wsB = await bob.ws();
    await wsB.expectNone((m) => m.type === 'background.updated');
    // Bob kann keine fremden Bilder als Hintergrund setzen
    expect((await bob.put(`/api/chat-backgrounds/${convId}`, { mediaId: cropped.json.media.id })).status).toBe(400);
    // Fremde Chats: Hintergrund nicht setzbar
    expect((await mallory.put(`/api/chat-backgrounds/${convId}`, { mediaId: def.json.media.id })).status).toBe(404);
    // Ungültige Parameter
    expect((await alice.put(`/api/chat-backgrounds/${convId}`, { mediaId: cropped.json.media.id, params: { overlay: 5 } })).status).toBe(400);
    // Nur Bilder mit passendem Zweck
    const msgImg = await alice.upload(PNG_1x1, 'm.png', 'image/png', { purpose: 'message' });
    expect((await alice.put(`/api/chat-backgrounds/${convId}`, { mediaId: msgImg.json.media.id })).status).toBe(400);

    // Zurücksetzen
    expect((await alice.del(`/api/chat-backgrounds/${convId}`)).status).toBe(200);
    expect((await wsA2.waitFor((m) => m.type === 'background.updated' && m.background === null)).conversationId).toBe(convId);
    expect((await alice.get('/api/chat-backgrounds')).json.backgrounds.length).toBe(1);
    expect((await alice.get(cropped.json.media.url)).status).toBe(404); // Datei wurde entfernt
    wsA2.close(); wsB.close();
  });
});
