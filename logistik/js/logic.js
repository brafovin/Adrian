'use strict';
/* JWG.logistik – Geschäftslogik: Nummernkreise, Strecken, Preise, Touren, Prüfungen, Statuswechsel, Shop-Import */

function fmtNo(range, n, year) {
  return range.prefix.replace('%Y', year || new Date(NOW()).getFullYear()) + String(n).padStart(range.digits, '0');
}
function nextNo(kind) {
  const r = DB.settings.numbers[kind];
  const nr = fmtNo(r, r.next);
  r.next++;
  return nr;
}

/* ---------- Strecken ---------- */
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function roadKm(a, b, st) {
  const h = haversine(a, b);
  return h < 0.3 ? 0 : Math.max(1, Math.round(h * ((st || DB.settings).surcharges.roadFactor || 1.22)));
}
const speedFor = (km) => (km < 25 ? 32 : km < 80 ? 48 : 62);
const travelMin = (km) => (km <= 0 ? 0 : Math.max(2, Math.round((km / speedFor(km)) * 60)));
const SPEED_FACTOR = { klein: 1, trans: 1, lkw75: 0.92, lkw18: 0.88, zug: 0.85 };
const SERVICE = (kind, order) => (kind === 'P' ? 15 : 12) + ((order.goods && order.goods.pallets) || 0) * 3;
const cityGeo = (name) => { const c = CITY[name] || CITY['Frankfurt am Main']; return { lat: c.lat, lon: c.lon }; };

/* ---------- Preisberechnung ---------- */
function calcPrice(o, db) {
  db = db || DB;
  const st = db.settings, s = st.surcharges;
  const tt = st.transportTypes.find((t) => t.id === o.type) || st.transportTypes[0];
  const km = roadKm(o.pickup, o.delivery, st);
  const g = o.goods || {};
  const cubicKg = (g.volume || 0) * 250;
  const kg = Math.max(g.weight || 0, cubicKg);
  const base = Math.max(tt.min, tt.base + km * tt.perKm + kg * tt.perKg);
  const lines = [{ label: `${tt.name}: ${nf(km)} km, frachtpflichtig ${nf(kg)} kg`, amount: base }];
  if (o.prio === 'express') lines.push({ label: `Expresszuschlag ${s.expressPct} %`, amount: (base * s.expressPct) / 100 });
  else if (o.prio === 'hoch') lines.push({ label: `Prioritätszuschlag ${s.hochPct} %`, amount: (base * s.hochPct) / 100 });
  lines.push({ label: `Dieselzuschlag ${s.dieselPct} %`, amount: (base * s.dieselPct) / 100 });
  if (s.tollTypes.includes(o.type)) lines.push({ label: `Maut ${nf(km)} km × ${eur(s.tollPerKm)}`, amount: km * s.tollPerKm });
  (o.extras || []).forEach((id) => { const e = st.extras.find((x) => x.id === id); if (e && e.fix) lines.push({ label: e.name, amount: e.fix }); });
  if (o.waitMin && o.waitMin > s.freeWaitMin) lines.push({ label: `Wartezeit ${o.waitMin - s.freeWaitMin} Min. über Freizeit`, amount: ((o.waitMin - s.freeWaitMin) / 60) * s.waitPerHour });
  const c = o.customerId && db.customers.find((x) => x.id === o.customerId);
  let gross0 = sum(lines, (l) => l.amount);
  if (c && c.discount) lines.push({ label: `Kundentarif ${c.priceList} (−${c.discount} %)`, amount: -(gross0 * c.discount) / 100 });
  lines.forEach((l) => { l.amount = Math.round(l.amount * 100) / 100; });
  const net = Math.round(sum(lines, (l) => l.amount) * 100) / 100;
  const vat = Math.round(net * st.vat) / 100;
  return { lines, net, vat, gross: Math.round((net + vat) * 100) / 100, km, kg };
}
function estCost(type, km, kg) {
  // Grobe Selbstkosten je Transportart (Fahrer, Fahrzeug, Kraftstoff, anteilig bei Sammeltouren)
  const f = { paket: [3.2, 0.012], kurier: [10, 0.6], stueckgut: [18, 0.2], palette: [22, 0.25], komplett: [80, 0.95] }[type] || [10, 0.3];
  return +(f[0] + km * f[1] + (kg || 0) * 0.002).toFixed(2);
}
function co2Of(km, kg, typeId) {
  // Vereinfachte Schätzung: kg CO₂ = Tonnenkilometer × Faktor (kg CO₂ je tkm), mindestens 0,3 t Auslastung
  const tt = DB.settings.transportTypes.find((t) => t.id === typeId) || { co2: 0.1 };
  return Math.round(km * Math.max(kg / 1000, 0.3) * tt.co2 * 100) / 100;
}

