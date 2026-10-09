/* Einfacher Lasttest: N Paare tauschen parallel Nachrichten aus; misst Zustell-Latenz (POST → WebSocket-Empfang).
   Nutzung: npx tsx bench/load.ts [Paare=50] [Nachrichten je Benutzer=40] */
import { befriend, makeEnv, makeUserDb } from '../test/helpers.js';

const pairs = Number(process.argv[2] ?? 50);
const per = Number(process.argv[3] ?? 40);
const env = await makeEnv();
const lat: number[] = [];
const t0 = Date.now();
const users = [] as Awaited<ReturnType<typeof makeUserDb>>[];
for (let i = 0; i < pairs * 2; i++) users.push(await makeUserDb(env, `load${i}`));
for (let i = 0; i < pairs; i++) await befriend(users[2 * i]!, users[2 * i + 1]!);
console.log(`Setup ${pairs * 2} Benutzer: ${Date.now() - t0} ms`);

const convs = await Promise.all(Array.from({ length: pairs }, (_, i) => users[2 * i]!.post('/api/conversations/direct', { userId: users[2 * i + 1]!.user.id }).then((r) => r.json.conversation.id as string)));
const sockets = await Promise.all(users.map((u) => u.ws()));
const sentAt = new Map<string, number>();
sockets.forEach((w) => w.ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'message.new' && m.message.clientMsgId && sentAt.has(m.message.clientMsgId)) {
    lat.push(Date.now() - sentAt.get(m.message.clientMsgId)!);
  }
}));
const start = Date.now();
let failed = 0;
await Promise.all(Array.from({ length: pairs }, async (_, i) => {
  for (let k = 0; k < per; k++) {
    const sender = users[2 * i + (k % 2)]!;
    const id = `load-${i}-${k}-${Math.random().toString(16).slice(2)}`;
    sentAt.set(id, Date.now());
    const r = await sender.post(`/api/conversations/${convs[i]}/messages`, { clientMsgId: id, body: `Nachricht ${k}` });
    if (r.status !== 201) failed++;
  }
}));
await new Promise((r) => setTimeout(r, 500));
const dur = (Date.now() - start) / 1000;
lat.sort((a, b) => a - b);
const q = (p: number) => lat[Math.floor(lat.length * p)] ?? 0;
console.log(`${pairs * per} Nachrichten von ${pairs * 2} verbundenen Benutzern in ${dur.toFixed(1)} s = ${(pairs * per / dur).toFixed(0)} Nachrichten/s, fehlgeschlagen: ${failed}`);
console.log(`Zustell-Latenz (Absender-Anfrage → Empfänger-WebSocket): p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${lat.at(-1)} ms, empfangen ${lat.length}/${pairs * per}`);
sockets.forEach((w) => w.close());
await env.close();
