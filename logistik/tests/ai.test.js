// Tests für Datenauszug, Lokalmodus und Darstellung des Assistenten. Aufruf: node --test logistik/tests/ai.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'js');
const store = {};
const ctx = { console, setTimeout, clearTimeout, URL, Blob, URLSearchParams, CSS: { escape: (s) => s }, location: { href: 'http://x/logistik/#/', hash: '' },
  document: { addEventListener() {}, querySelector() { return null; } }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
ctx.window = ctx; vm.createContext(ctx);
const files = ['core', 'data', 'store', 'logic', 'ui', 'views-core', 'views-dispo', 'views-master', 'views-ops', 'views-app', 'views-portal', 'views-fin', 'views-admin', 'help', 'ai'];
vm.runInContext(files.map((f) => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n') + '\nthis.__t = { seedDB, aiSnapshot, aiLocal, aiFmt, aiPageCtx, aiEntities, aiSuggestions, aiPriceAnswer, calcPrice, cityGeo, setDB: (d) => { DB = d; SESS = { userId: "u1", branch: "all", app: {} }; }, sess: () => SESS, getDB: () => DB, ord, today, eur, fDate, stat, readyOrders };', ctx);
const T = ctx.__t;
const fresh = (user = 'u1', branch = 'all') => { const db = T.seedDB(); T.setDB(db); T.sess().userId = user; T.sess().branch = branch; ctx.location.hash = ''; return db; };
const page = (name = 'dashboard', id = '') => ({ name, id, label: name });

test('Datenauszug: enthält die Lage, aber keine Straßen, Telefonnummern, E-Mails und keine Unterschriften', () => {
  const db = fresh(); const snap = T.aiSnapshot(page());
  assert.ok(snap.startsWith('Stand:') && snap.includes('## Kennzahlen') && snap.includes('A-2026-0021') && snap.includes('JWG-1DP7H') === (db.orders.find((o) => o.nr === 'A-2026-0021').tracking === 'JWG-1DP7H'));
  assert.ok(!/@/.test(snap), 'keine E-Mail-Adressen');
  assert.ok(!/\+49|\b0\d{2,4} ?555/.test(snap), 'keine Telefonnummern');
  assert.ok(!/Hafenallee|Goethestraße|Schildergasse|Lindenallee|Rosenweg|Bahnhofstraße/.test(snap), 'keine Straßen');
  assert.ok(!/data:image/.test(snap), 'keine Bilder oder Unterschriften');
  assert.ok(snap.length < 60000, 'Größe: ' + snap.length);
  const shop = db.orders.find((o) => o.source === 'shop' && o.delivery.name.includes(' '));
  const last = shop.delivery.name.split(' ').pop();
  assert.ok(!snap.includes(last), `Privatperson ${shop.delivery.name} nur mit Initialen`);
  assert.ok(!/[<>]/.test(snap), 'keine Tag-Zeichen im Auszug');
});

test('Datenauszug folgt Rolle und Standortfilter', () => {
  let db = fresh('u6'); // Lager
  let snap = T.aiSnapshot(page());
  assert.ok(snap.includes('## Lager') && !snap.includes('## Rechnungen') && !snap.includes('## Kunden') && !snap.includes('## Touren') && !snap.includes('## Fahrer'), 'Lager sieht nur Lager und Aufträge');
  assert.ok(snap.includes('Benutzerrolle: Lager'));
  db = fresh('u1', 'b2'); snap = T.aiSnapshot(page());
  const lines = snap.split('\n').filter((l) => /^A-2026-\d{4} \|/.test(l));
  assert.ok(lines.length > 0);
  for (const l of lines) assert.strictEqual(db.orders.find((o) => o.nr === l.slice(0, 11)).branch, 'b2', l.slice(0, 11));
  assert.ok(snap.includes('Standortfilter: Hamburg'));
});

test('Lokalmodus: Zahlen stimmen mit den Daten überein', () => {
  const db = fresh();
  const open = db.orders.filter((o) => ['entwurf', 'offen'].includes(o.status)).length;
  assert.match(T.aiLocal('Wie viele Aufträge sind offen?', page()), new RegExp(`\\*\\*${open} offene Aufträge`));
  const o = db.orders.find((x) => x.status === 'abgeholt');
  const a = T.aiLocal(`Wo ist ${o.tracking}?`, page());
  assert.ok(a.includes(o.nr) && a.includes('Abgeholt'), a);
  const late = T.aiLocal('Welche Sendungen sind verspätet?', page()); assert.ok(/A-2026-0021/.test(late) || /keine Sendung ist verspätet/i.test(late), late);
  const over = T.aiLocal('Welche Rechnungen sind überfällig?', page()); assert.match(over, /R-2026-0003/);
  const gs = T.aiLocal('Welche Fahrzeuge sind gesperrt?', page()); assert.ok(gs.includes('HH-JW 201') && gs.includes('M-JW 101'));
  const um = T.aiLocal('Wie hoch ist der Umsatz?', page()); assert.match(um, /Umsatz [\d.]+,\d\d[\s\u00a0]€/);
});

test('Lokalmodus: freie Fahrer berücksichtigen Abwesenheit und Touren', () => {
  const db = fresh();
  const free = T.aiLocal('Welche Fahrer sind morgen frei?', page());
  assert.ok(free.includes('Dennis Schulte'), free);
  assert.ok(!free.includes('Marek Wolny') && !free.includes('Ines Bauer'), 'abwesende Fahrer fehlen');
  assert.ok(!free.includes('Julia Neumann'), 'Fahrerin mit Tour morgen fehlt');
  const count = T.aiLocal('Wie viele Fahrer sind frei?', page()); assert.match(count, /Fahrer sind frei \(heute/);
  assert.ok(db.drivers.length > 0);
});

test('Lokalmodus: Preisauskunft nutzt die Preisberechnung der App', () => {
  const db = fresh();
  const a = T.aiLocal('Was kostet ein Palettenversand von Frankfurt nach Hamburg mit 300 kg?', page());
  const pr = T.calcPrice({ type: 'palette', prio: 'normal', extras: [], goods: { weight: 300, volume: 0, pallets: 0 }, pickup: T.cityGeo('Frankfurt am Main'), delivery: T.cityGeo('Hamburg') }, db);
  assert.ok(a.includes(T.eur(pr.net)) && a.includes('Maut'), a);
  assert.ok(T.aiLocal('Was kostet ein Paket von Köln nach München mit 3 kg per Express?', page()).includes('Expresszuschlag'));
  assert.match(T.aiLocal('Wie weit ist es von München nach Berlin?', page()), /ca\. \d+ km/);
});

test('Lokalmodus: Anleitungen, Rollenschutz, Seitenkontext, Fallback', () => {
  fresh();
  assert.match(T.aiLocal('Wie lege ich einen Auftrag an?', page()), /Neuer Auftrag/);
  assert.match(T.aiLocal('Wie weise ich einen Auftrag einer Tour zu?', page()), /Drag-and-drop/);
  assert.match(T.aiLocal('Wie erstelle ich eine Rechnung?', page()), /Sammelrechnung/);
  assert.match(T.aiLocal('Wie funktioniert die Fahrer-App offline?', page()), /Offline/);
  assert.match(T.aiLocal('blubb xyz', page()), /keine passende Antwort/);
  const o = T.getDB().orders.find((x) => x.nr === 'A-2026-0021'); ctx.location.hash = '#/auftraege/A-2026-0021';
  const p = T.aiPageCtx(); assert.strictEqual(p.name, 'auftraege'); assert.strictEqual(p.id, 'A-2026-0021');
  assert.match(T.aiLocal('Wo ist diese Sendung?', p), /A-2026-0021/);
  assert.ok(o && T.aiSuggestions(p).some((s) => /diese Sendung/.test(s)));
  fresh('u6');
  assert.match(T.aiLocal('Welche Rechnungen sind überfällig?', page()), /keinen Zugriff/);
  assert.match(T.aiLocal('Welche Fahrer sind morgen frei?', page()), /keinen Zugriff/);
  assert.match(T.aiLocal('Wie viele Hoodies haben wir?', page()), /Hoodie Core/, 'Lager darf Bestände sehen');
});

test('Darstellung: maskiert HTML, verlinkt nur vorhandene Nummern und gültige Ziele', () => {
  fresh();
  const evil = T.aiFmt('<img src=x onerror=alert(1)> **fett** [[Klick|javascript:alert(1)]] [[Seite|#/dispo]] A-2026-0021 A-2099-0001 - Punkt');
  assert.ok(!evil.includes('<img') && evil.includes('&lt;img'));
  assert.ok(evil.includes('<b>fett</b>'));
  assert.ok(!evil.includes('javascript:alert'), 'kein javascript-Link als Anker');
  assert.ok(evil.includes('href="#/dispo"'));
  assert.ok(evil.includes('href="#/auftraege/A-2026-0021"'));
  assert.ok(!evil.includes('A-2099-0001</a>'), 'unbekannte Nummer bleibt Text');
  const list = T.aiFmt('Intro\n- eins\n- zwei'); assert.ok(list.includes('<ul><li>eins</li><li>zwei</li></ul>'));
  fresh('u6'); assert.ok(!T.aiFmt('R-2026-0003').includes('<a'), 'ohne Rechtegewährung kein Link auf Abrechnung');
});