/* ---------- Touren ---------- */
function tourStopList(t, db) {
  db = db || DB;
  return t.seq.map((key) => {
    const [orderId, kind] = key.split(':');
    const order = db.orders.find((o) => o.id === orderId);
    return order ? { key, orderId, kind, order, addr: kind === 'P' ? order.pickup : order.delivery } : null;
  }).filter(Boolean);
}
function scheduleTour(t, db, opts) {
  db = db || DB; opts = opts || {};
  const v = db.vehicles.find((x) => x.id === t.vehicleId);
  const f = (v && SPEED_FACTOR[v.type]) || 1;
  const depot = BRANCH_GEO[t.branch] || BRANCH_GEO.b1;
  const start = opts.start != null ? opts.start : (t.startedAt || at(t.date, t.startTime || '07:30'));
  let pos = depot, clock = start, totalKm = 0, drive = 0, svc = 0;
  const stops = [];
  for (const s of tourStopList(t, db)) {
    const p = { lat: s.addr.lat, lon: s.addr.lon };
    const km = roadKm(pos, p, db.settings);
    const legMin = Math.round(travelMin(km) / f);
    const service = km === 0 && stops.length ? Math.min(SERVICE(s.kind, s.order), 5 + ((s.order.goods && s.order.goods.pallets) || 0) * 3) : SERVICE(s.kind, s.order);
    const doneTs = t.done && t.done[s.key];
    let eta, depart;
    if (doneTs) { eta = (t.arrived && t.arrived[s.key]) || doneTs - service * 60000; depart = doneTs; }
    else { eta = clock + legMin * 60000; }
    let wait = 0, late = false, lateMin = 0;
    if (!doneTs && !opts.relative) {
      const d = s.addr.date || t.date;
      const ws = at(d, s.addr.from || '00:00'), we = at(d, s.addr.to || '23:59');
      if (s.kind === 'D' && eta < ws) wait = Math.round((ws - eta) / 60000);
      if (eta > we) { late = true; lateMin = Math.round((eta - we) / 60000); }
    }
    if (!doneTs) depart = eta + (wait + service) * 60000;
    totalKm += km; drive += legMin; svc += service;
    stops.push({ ...s, pos: p, legKm: km, legMin, service, wait, late, lateMin, eta, depart, rel: eta - start, done: !!doneTs, doneTs: doneTs || null, arrivedTs: (t.arrived && t.arrived[s.key]) || null, prev: pos });
    pos = p; clock = depart;
  }
  const retKm = roadKm(pos, depot, db.settings);
  const retMin = Math.round(travelMin(retKm) / f);
  return { depot, start, stops, totalKm: totalKm + retKm, retKm, retMin, driveMin: drive + retMin, serviceMin: svc, end: clock + retMin * 60000, durationMin: Math.round((clock + retMin * 60000 - start) / 60000), lateCount: stops.filter((s) => s.late).length };
}
const lerp = (a, b, f) => ({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
function tourPosition(t, db, now) {
  db = db || DB; now = now || NOW();
  const sch = scheduleTour(t, db);
  if (t.status !== 'unterwegs') return { pos: sch.depot, state: t.status === 'abgeschlossen' ? 'zurück im Depot' : 'im Depot', sch };
  let prevPos = sch.depot, prevTs = sch.start;
  for (const s of sch.stops) {
    if (s.done) { prevPos = s.pos; prevTs = s.doneTs; continue; }
    const legMs = s.legMin * 60000;
    const frac = legMs ? clamp((now - prevTs) / legMs, 0, 1) : 1;
    return { pos: lerp(prevPos, s.pos, frac), next: s, frac, state: frac >= 1 ? 'am Stopp' : 'unterwegs', sch };
  }
  return { pos: prevPos, state: 'Tour beendet', sch };
}
function tourLoad(t, db) {
  db = db || DB;
  const ids = [...new Set(t.seq.map((k) => k.split(':')[0]))];
  const os = ids.map((id) => db.orders.find((o) => o.id === id)).filter(Boolean);
  return { orders: os, kg: sum(os, (o) => o.goods.weight || 0), m3: sum(os, (o) => o.goods.volume || 0), pallets: sum(os, (o) => o.goods.pallets || 0), pieces: sum(os, (o) => o.goods.pieces || 0) };
}
function orderEta(o, db) {
  db = db || DB;
  if (!o.tourId || ['zugestellt', 'abgeschlossen', 'storniert'].includes(o.status)) return null;
  const t = db.tours.find((x) => x.id === o.tourId); if (!t) return null;
  const sch = scheduleTour(t, db);
  return sch.stops.find((s) => s.orderId === o.id && s.kind === 'D') || null;
}
const driverAbsent = (d, date) => (d.absences || []).find((a) => a.from <= date && date <= a.to) || null;
function driverState(d, db) {
  db = db || DB;
  const ab = driverAbsent(d, today());
  if (ab) return { id: 'abwesend', label: ab.kind, tone: 'red' };
  if (db.tours.some((t) => t.driverId === d.id && t.status === 'unterwegs')) return { id: 'tour', label: 'Auf Tour', tone: 'violet' };
  if (d.status === 'pause') return { id: 'pause', label: 'Pause', tone: 'amber' };
  return { id: 'frei', label: 'Verfügbar', tone: 'green' };
}
function vehicleState(v, db) {
  db = db || DB;
  if (v.status === 'gesperrt') return { id: 'gesperrt', label: 'Gesperrt', tone: 'red' };
  if (v.status === 'werkstatt') return { id: 'werkstatt', label: 'Werkstatt', tone: 'amber' };
  if (db.tours.some((t) => t.vehicleId === v.id && t.status === 'unterwegs')) return { id: 'einsatz', label: 'Im Einsatz', tone: 'violet' };
  return { id: 'frei', label: 'Verfügbar', tone: 'green' };
}
function dueState(dateISO, warnDays = 30) {
  const n = diffDays(dateISO, today());
  return n < 0 ? { tone: 'red', label: `seit ${-n} Tg. überfällig`, n } : n <= warnDays ? { tone: 'amber', label: `in ${n} Tg.`, n } : { tone: 'green', label: `in ${n} Tg.`, n };
}

/* Prüft, ob ein Auftrag in eine Tour passt. Fehler blockieren, Hinweise müssen bestätigt werden. */
function checkAssign(o, t, db) {
  db = db || DB;
  const res = [];
  const v = db.vehicles.find((x) => x.id === t.vehicleId), d = db.drivers.find((x) => x.id === t.driverId);
  if (!v) res.push({ sev: 'error', text: 'Der Tour ist kein Fahrzeug zugeordnet.' });
  if (!d) res.push({ sev: 'error', text: 'Der Tour ist kein Fahrer zugeordnet.' });
  if (t.status === 'abgeschlossen') res.push({ sev: 'error', text: 'Die Tour ist bereits abgeschlossen.' });
  if (v) {
    if (v.status === 'gesperrt') res.push({ sev: 'error', text: `${v.plate} ist gesperrt${v.defects.find((x) => x.open) ? ' (' + v.defects.find((x) => x.open).text + ')' : ''}.` });
    if (v.status === 'werkstatt') res.push({ sev: 'error', text: `${v.plate} ist in der Werkstatt.` });
    if (diffDays(v.tuev, t.date) < 0) res.push({ sev: 'error', text: `Hauptuntersuchung von ${v.plate} ist am ${fDate(v.tuev)} abgelaufen.` });
    const l = tourLoad(t, db);
    const already = l.orders.some((x) => x.id === o.id);
    const kg = l.kg + (already ? 0 : o.goods.weight || 0), m3 = l.m3 + (already ? 0 : o.goods.volume || 0);
    if (kg > v.payload) res.push({ sev: 'error', text: `Nutzlast überschritten: ${nf(kg)} kg bei ${nf(v.payload)} kg Nutzlast (${v.plate}).` });
    else if (kg > v.payload * 0.9) res.push({ sev: 'warn', text: `Nutzlast zu ${nf((kg / v.payload) * 100)} % ausgelastet.` });
    if (m3 > v.volume) res.push({ sev: 'error', text: `Ladevolumen überschritten: ${nf(m3, 1)} m³ bei ${nf(v.volume)} m³.` });
    (o.extras || []).forEach((id) => { const e = db.settings.extras.find((x) => x.id === id); if (e && e.needs && !v.equipment.includes(e.needs)) res.push({ sev: 'warn', text: `Zusatzleistung „${e.name}“ braucht Ausstattung, die ${v.plate} nicht hat.` }); });
    if (d) { const lic = vtype(v.type).req; if (lic.length && !lic.some((x) => d.licenses.includes(x))) res.push({ sev: 'error', text: `${d.name} hat keine passende Fahrerlaubnis (nötig: ${lic.join(' oder ')}).` }); }
  }
  if (d) {
    const ab = driverAbsent(d, t.date);
    if (ab) res.push({ sev: 'error', text: `${d.name} ist am ${fDate(t.date)} abwesend (${ab.kind}).` });
    d.quals.forEach((q) => { if (q.exp && diffDays(q.exp, t.date) < 0) res.push({ sev: 'warn', text: `Nachweis „${q.name}“ von ${d.name} ist abgelaufen.` }); });
    if (!ab && db.tours.some((x) => x.id !== t.id && x.date === t.date && x.driverId === d.id && x.status !== 'abgeschlossen')) res.push({ sev: 'warn', text: `${d.name} hat am selben Tag noch eine andere Tour.` });
  }
  if (o.pickup.date !== t.date) res.push({ sev: 'warn', text: `Abholtermin des Auftrags (${fDate(o.pickup.date)}) weicht vom Tourdatum (${fDate(t.date)}) ab.` });
  if (o.branch && t.branch && o.branch !== t.branch) res.push({ sev: 'warn', text: `Auftrag gehört zu ${branchName(o.branch)}, die Tour zu ${branchName(t.branch)}.` });
  // Zeitfenster: Tour mit dem Auftrag testweise berechnen
  if (!t.seq.some((k) => k.startsWith(o.id + ':'))) {
    const copy = { ...t, seq: addToSeq(t.seq, o.id), done: t.done, arrived: t.arrived };
    const probe = { ...db, orders: db.orders.some((x) => x.id === o.id) ? db.orders : [...db.orders, o] };
    const sch = scheduleTour(copy, probe);
    sch.stops.filter((s) => s.late && s.orderId === o.id).forEach((s) => res.push({ sev: 'warn', text: `Zeitfenster-Konflikt: ${s.kind === 'P' ? 'Abholung' : 'Zustellung'} in ${s.addr.city} voraussichtlich ${s.lateMin} Min. nach Fensterende (${s.addr.to} Uhr).` }));
    if (sch.durationMin > 9 * 60) res.push({ sev: 'warn', text: `Tourdauer ${dur(sch.durationMin)} liegt über der Lenk- und Einsatzzeit-Richtgröße von 9 Std.` });
  }
  return res;
}
function addToSeq(seq, orderId) {
  const out = seq.slice();
  let lastP = -1; out.forEach((k, i) => { if (k.endsWith(':P')) lastP = i; });
  out.splice(lastP + 1, 0, orderId + ':P');
  out.push(orderId + ':D');
  return out;
}
function assignOrder(orderId, tourId, by) {
  const o = ord(orderId), t = tour(tourId);
  if (!o || !t) return false;
  if (o.tourId && o.tourId !== tourId) unassignOrder(orderId, true);
  if (!t.seq.some((k) => k.startsWith(o.id + ':'))) t.seq = addToSeq(t.seq, o.id);
  o.tourId = t.id; o.carrier = null;
  o.rev++;
  if (['entwurf', 'offen'].includes(o.status)) setStatus(o, 'geplant', `Tour ${t.id} zugeordnet (${(drv(t.driverId) || {}).name || '–'}, ${(veh(t.vehicleId) || {}).plate || '–'})`, by);
  else addHistory(o, o.status, `Tour ${t.id} zugeordnet`, by);
  audit('Tour', t.id, 'zugeordnet', `${o.nr} → ${t.id}`);
  return true;
}
function unassignOrder(orderId, silent) {
  const o = ord(orderId); if (!o || !o.tourId) return false;
  const t = tour(o.tourId);
  if (t) {
    if (t.done[o.id + ':P']) { if (!silent) toast('Der Auftrag wurde schon abgeholt und kann nicht mehr entfernt werden.', 'bad'); return false; }
    t.seq = t.seq.filter((k) => !k.startsWith(o.id + ':'));
  }
  const old = o.tourId; o.tourId = null; o.rev++;
  if (o.status === 'geplant') setStatus(o, 'offen', `Aus Tour ${old} entfernt`);
  else addHistory(o, o.status, `Aus Tour ${old} entfernt`);
  return true;
}
function optimizeTour(t, db) {
  db = db || DB;
  const before = scheduleTour(t, db).totalKm;
  const doneKeys = t.seq.filter((k) => t.done[k]);
  let rest = t.seq.filter((k) => !t.done[k]);
  const stops = Object.fromEntries(tourStopList({ ...t, seq: rest }, db).map((s) => [s.key, s]));
  let pos = doneKeys.length ? (() => { const s = tourStopList({ ...t, seq: [doneKeys[doneKeys.length - 1]] }, db)[0]; return { lat: s.addr.lat, lon: s.addr.lon }; })() : BRANCH_GEO[t.branch];
  const out = [];
  const pickedUp = new Set(doneKeys.filter((k) => k.endsWith(':P')).map((k) => k.split(':')[0]));
  while (rest.length) {
    const cand = rest.filter((k) => k.endsWith(':P') || pickedUp.has(k.split(':')[0]));
    let best = null, bd = Infinity;
    for (const k of cand) { const a = stops[k].addr; const d = haversine(pos, { lat: a.lat, lon: a.lon }); if (d < bd) { bd = d; best = k; } }
    out.push(best); rest = rest.filter((k) => k !== best);
    const a = stops[best].addr; pos = { lat: a.lat, lon: a.lon };
    if (best.endsWith(':P')) pickedUp.add(best.split(':')[0]);
  }
  const old = t.seq;
  t.seq = [...doneKeys, ...out];
  const after = scheduleTour(t, db).totalKm;
  if (after > before) { t.seq = old; return { before, after: before, kept: true }; }
  return { before, after };
}
function suggestTours(o, db) {
  // Regelbasierter Vorschlag (kein KI-Modell): passende Touren am Abholtag nach Mehrkilometern sortieren
  db = db || DB;
  return db.tours.filter((t) => t.status !== 'abgeschlossen' && t.date === o.pickup.date).map((t) => {
    const checks = checkAssign(o, t, db);
    const errors = checks.filter((c) => c.sev === 'error').length, warns = checks.filter((c) => c.sev === 'warn').length;
    const base = scheduleTour(t, db).totalKm;
    const probe = { ...t, seq: addToSeq(t.seq, o.id) };
    const km = scheduleTour(probe, { ...db, orders: db.orders.some((x) => x.id === o.id) ? db.orders : [...db.orders, o] }).totalKm;
    return { tour: t, errors, warns, extraKm: km - base, score: errors * 1000 + warns * 50 + (km - base) };
  }).sort((a, b) => a.score - b.score);
}

/* ---------- Status, Verlauf, Benachrichtigung ---------- */
function addHistory(o, status, text, by, extra) {
  o.history.push({ ts: NOW(), status, text, by: by || curUserName(), ...(extra || {}) });
}
function fillTpl(str, ctx) { return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] == null ? '' : ctx[k])); }
function mailCtx(o, extra) {
  const c = cust(o.customerId) || {};
  const contact = (c.contacts && c.contacts[0]) || {};
  const eta = orderEta(o);
  return { auftrag: o.nr, sendung: o.tracking, status: stat(o.status).name, ansprechpartner: o.delivery.contact || contact.name || 'Kundin, Kunde', abholung: `${fDate(o.pickup.date)} ${o.pickup.from}–${o.pickup.to}`, zustellung: `${fDate(o.delivery.date)} ${o.delivery.from}–${o.delivery.to}`, firma: DB.settings.company.name, link: trackLink(o.tracking), eta: eta ? hhmm(eta.eta) + ' Uhr' : '–', ...(extra || {}) };
}
const trackLink = (nr) => `${location.href.split('#')[0]}#/track/${nr}`;
function queueMail(kind, o, extra) {
  const tpl = DB.settings.templates.find((t) => t.id === kind); if (!tpl) return;
  const c = cust(o.customerId) || {};
  const to = o.notifyEmail || (c.contacts && c.contacts[0] && c.contacts[0].email) || '';
  if (!to) return;
  const ctx = mailCtx(o, extra);
  DB.outbox.unshift({ id: uid('mail'), ts: NOW(), to, subject: fillTpl(tpl.subject, ctx), body: fillTpl(tpl.body, ctx), orderId: o.id, kind, channel: 'E-Mail (simuliert)' });
  if (DB.outbox.length > 200) DB.outbox.length = 200;
}
function setStatus(o, status, text, by, extra) {
  const prev = o.status;
  o.status = status;
  o.rev = (o.rev || 1) + 1;
  addHistory(o, status, text || `Status: ${stat(status).name}`, by, extra);
  if (prev !== status) {
    audit('Auftrag', o.nr, 'Status', `${stat(prev).name} → ${stat(status).name}`);
    if (DB.settings.automation.statusMail && ['abgeholt', 'in_zustellung', 'zugestellt'].includes(status)) queueMail('status', o);
    if (status === 'zugestellt') pushNotif(`${o.nr} wurde zugestellt (${o.delivery.city}).`, 'ok', `#/auftraege/${o.id}`);
  }
}

