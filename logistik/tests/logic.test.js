// Tests für die Geschäftslogik von JWG.logistik. Aufruf: node --test logistik/tests/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'js');
const store = {};
const ctx = {
  console, setTimeout, clearTimeout, URL, Blob, CSS: { escape: (s) => s }, location: { href: 'http://x/logistik/#/' },
  document: { addEventListener() {}, querySelector() { return null; } }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
};
ctx.window = ctx;
vm.createContext(ctx);
const src = ['core.js', 'data.js', 'store.js', 'logic.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
vm.runInContext(src + '\nthis.__t = { seedDB, scheduleTour, tourPosition, calcPrice, problems, isLate, orderEta, tourLoad, invoiceState, checkAssign, optimizeTour, suggestTours, assignOrder, unassignOrder, importShopOrders, newOrderFrom, csvOf, csvCell, esc, html, fmtNo, setDB: (d) => { DB = d; }, getDB: () => DB, hhmm, today, at, addDays, diffDays, roadKm, co2Of, estCost, driverAbsent, dueState, CITY, SHOP_KEY, setStatus };', ctx);
const T = ctx.__t;
const fresh = () => { const db = T.seedDB(); T.setDB(db); return db; };

test('Beispieldaten sind in sich stimmig', () => {
  const db = fresh();
  assert.ok(db.orders.length >= 35 && db.customers.length >= 10 && db.drivers.length >= 10 && db.vehicles.length >= 10);
  const ids = new Set(db.orders.map((o) => o.id));
  assert.strictEqual(ids.size, db.orders.length, 'Auftragsnummern eindeutig');
  assert.strictEqual(new Set(db.orders.map((o) => o.tracking)).size, db.orders.length, 'Sendungsnummern eindeutig');
  for (const t of db.tours) {
    for (const k of t.seq) assert.ok(ids.has(k.split(':')[0]), `Stopp ${k} verweist auf bestehenden Auftrag`);
    t.seq.forEach((k, i) => { if (k.endsWith(':D')) assert.ok(t.seq.indexOf(k.replace(':D', ':P')) < i, `Abholung vor Zustellung in ${t.id}`); });
    for (const k of Object.keys(t.done)) assert.ok(t.seq.includes(k));
  }
  for (const o of db.orders) {
    if (o.tourId) assert.ok(db.tours.find((t) => t.id === o.tourId).seq.some((k) => k.startsWith(o.id + ':')), `${o.id} ist in seiner Tour`);
    assert.ok(o.pickup.lat && o.delivery.lon, 'Koordinaten vorhanden');
  }
  for (const i of db.invoices) assert.strictEqual(Math.round((i.net + i.vat) * 100), Math.round(i.gross * 100), `Rechnung ${i.nr} summiert sich`);
  assert.ok(db.orders.some((o) => o.status === 'offen' && o.pickup.date === T.today()), 'heute gibt es einen offenen Auftrag zum Disponieren');
});

test('laufende Touren: Position und ETA hängen an der aktuellen Zeit', () => {
  const db = fresh();
  const running = db.tours.filter((t) => t.status === 'unterwegs');
  assert.strictEqual(running.length, 2);
  for (const t of running) {
    const pos = T.tourPosition(t, db);
    assert.ok(pos.next && pos.frac >= 0 && pos.frac <= 1 && pos.pos.lat > 47 && pos.pos.lat < 56);
    const sch = T.scheduleTour(t, db);
    const next = sch.stops.find((s) => !s.done);
    assert.ok(next.eta >= Date.now() - 2 * 60000, 'nächste ETA liegt nicht in der Vergangenheit');
  }
  assert.ok(T.problems(db).some((p) => p.kind === 'Verspätet'), 'eine Verspätung ist im Beispiel enthalten');
});

test('Preisberechnung: Mindestpreis, Zuschläge, Kundentarif', () => {
  const db = fresh();
  const base = { type: 'paket', prio: 'normal', extras: [], customerId: db.customers[0].id, goods: { weight: 1, volume: 0.01, pallets: 0 }, pickup: { lat: 50.1, lon: 8.64 }, delivery: { lat: 50.12, lon: 8.7 } };
  const p0 = T.calcPrice(base, db);
  assert.ok(p0.net >= db.settings.transportTypes[0].min * 0.99, 'Mindestpreis gilt');
  const ex = T.calcPrice({ ...base, prio: 'express' }, db);
  assert.ok(ex.net > p0.net && ex.lines.some((l) => /Express/.test(l.label)));
  const heavy = T.calcPrice({ ...base, type: 'palette', goods: { weight: 100, volume: 2, pallets: 1 }, delivery: { lat: 53.55, lon: 9.99 } }, db);
  assert.ok(heavy.lines.some((l) => /Maut/.test(l.label)), 'Maut bei Palettenversand');
  assert.ok(heavy.kg >= 500, 'Volumengewicht (2 m³ × 250 kg) zählt');
  const c = db.customers.find((x) => x.discount > 0);
  const withDisc = T.calcPrice({ ...base, customerId: c.id }, db), noDisc = T.calcPrice({ ...base, customerId: db.customers[0].id }, db);
  assert.ok(withDisc.net < noDisc.net && withDisc.lines.some((l) => /Kundentarif/.test(l.label)));
  assert.strictEqual(Math.round(heavy.net * 100), Math.round(heavy.lines.reduce((s, l) => s + l.amount, 0) * 100));
  assert.strictEqual(T.roadKm({ lat: 50, lon: 8 }, { lat: 50, lon: 8 }), 0);
});

test('Zuweisung: Fehler blockieren, Hinweise warnen', () => {
  const db = fresh();
  const o = db.orders.find((x) => x.status === 'offen' && !x.carrier && x.goods.weight < 20);
  const t = db.tours.find((x) => x.status === 'geplant');
  const v = db.vehicles.find((x) => x.id === t.vehicleId), d = db.drivers.find((x) => x.id === t.driverId);
  assert.ok(!T.checkAssign({ ...o, pickup: { ...o.pickup, date: t.date } }, t, db).some((c) => c.sev === 'error'), 'normaler Fall ohne Fehler');
  const heavy = { ...o, goods: { ...o.goods, weight: v.payload + 100 } };
  assert.ok(T.checkAssign(heavy, t, db).some((c) => c.sev === 'error' && /Nutzlast/.test(c.text)), 'Überladung ist ein Fehler');
  v.status = 'gesperrt';
  assert.ok(T.checkAssign(o, t, db).some((c) => c.sev === 'error' && /gesperrt/.test(c.text)), 'gesperrtes Fahrzeug');
  v.status = 'verfuegbar'; d.absences.push({ from: t.date, to: t.date, kind: 'Krank' });
  assert.ok(T.checkAssign(o, t, db).some((c) => c.sev === 'error' && /abwesend/.test(c.text)), 'abwesender Fahrer');
  d.absences.pop();
  const truck = db.vehicles.find((x) => x.type === 'lkw75' && x.status === 'verfuegbar' && T.diffDays(x.tuev, t.date) > 0);
  const car = db.drivers.find((x) => !x.licenses.some((l) => ['C1', 'C', 'CE'].includes(l)) && !T.driverAbsent(x, t.date));
  const t2 = { ...t, vehicleId: truck.id, driverId: car.id };
  assert.ok(T.checkAssign(o, t2, db).some((c) => c.sev === 'error' && /Fahrerlaubnis/.test(c.text)), 'Führerschein passt nicht zum LKW');
  v.tuev = T.addDays(t.date, -3);
  assert.ok(T.checkAssign(o, t, db).some((c) => c.sev === 'error' && /Hauptuntersuchung/.test(c.text)), 'HU abgelaufen');
});

test('assignOrder, unassignOrder und Statuswechsel', () => {
  const db = fresh();
  const o = db.orders.find((x) => x.status === 'offen' && !x.carrier);
  const t = db.tours.find((x) => x.status === 'geplant');
  assert.ok(T.assignOrder(o.id, t.id));
  assert.strictEqual(o.status, 'geplant');
  assert.ok(t.seq.includes(o.id + ':P') && t.seq.includes(o.id + ':D') && t.seq.indexOf(o.id + ':P') < t.seq.indexOf(o.id + ':D'));
  assert.ok(T.unassignOrder(o.id));
  assert.strictEqual(o.status, 'offen');
  assert.ok(!t.seq.some((k) => k.startsWith(o.id)));
  const run = db.tours.find((x) => x.status === 'unterwegs');
  const picked = run.seq.find((k) => run.done[k] && k.endsWith(':P'));
  const po = db.orders.find((x) => x.id === picked.split(':')[0]);
  assert.strictEqual(T.unassignOrder(po.id, true), false, 'abgeholte Aufträge bleiben in der Tour');
});

test('Tourenoptimierung verlängert nie die Strecke und hält Abholung vor Zustellung', () => {
  const db = fresh();
  for (const t of db.tours) {
    const before = T.scheduleTour(t, db).totalKm;
    const done = t.seq.filter((k) => t.done[k]);
    const r = T.optimizeTour(t, db);
    assert.ok(r.after <= before, `${t.id}: ${r.after} <= ${before}`);
    t.seq.forEach((k, i) => { if (k.endsWith(':D')) assert.ok(t.seq.indexOf(k.replace(':D', ':P')) < i); });
    assert.deepStrictEqual(t.seq.slice(0, done.length), done, 'erledigte Stopps bleiben vorn');
  }
});

test('Shop-Übernahme: Auftrag mit Gewicht, Express und keine Doppelübernahme', () => {
  const db = fresh();
  store[T.SHOP_KEY] = JSON.stringify([{ no: 'JWG-99999', name: 'Max Muster', email: 'max@example.com', street: 'Teststraße 1', zip: '80331', city: 'München', items: [{ pid: 'hoodie', qty: 2 }, { pid: 'guertel', qty: 1 }], ship: 'express' }, { no: 'JWG-99998', name: 'Anna', street: 'Weg 2', zip: '20095', city: 'Hamburg', items: [{ pid: 'cap', qty: 1 }], ship: 'standard' }]);
  const n = T.importShopOrders(true);
  assert.strictEqual(n, 2);
  const o = db.orders.find((x) => x.shopNo === 'JWG-99999');
  assert.strictEqual(o.prio, 'express'); assert.strictEqual(o.source, 'shop'); assert.strictEqual(o.delivery.city, 'München'); assert.strictEqual(o.status, 'offen');
  assert.ok(o.goods.weight > 1.5 && o.goods.weight < 2.2, 'Gewicht: ' + o.goods.weight);
  assert.ok(o.delivery.date > o.pickup.date || o.delivery.date === o.pickup.date, 'Lieferdatum nicht vor Abholung');
  assert.strictEqual(T.importShopOrders(true), 0, 'zweiter Lauf übernimmt nichts doppelt');
  store[T.SHOP_KEY] = '{kaputt';
  assert.strictEqual(T.importShopOrders(true), 0, 'defekte Daten werden ignoriert');
});

test('CSV: Excel-Formeln werden entschärft, Sonderzeichen maskiert', () => {
  assert.strictEqual(T.csvCell('=1+1'), "'=1+1");
  assert.strictEqual(T.csvCell('a;b'), '"a;b"');
  assert.strictEqual(T.csvCell('sagt "hi"'), '"sagt ""hi"""');
  assert.ok(T.csvOf(['A'], [['1']]).startsWith('﻿A'));
});

test('HTML-Vorlagen maskieren Eingaben', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.ok(!String(T.html`<p>${evil}</p>`).includes('<img'));
  assert.ok(String(T.html`<p title="${'" onmouseover="x'}"></p>`).includes('&quot;'));
});

test('Nummernkreise und Rechnungsstatus', () => {
  const db = fresh();
  assert.match(T.fmtNo(db.settings.numbers.order, 7, 2026), /^A-2026-0007$/);
  const over = db.invoices.find((i) => T.invoiceState(i).id === 'ueberfaellig');
  assert.ok(over && over.status === 'offen');
  assert.strictEqual(T.invoiceState(db.invoices.find((i) => i.status === 'bezahlt')).id, 'bezahlt');
  assert.ok(T.dueState(T.addDays(T.today(), -2), 30).n < 0);
});