/* ---------- Auswertungen / abgeleitete Listen ---------- */
const ACTIVE = ['offen', 'geplant', 'abgeholt', 'in_zustellung'];
const GROUPS = { offen: ['entwurf', 'offen'], geplant: ['geplant'], laufend: ['abgeholt', 'in_zustellung'], fertig: ['zugestellt', 'abgeschlossen'] };
const isDone = (o) => ['zugestellt', 'abgeschlossen'].includes(o.status);
function isLate(o) {
  if (['zugestellt', 'abgeschlossen', 'storniert', 'entwurf'].includes(o.status)) return false;
  const e = orderEta(o);
  if (e && e.late) return true;
  return NOW() > at(o.delivery.date, o.delivery.to || '23:59') && o.status !== 'offen' ? true : (o.status === 'offen' && NOW() > at(o.pickup.date, o.pickup.to || '23:59'));
}
function problems(db) {
  db = db || DB;
  const out = [];
  db.orders.forEach((o) => {
    if (['storniert', 'abgeschlossen'].includes(o.status)) return;
    if (o.flags && o.flags.problem) out.push({ order: o, kind: 'Problem', tone: 'red', text: o.flags.problemText || 'Problem gemeldet' });
    else if (o.flags && o.flags.delay) out.push({ order: o, kind: 'Verspätung', tone: 'amber', text: `Fahrer meldet ca. ${o.flags.delay.min} Min. Verzug (${o.flags.delay.reason})` });
    else if (isLate(o)) { const e = orderEta(o); out.push({ order: o, kind: 'Verspätet', tone: 'red', text: e && e.late ? `Voraussichtlich ${e.lateMin} Min. nach Fensterende (${e.addr.to} Uhr)` : o.status === 'offen' ? 'Abholfenster verstrichen, noch nicht disponiert' : 'Zustellfenster überschritten' }); }
  });
  db.claims.filter((c) => !['geloest', 'abgelehnt'].includes(c.status)).forEach((c) => { const o = db.orders.find((x) => x.id === c.orderId); if (o) out.push({ order: o, kind: 'Reklamation', tone: 'amber', text: `${c.nr}: ${c.type}` }); });
  return out;
}
function invoiceState(inv) {
  if (inv.kind === 'gutschrift') return { id: 'gutschrift', label: 'Gutschrift', tone: 'violet' };
  if (inv.status === 'storniert') return { id: 'storniert', label: 'Storniert', tone: 'gray' };
  if (inv.status === 'bezahlt') return { id: 'bezahlt', label: 'Bezahlt', tone: 'green' };
  const n = diffDays(today(), inv.due);
  if (n > 0) return { id: 'ueberfaellig', label: `Überfällig (${n} Tg.)`, tone: 'red', days: n };
  return { id: 'offen', label: 'Offen', tone: 'amber' };
}
const DUNNING = ['Keine', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung'];
function customerOrders(id) { return DB.orders.filter((o) => o.customerId === id); }
function orderMargin(o) { return { rev: o.status === 'storniert' ? 0 : o.price, cost: o.status === 'storniert' ? 0 : o.cost, profit: o.status === 'storniert' ? 0 : o.price - o.cost }; }

/* ---------- Neue Aufträge ---------- */
function newOrderFrom(f) {
  const nr = nextNo('order');
  const c = cust(f.customerId);
  const pc = CITY[f.pCity] || CITY['Frankfurt am Main'], dc = CITY[f.dCity] || CITY['Frankfurt am Main'];
  const mk = (p, city, c0) => ({ name: f[p + 'Name'], street: f[p + 'Street'], zip: f[p + 'Zip'] || c0.zip, city: city, contact: f[p + 'Contact'] || '', phone: f[p + 'Phone'] || '', date: f[p + 'Date'], from: f[p + 'From'] || '08:00', to: f[p + 'To'] || '17:00', ...geoFor(f[p + 'Street'], city) });
  const o = {
    id: nr, nr, customerId: c.id, ref: f.ref || '', status: f.asDraft ? 'entwurf' : 'offen', prio: f.prio || 'normal', type: f.type, branch: f.branch || 'b1',
    pickup: mk('p', f.pCity, pc), delivery: mk('d', f.dCity, dc),
    goods: { desc: f.desc || 'Ware', weight: +f.weight || 0, volume: +f.volume || 0, pieces: +f.pieces || 1, pallets: +f.pallets || 0 }, extras: f.extras || [], note: f.note || '',
    tourId: null, carrier: null, price: 0, cost: 0, tracking: newTracking(nr), locShare: true, created: NOW(), createdBy: curUser().id, history: [], pod: null, flags: {}, rev: 1, source: f.source || 'manuell', invoiceId: null,
  };
  const pr = calcPrice(o);
  o.price = pr.net; o.km = pr.km;
  o.cost = estCost(o.type, pr.km, o.goods.weight);
  addHistory(o, o.status, f.historyText || (o.status === 'entwurf' ? 'Entwurf angelegt' : 'Auftrag angelegt'), f.by);
  DB.orders.unshift(o);
  audit('Auftrag', nr, 'erstellt', `${c.name}: ${o.pickup.city} → ${o.delivery.city}`);
  return o;
}
function geoFor(street, city) {
  const b = BRANCHES.find((x) => x.street === street && x.city === city);
  if (b) return { ...BRANCH_GEO[b.id] };
  const c = CITY[city] || CITY['Frankfurt am Main']; const h = hash(String(street) + city);
  return { lat: +(c.lat + ((h % 1000) / 1000 - 0.5) * 0.09).toFixed(4), lon: +(c.lon + (((h >> 10) % 1000) / 1000 - 0.5) * 0.12).toFixed(4) };
}
function newTracking(seed) { return 'JWG-' + ((hash(seed + NOW()) % 9000000) + 1000000).toString(36).toUpperCase().slice(0, 6); }

/* ---------- Shop-Anbindung ---------- */
function readShopOrders() {
  try { const r = lsGet(SHOP_KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function cityByZip(zip, name) {
  const byName = CITIES.find((c) => c.name.toLowerCase() === String(name || '').trim().toLowerCase() || c.name.toLowerCase().startsWith(String(name || '').trim().toLowerCase() + ' '));
  if (byName) return byName;
  const z2 = String(zip || '').slice(0, 2);
  return CITIES.filter((c) => c.zip.slice(0, 2) === z2)[0] || CITIES.map((c) => ({ c, d: Math.abs(+c.zip.slice(0, 2) - +z2) })).sort((a, b) => a.d - b.d)[0].c;
}
function importShopOrders(auto) {
  const list = readShopOrders().filter((s) => s && s.no && !DB.shopSeen.includes(s.no));
  if (!list.length) return 0;
  const shopCust = DB.customers.find((c) => c.type === 'Onlineshop') || DB.customers[0];
  const dep = BRANCHES[0];
  let n = 0;
  for (const s of list) {
    const items = Array.isArray(s.items) ? s.items : [];
    const kg = sum(items, (i) => ((SHOP_PRODUCTS[i.pid] || { kg: 0.4 }).kg) * (i.qty || 1)) + 0.3;
    const m3 = sum(items, (i) => ((SHOP_PRODUCTS[i.pid] || { m3: 0.003 }).m3) * (i.qty || 1)) + 0.006;
    const city = cityByZip(s.zip, s.city);
    const express = s.ship === 'express';
    const d0 = today();
    const pDate = express || new Date(NOW()).getHours() < 14 ? d0 : addDays(d0, 1);
    let dDate = pDate; for (let k = express ? 1 : 2; k > 0;) { dDate = addDays(dDate, 1); const wd = parseISO(dDate).getDay(); if (wd !== 0 && wd !== 6) k--; }
    const o = newOrderFrom({
      customerId: shopCust.id, type: 'paket', prio: express ? 'express' : 'normal', branch: 'b1', ref: s.no, source: 'shop', by: 'Shop', historyText: `Bestellung ${s.no} aus JWG.onlineshop übernommen${auto ? ' (automatisch)' : ''}`,
      pName: 'JWG Logistikzentrum ' + dep.name, pStreet: dep.street, pZip: dep.zip, pCity: dep.city, pContact: 'Lagerleitung', pPhone: dep.phone, pDate, pFrom: '08:00', pTo: '14:00',
      dName: s.name || 'Empfänger', dStreet: s.street || '', dZip: s.zip || city.zip, dCity: city.name, dContact: s.name || '', dPhone: '', dDate, dFrom: '09:00', dTo: '18:00',
      desc: items.map((i) => `${i.qty || 1}× ${(SHOP_PRODUCTS[i.pid] || { name: i.pid }).name}`).join(', ') || 'Shop-Bestellung', weight: +kg.toFixed(2), volume: +m3.toFixed(3), pieces: 1, pallets: 0, extras: [],
    });
    o.notifyEmail = s.email || '';
    o.shopNo = s.no;
    o.delivery.city = s.city && s.city.trim() ? s.city.trim() : city.name;
    DB.shopSeen.push(s.no);
    pushNotif(`Shop-Bestellung ${s.no} wurde als Auftrag ${o.nr} übernommen.`, 'info', `#/auftraege/${o.id}`);
    n++;
  }
  if (n) { DB.dirty = true; save(); }
  return n;
}
