'use strict';
/* JWG.logistik – KI-Assistent: Datenauszug für Claude, Lokalmodus mit festen Regeln, Seitenleiste im Browser.
   Der Assistent liest nur. Er sieht nur, was die aktuelle Rolle und der Standortfilter erlauben. */

const AI_API = '/api/logistik-chat';
const aiNorm = (s) => String(s == null ? '' : s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9\-\s.,:/]/g, ' ').replace(/\s+/g, ' ').trim();
const aiShort = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const aiClean = (s) => String(s == null ? '' : s).replace(/[<>`]/g, ' ');
const aiInitials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + '.').join(' ');
const aiDayName = (iso) => `${WD[parseISO(iso).getDay()]} ${fDate(iso).slice(0, 5)}`;
const aiRole = () => curRole().name;
const aiDeny = (mod) => (can(mod) ? null : `Dafür hat deine Rolle (${aiRole()}) keinen Zugriff. Wechsle oben rechts die Rolle oder wende dich an die Administration.`);
const aiMods = () => (typeof PERM_MODS !== 'undefined' ? PERM_MODS : []);

/* ---------- Seitenkontext ---------- */
function aiPageCtx() {
  const h = String((typeof location !== 'undefined' && location.hash) || '').replace(/^#\/?/, '');
  const [path, q] = h.split('?'); const seg = path.split('/').filter(Boolean); const qs = new URLSearchParams(q || '');
  const name = seg[0] || 'dashboard'; let id = seg[1] && !['neu', 'edit'].includes(seg[1]) ? seg[1] : '';
  if (name === 'tracking' && qs.get('nr')) id = qs.get('nr');
  if (name === 'dispo' && qs.get('tour')) id = qs.get('tour');
  const label = ((typeof NAV_ITEMS !== 'undefined' ? NAV_ITEMS : []).find((n) => n[0] === name) || [name, name])[1];
  return { name, id, label, date: name === 'dispo' ? (qs.get('date') || UI.dispoDate || today()) : '' };
}
function aiPageEntity(p) {
  if (!p || !p.id) return null;
  if (p.name === 'auftraege' && ord(p.id)) return { kind: 'order', obj: ord(p.id) };
  if (p.name === 'tracking' && findOrderByNo(p.id)) return { kind: 'order', obj: findOrderByNo(p.id) };
  if (p.name === 'kunden' && cust(p.id)) return { kind: 'customer', obj: cust(p.id) };
  if (p.name === 'fahrer' && drv(p.id)) return { kind: 'driver', obj: drv(p.id) };
  if (p.name === 'fuhrpark' && veh(p.id)) return { kind: 'vehicle', obj: veh(p.id) };
  if (p.name === 'partner' && par(p.id)) return { kind: 'partner', obj: par(p.id) };
  if (p.name === 'dispo' && tour(p.id)) return { kind: 'tour', obj: tour(p.id) };
  if (p.name === 'reklamation') { const c = DB.claims.find((x) => x.id === p.id); if (c) return { kind: 'claim', obj: c }; }
  if (p.name === 'angebote') { const c = DB.quotes.find((x) => x.id === p.id); if (c) return { kind: 'quote', obj: c }; }
  return null;
}

/* ---------- Datenauszug für den KI-Server (datensparsam, rollen- und standortgerecht) ---------- */
function aiOrderLine(o) {
  const eta = orderEta(o);
  const where = o.tourId ? `Tour ${o.tourId}` : o.carrier ? `Frachtführer ${(par(o.carrier.partnerId) || {}).name} (${o.carrier.status})` : 'nicht disponiert';
  const dn = o.source === 'shop' ? aiInitials(o.delivery.name) : aiShort(aiClean(o.delivery.name), 28);
  const flags = [o.flags && o.flags.problem ? `PROBLEM: ${aiShort(aiClean(o.flags.problemText), 70)}` : '', o.flags && o.flags.delay ? `Verzug ${o.flags.delay.min} Min. (${o.flags.delay.reason})` : '', isLate(o) ? 'VERSPÄTET' : ''].filter(Boolean).join('; ');
  return [o.nr, aiShort(aiClean(custName(o.customerId)), 34), `${o.pickup.city}→${o.delivery.city} (${dn})`, stat(o.status).name, prioOf(o.prio).name, ttype(o.type).name.split(' (')[0],
    `Abh ${aiDayName(o.pickup.date)} ${o.pickup.from}-${o.pickup.to}`, `Zust ${aiDayName(o.delivery.date)} ${o.delivery.from}-${o.delivery.to}`, `${nf(o.goods.weight, 1)} kg ${nf(o.goods.volume, 2)} m³${o.goods.pallets ? ' ' + o.goods.pallets + ' Pal.' : ''}`,
    `netto ${nf(o.price, 2)} € Kosten ${nf(o.cost, 2)} €`, `Sendung ${o.tracking}${o.shopNo ? ' Shop ' + o.shopNo : ''}`, where, eta ? `ETA ${hhmm(eta.eta)}${eta.late ? ` (+${eta.lateMin} Min. nach Fenster)` : ''}` : (o.pod ? `zugestellt ${fDT(o.pod.ts)}` : ''),
    aiShort(aiClean(o.goods.desc), 50), o.invoiceId ? `Rechnung ${o.invoiceId}` : '', flags].filter(Boolean).join(' | ');
}
function aiTourLine(t) {
  const sch = scheduleTour(t); const L = tourLoad(t); const v = veh(t.vehicleId), d = drv(t.driverId);
  const stops = sch.stops.map((s, i) => `${i + 1}.${s.kind === 'P' ? 'Abholung' : 'Zustellung'} ${s.addr.city} ${s.orderId}${s.done ? ` erledigt ${hhmm(s.doneTs)}` : ` ETA ${hhmm(s.eta)}${s.late ? ` +${s.lateMin}Min` : ''}`}`).join('; ');
  return `${t.id} | ${fDate(t.date)} | ${t.status} | ${branchName(t.branch)} | Fahrer ${d ? d.name : '–'} | ${v ? v.plate : '–'} | Start ${t.status === 'geplant' ? t.startTime : hhmm(sch.start)} | ${nf(sch.totalKm)} km, Ende ca. ${hhmm(sch.end)} | Last ${nf(L.kg)}/${v ? nf(v.payload) : '–'} kg | ${stops}`;
}
function aiSnapshot(page, opts) {
  opts = opts || {};
  const T = today(); const role = curRole(); const out = []; const budget = opts.budget || 60000;
  const sec = (title, lines) => { if (lines.length) out.push(`\n## ${title}\n` + lines.join('\n')); };
  const perms = aiMods().map(([m, l]) => (perm(m) ? `${l} (${perm(m) === 'w' ? 'ändern' : 'lesen'})` : null)).filter(Boolean);
  out.push(`Stand: ${aiDayName(T)}.${T.slice(0, 4)} ${hhmm(NOW())} Uhr (heute ${T}, morgen ${addDays(T, 1)})`);
  out.push(`Benutzerrolle: ${role.name}. Standortfilter: ${SESS.branch === 'all' ? 'alle erlaubten Standorte' : branchName(SESS.branch)}. Erlaubte Standorte: ${allowedBranches().map(branchName).join(', ')}.`);
  out.push(`Die Rolle darf diese Bereiche sehen: ${perms.join(', ')}. Alles andere ist ausgeblendet; dazu gibt es keine Daten.`);
  if (page) out.push(`Aktuelle Seite des Benutzers: ${page.label}${page.id ? ' ' + page.id : ''}.`);
  const os = scoped(DB.orders);
  if (can('auftraege')) {
    const cnt = (ids) => os.filter((o) => ids.includes(o.status)).length;
    const done30 = os.filter((o) => isDone(o) && diffDays(T, o.delivery.date) <= 30 && diffDays(T, o.delivery.date) >= 0);
    const rev = sum(done30, (o) => o.price), cost = sum(done30, (o) => o.cost);
    sec('Kennzahlen (Aufträge im Standortfilter)', [`Aufträge gesamt ${os.length}; Entwurf ${cnt(['entwurf'])}; offen ${cnt(['offen'])}; geplant ${cnt(['geplant'])}; abgeholt/unterwegs ${cnt(['abgeholt'])}; in Zustellung ${cnt(['in_zustellung'])}; zugestellt ${cnt(['zugestellt'])}; abgeschlossen ${cnt(['abgeschlossen'])}; storniert ${cnt(['storniert'])}.`,
      `Heute zugestellt: ${os.filter((o) => isDone(o) && o.delivery.date === T).length}. Verspätet oder Problemfall: ${problems().filter((p) => inScope(p.order.branch) && p.kind !== 'Reklamation').length}. Umsatz der letzten 30 Tage (zugestellt, netto): ${nf(rev, 2)} €, Kosten ${nf(cost, 2)} €, Deckungsbeitrag ${nf(rev - cost, 2)} €.`,
      `Zugestellt, aber noch nicht abgerechnet: ${os.filter((o) => o.status === 'zugestellt' && !o.invoiceId).length} Aufträge.`]);
    const rank = (o) => (ACTIVE.includes(o.status) ? 0 : o.status === 'zugestellt' ? 1 : o.status === 'entwurf' ? 2 : 3);
    const list = os.slice().sort((a, b) => rank(a) - rank(b) || (a.pickup.date + a.pickup.from < b.pickup.date + b.pickup.from ? -1 : 1));
    sec(`Aufträge (${list.length}; Feldfolge: Nr | Kunde | Strecke (Empfänger) | Status | Priorität | Art | Abholung | Zustellung | Ware | Preis | Sendung | Disposition | ETA | Beschreibung | Rechnung | Hinweise)`, list.slice(0, 150).map(aiOrderLine));
  }
  if (can('dispo')) sec('Touren', scoped(DB.tours).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40).map(aiTourLine));
  if (can('fahrer')) {
    sec('Fahrer', scoped(DB.drivers).map((d) => { const s = driverState(d); const exp = d.quals.filter((q) => q.exp && dueState(q.exp, 30).tone !== 'green').map((q) => `${q.name} ${dueState(q.exp, 30).n < 0 ? 'abgelaufen' : 'läuft ' + fDate(q.exp) + ' ab'}`);
      return `${d.name} | ${branchName(d.branch)} | ${s.label} | Fahrzeug ${(veh(d.vehicleId) || {}).plate || '–'} | Klassen ${d.licenses.join('/')} | Abwesenheit ${d.absences.map((a) => `${a.kind} ${fDate(a.from)}-${fDate(a.to)}`).join(', ') || 'keine'}${exp.length ? ' | Nachweise: ' + exp.join(', ') : ''}${d.consent ? '' : ' | keine Standort-Einwilligung'}`; }));
  }
  if (can('fuhrpark')) sec('Fahrzeuge', scoped(DB.vehicles).map((v) => { const s = vehicleState(v); return `${v.plate} | ${vtype(v.type).name} | ${branchName(v.branch)} | ${s.label} | ${nf(v.payload)} kg ${v.volume} m³ | Ausstattung ${v.equipment.join(',') || 'keine'} | HU ${fDate(v.tuev)} (${dueState(v.tuev).label}) | Service ${fDate(v.service)} | Versicherung ${fDate(v.insurance)} | offene Defekte ${v.defects.filter((d) => d.open).map((d) => aiShort(aiClean(d.text), 50)).join('; ') || 'keine'}`; }));
  if (can('kunden')) sec('Kunden', DB.customers.filter((c) => !c.archived).map((c) => { const cos = DB.orders.filter((o) => o.customerId === c.id && o.status !== 'storniert'); return `${c.nr} | ${aiClean(c.name)} | ${c.type} | ${c.city} | Rabatt ${c.discount} % | Zahlungsziel ${c.terms} Tage | Preisliste ${c.priceList} | ${cos.length} Aufträge, Umsatz ${nf(sum(cos, (o) => o.price), 2)} € netto | Ansprechpartner ${aiClean((c.contacts[0] || {}).name || '–')}`; }));
  if (can('abrechnung')) {
    sec('Rechnungen und Gutschriften', DB.invoices.map((i) => `${i.nr} | ${i.kind === 'gutschrift' ? 'Gutschrift' : 'Rechnung'} | ${aiShort(aiClean(custName(i.customerId)), 30)} | ${fDate(i.date)} | fällig ${fDate(i.due)} | brutto ${nf(i.gross, 2)} € | ${invoiceState(i).label} | Mahnstufe ${DUNNING[i.dunning]} | Aufträge ${i.lines.map((l) => l.orderId).join(',')}`));
    sec('Eingangsrechnungen', DB.inInvoices.map((i) => `${i.nr} | ${aiClean(i.supplier)} | ${i.kind} | ${aiShort(aiClean(i.text), 50)} | fällig ${fDate(i.due)} | brutto ${nf(i.gross, 2)} € | ${i.status}`));
  }
  if (can('angebote')) sec('Angebote', DB.quotes.map((q) => `${q.nr} | ${aiShort(aiClean(custName(q.customerId)), 30)} | ${q.from}→${q.to} | ${ttype(q.type).name.split(' (')[0]} | ${nf(q.weight, 1)} kg | netto ${nf(q.net, 2)} € | ${(QUOTE_ST[q.status] || [q.status])[0]} | gültig bis ${fDate(q.valid)}${q.orderId ? ' | Auftrag ' + q.orderId : ''}`));
  if (can('reklamation')) sec('Reklamationen', DB.claims.map((c) => `${c.nr} | Auftrag ${c.orderId} | ${aiShort(aiClean(custName(c.customerId)), 30)} | ${c.type} | ${(CLAIM_STATUS[c.status] || [c.status])[0]} | verantwortlich ${aiClean(c.resp || '–')} | Kosten ${nf(c.cost, 2)} € | ${aiShort(aiClean(c.text), 90)}`));
  if (can('partner')) sec('Frachtführer', DB.partners.map((p) => `${aiClean(p.name)} | ${p.city} | ${aiClean(p.areas)} | ${nf(p.perKm, 2)} €/km, mind. ${nf(p.min, 2)} € | Bewertung ${p.rating} | pünktlich ${p.onTime} % | offene Aufträge ${DB.orders.filter((o) => o.carrier && o.carrier.partnerId === p.id && o.carrier.status !== 'geliefert' && o.status !== 'storniert').length}`));
  if (can('lager')) sec('Lager (Stück je Standort)', DB.wh.articles.map((a) => `${a.sku} | ${aiClean(a.name)} | ${DB.wh.locations.map((l) => `${l.name.split(' ').pop()} ${a.stock[l.id] || 0}`).join(', ')} | gesamt ${stockOf(a)} | Mindestbestand ${a.min}${stockOf(a) < a.min ? ' | UNTER MINDESTBESTAND' : ''}`));
  if (can('komm')) sec('Nachrichten (Unterhaltungen)', DB.threads.map((t) => { const m = t.msgs[t.msgs.length - 1] || {}; return `${aiClean(t.title)} | ${t.kind} | ungelesen ${t.unread || 0} | zuletzt ${aiClean(m.from || '')}: ${aiShort(aiClean(m.text), 80)}`; }));
  if (can('auftraege') || can('angebote')) {
    const S = DB.settings, s = S.surcharges;
    sec('Preisregeln', [...S.transportTypes.map((t) => `${t.id} (${t.name}): Grundpreis ${t.base} €, ${t.perKm} €/km, ${t.perKg} €/kg, Mindestpreis ${t.min} €, max. ${t.maxKg} kg`), `Zuschläge: Express ${s.expressPct} %, Hoch ${s.hochPct} %, Diesel ${s.dieselPct} %, Maut ${s.tollPerKm} €/km (bei ${s.tollTypes.join(', ')}), Wartezeit ${s.waitPerHour} €/Std. nach ${s.freeWaitMin} Min. Freizeit, Straßenfaktor ${s.roadFactor}. MwSt. ${S.vat} %.`, `Zusatzleistungen: ${S.extras.map((e) => `${e.name} ${e.fix} €`).join('; ')}.`]);
  }
  sec('Aufgaben', DB.tasks.map((t) => `${t.done ? '[erledigt]' : '[offen]'} ${aiClean(t.text)} (bis ${fDate(t.due)})`));
  let text = out.join('\n');
  if (text.length > budget) text = text.slice(0, budget - 40) + '\n[Auszug gekürzt wegen Größe]';
  return text;
}

/* ---------- Lokalmodus: Antworten aus festen Regeln ---------- */
const aiLink = (label, href) => `[[${label}|${href}]]`;
function aiMore(arr, n, fn, link) { const shown = arr.slice(0, n).map(fn); return shown.map((s) => `- ${s}`).join('\n') + (arr.length > n ? `\n- … und ${arr.length - n} weitere${link ? ' ' + link : ''}` : ''); }
function aiOrderSummary(o) {
  const eta = orderEta(o); const t = o.tourId && tour(o.tourId); const d = t && drv(t.driverId); const v = t && veh(t.vehicleId);
  const lines = [`**${o.nr}** · ${aiClean(custName(o.customerId))} · ${o.pickup.city} → ${o.delivery.city}`,
    `- Status: **${stat(o.status).name}**, Priorität ${prioOf(o.prio).name}${isLate(o) ? ', **verspätet**' : ''}`,
    `- Abholung ${aiDayName(o.pickup.date)} ${o.pickup.from}–${o.pickup.to} Uhr, Zustellung ${aiDayName(o.delivery.date)} ${o.delivery.from}–${o.delivery.to} Uhr`,
    `- Sendungsnummer ${o.tracking}, ${nf(o.goods.weight, 1)} kg, ${aiShort(aiClean(o.goods.desc), 70)}`];
  if (eta) lines.push(`- Voraussichtliche Zustellung ${hhmm(eta.eta)} Uhr${eta.late ? ` (${eta.lateMin} Min. nach Fensterende)` : ', im Zeitfenster'}`);
  else if (o.pod) lines.push(`- Zugestellt am ${fDT(o.pod.ts)}, empfangen von ${o.source === 'shop' ? aiInitials(o.pod.name) : aiClean(o.pod.name)}`);
  if (t) lines.push(`- Tour ${t.id}${d ? ' mit ' + d.name : ''}${v ? ' (' + v.plate + ')' : ''}, Tour ist ${t.status}`);
  else if (o.carrier) lines.push(`- Frachtführer ${(par(o.carrier.partnerId) || {}).name}: ${o.carrier.status}, Frachtpreis ${eur(o.carrier.price)}`);
  else if (!['zugestellt', 'abgeschlossen', 'storniert'].includes(o.status)) lines.push('- Noch nicht disponiert');
  if (o.flags && o.flags.problem) lines.push(`- **Problem:** ${aiClean(o.flags.problemText)}`);
  if (o.flags && o.flags.delay) lines.push(`- Gemeldeter Verzug: ca. ${o.flags.delay.min} Min. (${o.flags.delay.reason})`);
  lines.push(`- Preis ${eur(o.price)} netto${o.invoiceId ? `, Rechnung ${o.invoiceId}` : isDone(o) ? ', noch nicht abgerechnet' : ''}`);
  lines.push(`${aiLink('Auftrag öffnen', `#/auftraege/${o.id}`)} · ${aiLink('Sendung verfolgen', `#/tracking?nr=${o.tracking}`)}`);
  return lines.join('\n');
}
function aiCustomerSummary(c) {
  const os = DB.orders.filter((o) => o.customerId === c.id && o.status !== 'storniert'); const open = DB.invoices.filter((i) => i.customerId === c.id && i.kind === 'rechnung' && i.status === 'offen');
  return [`**${aiClean(c.name)}** (${c.nr}) · ${c.type} · ${c.city}`, `- Konditionen: Preisliste ${c.priceList}, Rabatt ${c.discount} %, Zahlungsziel ${c.terms ? c.terms + ' Tage' : 'sofort'}`, `- ${os.length} Aufträge, Umsatz ${eur(sum(os, (o) => o.price))} netto, ${os.filter((o) => ACTIVE.includes(o.status)).length} davon aktiv`, `- Offene Rechnungen: ${open.length} über ${eur(sum(open, (i) => i.gross))}`, `- Ansprechpartner: ${aiClean((c.contacts[0] || {}).name || '–')}`, aiLink('Kunde öffnen', `#/kunden/${c.id}`)].join('\n');
}
function aiDriverSummary(d, date) {
  const s = driverState(d); const ab = driverAbsent(d, date || today()); const ts = DB.tours.filter((t) => t.driverId === d.id && t.status !== 'abgeschlossen');
  return [`**${d.name}** · ${branchName(d.branch)} · ${s.label}`, `- Fahrerlaubnis ${d.licenses.join(', ')}, Fahrzeug ${(veh(d.vehicleId) || {}).plate || 'keins'}`, ab ? `- Abwesend (${ab.kind}) am ${fDate(date || today())}` : '', ...ts.map((t) => `- Tour ${t.id} am ${fDate(t.date)} (${t.status}, ${t.seq.length} Stopps)`), ...d.quals.filter((q) => q.exp && dueState(q.exp, 30).tone !== 'green').map((q) => `- Nachweis „${q.name}“ ${dueState(q.exp, 30).n < 0 ? 'abgelaufen' : 'läuft am ' + fDate(q.exp) + ' ab'}`), aiLink('Fahrer öffnen', `#/fahrer/${d.id}`)].filter(Boolean).join('\n');
}
function aiVehicleSummary(v) {
  const s = vehicleState(v);
  return [`**${v.plate}** · ${vtype(v.type).name} · ${branchName(v.branch)} · ${s.label}`, `- Nutzlast ${nf(v.payload)} kg, Volumen ${v.volume} m³, Ausstattung ${v.equipment.join(', ') || 'keine'}`, `- Hauptuntersuchung ${fDate(v.tuev)} (${dueState(v.tuev).label}), Service ${fDate(v.service)} (${dueState(v.service).label}), Versicherung ${fDate(v.insurance)}`, ...v.defects.filter((d) => d.open).map((d) => `- Offener Defekt: ${aiClean(d.text)}`), aiLink('Fahrzeug öffnen', `#/fuhrpark/${v.id}`)].join('\n');
}
function aiTourSummary(t) {
  const sch = scheduleTour(t); const d = drv(t.driverId), v = veh(t.vehicleId);
  return [`**Tour ${t.id}** · ${fDay(t.date)} · ${t.status} · ${d ? d.name : '–'} · ${v ? v.plate : '–'}`, `- ${sch.stops.length} Stopps, ${nf(sch.totalKm)} km, Ende ca. ${hhmm(sch.end)} Uhr`, ...sch.stops.map((s, i) => `- ${i + 1}. ${s.kind === 'P' ? 'Abholung' : 'Zustellung'} ${s.addr.city} (${s.orderId}): ${s.done ? 'erledigt ' + hhmm(s.doneTs) : 'ETA ' + hhmm(s.eta) + (s.late ? ` (+${s.lateMin} Min.)` : '')}`), aiLink('In der Disposition öffnen', `#/dispo?date=${t.date}&tour=${t.id}`)].join('\n');
}
function aiEntities(q) {
  const n = aiNorm(q); const up = String(q).toUpperCase(); const E = { orders: [], tours: [], invoices: [], claims: [], customers: [], quotes: [], vehicles: [], drivers: [] };
  const push = (arr, x) => { if (x && !arr.includes(x)) arr.push(x); };
  (up.match(/\bA-\d{4}-\d{4}\b/g) || []).forEach((id) => { const o = ord(id); if (o && inScope(o.branch)) push(E.orders, o); });
  (up.match(/\bJWG-[A-Z0-9]{4,8}\b/g) || []).forEach((id) => { const o = findOrderByNo(id); if (o && inScope(o.branch)) push(E.orders, o); });
  (up.match(/\bT-\d{4}-\d{4}\b/g) || []).forEach((id) => push(E.tours, tour(id)));
  (up.match(/\b(R|G)-\d{4}-\d{4}\b/g) || []).forEach((id) => push(E.invoices, DB.invoices.find((i) => i.nr === id)));
  (up.match(/\bRK-\d{4}-\d{3}\b/g) || []).forEach((id) => push(E.claims, DB.claims.find((c) => c.nr === id)));
  (up.match(/\bAN-\d{4}-\d{4}\b/g) || []).forEach((id) => push(E.quotes, DB.quotes.find((c) => c.nr === id)));
  (up.match(/\bK-\d{4}\b/g) || []).forEach((id) => push(E.customers, DB.customers.find((c) => c.nr === id)));
  DB.vehicles.forEach((v) => { if (n.includes(aiNorm(v.plate))) push(E.vehicles, v); });
  DB.drivers.forEach((d) => { const parts = aiNorm(d.name).split(' '); const last = parts[parts.length - 1]; if (n.includes(aiNorm(d.name)) || (last.length >= 4 && new RegExp(`\\b${last}\\b`).test(n))) push(E.drivers, d); });
  const generic = new Set(['verein', 'gmbh', 'schule', 'goethe', 'goethe-schule', 'gymnasium', 'ehemals', 'campus', 'nord', 'soehne', 'endkunden']);
  DB.customers.forEach((c) => { const toks = aiNorm(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !generic.has(w)); if (toks.some((w) => new RegExp(`\\b${w}`).test(n))) push(E.customers, c); });
  return E;
}
function aiCities(q) {
  const n = ' ' + aiNorm(q) + ' '; const found = [];
  CITIES.forEach((c) => { const names = [aiNorm(c.name), aiNorm(c.name).replace(/ am main$/, '')]; for (const nm of names) { const i = n.indexOf(' ' + nm); if (i >= 0 && (n[i + nm.length + 1] || ' ').match(/[\s.,?!]/)) { found.push({ c, i }); break; } } });
  return found.sort((a, b) => a.i - b.i).map((x) => x.c).filter((c, i, arr) => arr.indexOf(c) === i);
}
function aiNum(s) { return parseFloat(String(s).replace(',', '.')); }
function aiPriceAnswer(q, n, E) {
  const cities = aiCities(q); if (cities.length < 2) return null;
  const kgM = n.match(/(\d+[.,]?\d*)\s*(kg|kilo)/), tM = n.match(/(\d+[.,]?\d*)\s*(t|tonnen?)\b/), palM = n.match(/(\d+)\s*palett/);
  const kg = kgM ? aiNum(kgM[1]) : tM ? aiNum(tM[1]) * 1000 : palM ? +palM[1] * 250 : null; const w = kg == null ? 10 : kg;
  let type = /palett/.test(n) ? 'palette' : /komplett|ftl|ganzer lkw|voller lkw/.test(n) ? 'komplett' : /stueckgut/.test(n) ? 'stueckgut' : /kurier|eilfahrt/.test(n) ? 'kurier' : /paket/.test(n) ? 'paket' : w <= 31.5 ? 'paket' : w <= 2500 ? 'stueckgut' : 'komplett';
  const prio = /express|eilig|dringend/.test(n) ? 'express' : /hohe prioritaet/.test(n) ? 'hoch' : 'normal';
  const extras = DB.settings.extras.filter((e) => e.fix && n.includes(aiNorm(e.name.split(' ')[0]))).map((e) => e.id);
  const c = E.customers[0];
  const o = { type, prio, extras, customerId: c && c.id, goods: { weight: w, volume: 0, pallets: palM ? +palM[1] : 0 }, pickup: cityGeo(cities[0].name), delivery: cityGeo(cities[1].name) };
  const pr = calcPrice(o);
  return [`**${eur(pr.net)} netto** (${eur(pr.gross)} brutto) für ${ttype(type).name.split(' (')[0]} ${cities[0].name} → ${cities[1].name}, ${nf(w, 1)} kg, ${nf(pr.km)} km${prio !== 'normal' ? ', ' + prioOf(prio).name : ''}${c ? ', Kundentarif ' + aiClean(c.name) : ''}.`, ...pr.lines.map((l) => `- ${l.label}: ${eur(l.amount)}`), `Annahmen: ${kg == null ? 'Gewicht 10 kg angenommen, ' : ''}Transportart ${ttype(type).name.split(' (')[0]}${extras.length ? ', Zusatz: ' + extras.map(extraName).join(', ') : ''}. Schätzung nach den aktuellen Tarifen.`, aiLink('Angebot kalkulieren', '#/angebote/neu')].join('\n');
}
const AI_SYN = [[/\b(lege|legt|leg|erfasse|erfasst|erfassen|eingeben|gebe|trage)\b/, 'anlegen'], [/\b(erstelle|erstellt|erstellen|mache|machen|generiere|schreibe)\b/, 'erstellen anlegen'], [/\b(bearbeite|aendere|aendern|korrigiere|korrigieren|editiere)\b/, 'bearbeiten aendern'], [/\b(loesche|loeschen|entferne|entfernen)\b/, 'loeschen'], [/\b(storniere|stornieren|absage|absagen|abbrechen)\b/, 'stornieren'], [/\b(weise|weist|ordne|ordnet|zuordnen)\b/, 'zuweisen'], [/\b(verfolge|verfolgt)\b/, 'verfolgen'], [/\b(starte|starten|beginne)\b/, 'starten'], [/\b(bezahle|buche|buchen)\b/, 'bezahlt zahlung']];
const aiStem = (w) => w.slice(0, 5);
function aiHelp(n) {
  let q = n; AI_SYN.forEach(([re, add]) => { if (re.test(q)) q += ' ' + add; });
  const toks = q.split(/[\s.,:/]+/).filter((w) => w.length >= 3); const stems = new Set(toks.map(aiStem));
  let best = null, score = 0;
  HELP.forEach((h) => {
    let sc = 0;
    h.keys.forEach((k) => { const kw = k.split(' '); if (q.includes(k)) sc += 3 + kw.length; else if (kw.every((w) => w.length >= 3 && stems.has(aiStem(w)))) sc += 2 + kw.length; });
    toks.forEach((w) => { if (aiNorm(h.title).includes(w)) sc += 1; });
    if (sc > score) { score = sc; best = h; }
  });
  return score >= 3 ? best : null;
}
function aiDateOf(n) { if (/uebermorgen/.test(n)) return { d: addDays(today(), 2), l: 'übermorgen' }; if (/morgen/.test(n) && !/guten morgen/.test(n)) return { d: addDays(today(), 1), l: 'morgen' }; if (/gestern/.test(n)) return { d: addDays(today(), -1), l: 'gestern' }; if (/heute|jetzt|aktuell/.test(n)) return { d: today(), l: 'heute' }; return null; }

function aiLocal(question, page) {
  const q = String(question || '').trim(); const n = aiNorm(q); const has = (re) => re.test(n);
  if (!q) return 'Stell mir eine Frage zu Aufträgen, Touren, Fahrern, Rechnungen oder zur Bedienung der App.';
  if (has(/^(hallo|hi|hey|moin|servus|guten (tag|morgen|abend))\b/) && n.length < 32) return `Hallo! Ich bin der JWG-Assistent und lese die Daten der App für dich. Frag mich zum Beispiel nach verspäteten Sendungen, freien Fahrern, überfälligen Rechnungen, dem Preis einer Fahrt oder wie etwas in der App geht.`;
  if (has(/^(danke|vielen dank|super|top|perfekt|prima|ok|okay)\b/) && n.length < 40) return 'Gern! Frag einfach weiter, wenn du etwas brauchst.';
  const howTo = has(/\bwie (kann|geht|funktioniert|lege|erstell|trage|mache|ordne|weise|storn|bearbeit|aender|loesche|richte|fuege|starte|oeffne|finde|sehe|bekomme|schicke|sende|melde|buche|gebe|verfolge)|\banleitung|\bwo (kann|finde|sehe|stelle|ist der|ist die)|\bwas bedeutet|\bschritt|\bwas ist (ein|eine|der|die|das) [a-z ]*status/);
  const E = aiEntities(q); const date = aiDateOf(n); const dd = date ? date.d : today(); const dl = date ? date.l : 'heute';
  const ctx = aiPageEntity(page); const refers = has(/\b(dies(e|er|en|es|em)?|hier|aktuell(e|er|en|es)?|diesem|diesen)\b/);
  // 1) konkrete Objekte
  if (!E.orders.length && refers && ctx && ctx.kind === 'order') E.orders.push(ctx.obj);
  if (!E.customers.length && refers && ctx && ctx.kind === 'customer') E.customers.push(ctx.obj);
  if (!E.drivers.length && refers && ctx && ctx.kind === 'driver') E.drivers.push(ctx.obj);
  if (!E.vehicles.length && refers && ctx && ctx.kind === 'vehicle') E.vehicles.push(ctx.obj);
  if (!E.tours.length && refers && ctx && ctx.kind === 'tour') E.tours.push(ctx.obj);
  const priceQ = has(/kostet|preis|kosten|tarif|wie teuer|was zahle/) && aiCities(q).length >= 2;
  const distQ = has(/entfernung|wie weit|kilometer|fahrzeit|wie lange (dauert|faehrt|braucht)|distanz|co2/) && aiCities(q).length >= 2;
  if (priceQ) { const d = aiDeny('auftraege') && aiDeny('angebote'); if (d) return d; return aiPriceAnswer(q, n, E); }
  if (distQ) { const c = aiCities(q); const km = roadKm({ lat: c[0].lat, lon: c[0].lon }, { lat: c[1].lat, lon: c[1].lon }); return `**${c[0].name} → ${c[1].name}: ca. ${nf(km)} km** Straße (Luftlinie × ${nf(DB.settings.surcharges.roadFactor, 2)}), Fahrzeit etwa ${dur(travelMin(km))} mit dem Transporter. CO₂ für 1 t Ladung ca. ${nf(co2Of(km, 1000, 'stueckgut'), 1)} kg (Schätzung).`; }
  if (E.orders.length) { const d = aiDeny('auftraege'); if (d) return d; return E.orders.slice(0, 2).map(aiOrderSummary).join('\n\n'); }
  if (E.invoices.length) { const d = aiDeny('abrechnung'); if (d) return d; const i = E.invoices[0], s = invoiceState(i); return [`**${i.nr}** · ${i.kind === 'gutschrift' ? 'Gutschrift' : 'Rechnung'} · ${aiClean(custName(i.customerId))}`, `- ${fDate(i.date)}, fällig ${fDate(i.due)}, brutto ${eur(i.gross)} (netto ${eur(i.net)})`, `- Status: **${s.label}**${i.kind === 'rechnung' && i.status === 'offen' ? ', Mahnstufe ' + DUNNING[i.dunning] : ''}`, `- Aufträge: ${i.lines.map((l) => l.orderId).join(', ')}`, aiLink('Abrechnung öffnen', '#/abrechnung')].join('\n'); }
  if (E.claims.length) { const d = aiDeny('reklamation'); if (d) return d; const c = E.claims[0]; return [`**${c.nr}** · ${c.type} · Auftrag ${c.orderId}`, `- Status: ${(CLAIM_STATUS[c.status] || [c.status])[0]}, verantwortlich ${aiClean(c.resp || '–')}, Kosten ${eur(c.cost)}`, `- ${aiClean(c.text)}`, aiLink('Reklamation öffnen', `#/reklamation/${c.id}`)].join('\n'); }
  if (E.quotes.length) { const d = aiDeny('angebote'); if (d) return d; const c = E.quotes[0]; return [`**${c.nr}** · ${aiClean(custName(c.customerId))} · ${c.from} → ${c.to}`, `- ${eur(c.net)} netto, Status ${(QUOTE_ST[c.status] || [c.status])[0]}, gültig bis ${fDate(c.valid)}`, c.orderId ? `- Auftrag ${c.orderId}` : '', aiLink('Angebot öffnen', `#/angebote/${c.id}`)].filter(Boolean).join('\n'); }
  if (E.tours.length) { const d = aiDeny('dispo'); if (d) return d; return aiTourSummary(E.tours[0]); }
  if (E.vehicles.length) { const d = aiDeny('fuhrpark'); if (d) return d; return aiVehicleSummary(E.vehicles[0]); }
  if (E.drivers.length) { const d = aiDeny('fahrer'); if (d) return d; return aiDriverSummary(E.drivers[0], dd); }
  if (E.customers.length) { const d = aiDeny('kunden'); if (d) return d; return aiCustomerSummary(E.customers[0]); }
  if (howTo) { const hh = aiHelp(n); if (hh) return `**${hh.title}**\n${hh.text}\n${aiLink(`${hh.title} öffnen`, hh.link)}`; }
  const os = scoped(DB.orders); const ordLink = (g) => aiLink('Alle ansehen', `#/auftraege?grp=${g}`);
  const orderTopic = has(/auftrag|auftraege|sendung|lieferung|\btransporte?n?\b|paket|paeckchen|bestellung/);
  const otherCount = has(/fahrer|fahrzeug|kunde|rechnung|reklamation|tour|artikel|angebot|aufgabe|nachricht|partner|frachtfuehrer|lkw|transporter|hoodie|pullover|shirt|chino|guertel|\bcap\b|beutel|schluesselband|lager|bestand/);
  // 2) Lage und Probleme
  if (has(/was ist (heute )?los|tagesueberblick|tagesuebersicht|ueberblick|zusammenfassung|lage heute|status heute|wie laeuft/) || (has(/^(heute|status|lage)\??$/))) {
    const d = aiDeny('auftraege'); if (d) return d; const T = today(); const pr = problems().filter((p) => inScope(p.order.branch) && p.kind !== 'Reklamation');
    const tours = scoped(DB.tours).filter((t) => t.date === T);
    return [`**Lage am ${fDate(T)}, ${hhmm(NOW())} Uhr**`, `- Aufträge: ${os.filter((o) => ['entwurf', 'offen'].includes(o.status)).length} offen, ${os.filter((o) => o.status === 'geplant').length} geplant, ${os.filter((o) => ['abgeholt', 'in_zustellung'].includes(o.status)).length} unterwegs, ${os.filter((o) => isDone(o) && o.delivery.date === T).length} heute zugestellt`, `- Touren heute: ${tours.length} (${tours.filter((t) => t.status === 'unterwegs').length} unterwegs)`, pr.length ? `- Achtung (${pr.length}): ${pr.slice(0, 3).map((p) => `${p.order.nr} ${p.kind.toLowerCase()}`).join(', ')}` : '- Keine Verspätungen oder Problemfälle', `- Überfällige Rechnungen: ${can('abrechnung') ? DB.invoices.filter((i) => invoiceState(i).id === 'ueberfaellig').length : 'kein Zugriff'}`, `${aiLink('Dashboard', '#/dashboard')} · ${aiLink('Disposition', '#/dispo')}`].join('\n');
  }
  if (has(/verspaet|zu spaet|nicht puenktlich|verzoeger|verzug/) && !has(/rechnung|zahlung/)) {
    const d = aiDeny('auftraege'); if (d) return d; const pr = problems().filter((p) => inScope(p.order.branch) && ['Verspätet', 'Verspätung'].includes(p.kind));
    return pr.length ? `**${pr.length} verspätete Sendung${pr.length > 1 ? 'en' : ''}:**\n` + aiMore(pr, 8, (p) => `${p.order.nr} (${aiClean(custName(p.order.customerId))}): ${p.text}`, ordLink('problem')) : 'Aktuell ist keine Sendung verspätet. Alle Touren liegen im Zeitfenster.';
  }
  if (has(/problem|stoerung|probleme|stockt|haengt/) && !has(/reklamation/)) {
    const d = aiDeny('auftraege'); if (d) return d; const pr = problems().filter((p) => inScope(p.order.branch) && p.kind !== 'Reklamation');
    return pr.length ? `**${pr.length} Problemfall${pr.length > 1 ? 'e' : ''}:**\n` + aiMore(pr, 8, (p) => `${p.order.nr}: ${p.kind}, ${p.text}`, ordLink('problem')) : 'Es gibt keine Problemfälle oder Verspätungen.';
  }
  // 3) Aufträge nach Status
  if (orderTopic || (has(/wie viele|anzahl/) && !otherCount)) {
    const pick = (ids, label, g) => { const d = aiDeny('auftraege'); if (d) return d; const list = os.filter((o) => ids.includes(o.status)); return list.length ? `**${list.length} ${label}:**\n` + aiMore(list, 8, (o) => `${o.nr} · ${aiClean(custName(o.customerId))} · ${o.pickup.city} → ${o.delivery.city} (${stat(o.status).name}, Abholung ${aiDayName(o.pickup.date)})`, ordLink(g)) : `Es gibt keine ${label}.`; };
    if (has(/zugestellt|geliefert|abgeliefert|angekommen/)) { const d = aiDeny('auftraege'); if (d) return d; const list = os.filter((o) => isDone(o) && (!date || o.delivery.date === dd)); return `${list.length} Auftrag${list.length === 1 ? ' ist' : 'e sind'} ${date ? dl + ' ' : ''}zugestellt${list.length ? ':\n' + aiMore(list, 6, (o) => `${o.nr} · ${o.delivery.city}`, ordLink('fertig')) : '.'}`; }
    if (has(/offen|nicht disponiert|ohne tour|unverplant|zu disponieren/)) return pick(['entwurf', 'offen'], 'offene Aufträge', 'offen');
    if (has(/unterwegs|laufend|auf tour|in zustellung|abgeholt/)) return pick(['abgeholt', 'in_zustellung'], 'Aufträge unterwegs', 'laufend');
    if (has(/geplant|disponiert/)) return pick(['geplant'], 'geplante Aufträge', 'geplant');
    if (has(/storniert/)) return pick(['storniert'], 'stornierte Aufträge', 'storniert');
    if (has(/wie viele|anzahl/)) { const d = aiDeny('auftraege'); if (d) return d; return `Im Standortfilter gibt es **${os.length} Aufträge**: ${DB.settings.statuses.map((s) => [s.name, os.filter((o) => o.status === s.id).length]).filter((x) => x[1]).map((x) => `${x[1]} ${x[0]}`).join(', ')}.`; }
  }
  // 4) Touren, Fahrer, Fahrzeuge
  if (has(/\btour(en)?\b/) && !howTo) {
    const d = aiDeny('dispo'); if (d) return d; const ts = scoped(DB.tours).filter((t) => t.date === dd);
    return ts.length ? `**${ts.length} Tour${ts.length > 1 ? 'en' : ''} ${dl} (${fDate(dd)}):**\n` + aiMore(ts, 8, (t) => { const sch = scheduleTour(t); return `${t.id} · ${(drv(t.driverId) || {}).name} · ${(veh(t.vehicleId) || {}).plate} · ${t.status} · ${t.seq.length} Stopps, Ende ca. ${hhmm(sch.end)} Uhr`; }, aiLink('Disposition', `#/dispo?date=${dd}`)) : `Für ${dl} (${fDate(dd)}) gibt es keine Tour. ${aiLink('Tour anlegen', '#/dispo?date=' + dd)}`;
  }
  if (has(/fahrer|disponent|kollege|mitarbeiter im einsatz/) && !howTo) {
    const d = aiDeny('fahrer'); if (d) return d; const ds = scoped(DB.drivers);
    const stateOn = (x, date) => { const ab = driverAbsent(x, date); if (ab) return { id: 'abwesend', l: ab.kind }; if (DB.tours.some((t) => t.date === date && t.driverId === x.id && t.status !== 'abgeschlossen')) return { id: 'tour', l: 'hat eine Tour' }; if (date === today() && x.status === 'pause') return { id: 'pause', l: 'Pause' }; return { id: 'frei', l: 'frei' }; };
    const f = (id, pl, sg) => { const list = ds.filter((x) => stateOn(x, dd).id === id); return list.length ? `**${list.length} Fahrer ${list.length === 1 ? sg : pl} (${dl}, ${fDate(dd)}):**\n` + aiMore(list, 10, (x) => `${x.name} (${branchName(x.branch)}, ${x.licenses.join('/')}${id === 'abwesend' ? ', ' + stateOn(x, dd).l : ''})`, aiLink('Fahrer', '#/fahrer')) : `Kein Fahrer ${pl === 'sind frei' ? 'ist frei' : pl === 'sind abwesend' ? 'ist abwesend' : 'hat eine Tour'} (${dl}, ${fDate(dd)}).`; };
    if (has(/frei|verfuegbar|einsetzbar|zur verfuegung|kann fahren/)) return f('frei', 'sind frei', 'ist frei');
    if (has(/abwesend|krank|urlaub|fehlt|ausfall/)) return f('abwesend', 'sind abwesend', 'ist abwesend');
    if (has(/auf tour|unterwegs|im einsatz/)) return f('tour', 'haben eine Tour', 'hat eine Tour');
    if (has(/nachweis|qualifikation|ablauf|abgelaufen|fuehrerschein|schulung/)) { const list = ds.flatMap((x) => x.quals.filter((qq) => qq.exp && dueState(qq.exp, 30).tone !== 'green').map((qq) => ({ x, qq }))); return list.length ? `**${list.length} Nachweis${list.length > 1 ? 'e' : ''} laufen ab oder sind abgelaufen:**\n` + aiMore(list, 8, (e) => `${e.x.name}: ${e.qq.name}, ${dueState(e.qq.exp, 30).n < 0 ? 'abgelaufen am ' : 'gültig bis '}${fDate(e.qq.exp)}`) : 'Alle Nachweise sind mindestens 30 Tage gültig.'; }
    return `**${ds.length} Fahrer** (${dl}): ${ds.map((x) => `${x.name} (${stateOn(x, dd).l})`).join(', ')}. ${aiLink('Fahrer öffnen', '#/fahrer')}`;
  }
  if (has(/fahrzeug|lkw|transporter|sprinter|sattelzug|fuhrpark|tuev|hauptuntersuchung|\bhu\b|werkstatt|gesperrt|wartung|defekt/) && !howTo) {
    const d = aiDeny('fuhrpark'); if (d) return d; const vs = scoped(DB.vehicles);
    if (has(/gesperrt|werkstatt|defekt|kaputt|nicht einsatz|ausgefallen/)) { const list = vs.filter((v) => ['gesperrt', 'werkstatt'].includes(v.status)); return list.length ? `**${list.length} Fahrzeug${list.length > 1 ? 'e' : ''} nicht einsatzbereit:**\n` + aiMore(list, 8, (v) => `${v.plate}: ${vehicleState(v).label}${v.note ? ' – ' + aiClean(v.note) : ''}`, aiLink('Fuhrpark', '#/fuhrpark')) : 'Alle Fahrzeuge sind einsatzbereit.'; }
    if (has(/tuev|hauptuntersuchung|\bhu\b|wartung|service|faellig|versicherung|termin/)) { const list = vs.map((v) => ({ v, d: dueState(v.tuev, 30) })).filter((x) => x.d.tone !== 'green'); const sv = vs.map((v) => ({ v, d: dueState(v.service, 30) })).filter((x) => x.d.tone !== 'green'); return (list.length || sv.length) ? `**Fällige Termine:**\n` + [...list.map((x) => `- ${x.v.plate}: Hauptuntersuchung ${x.d.n < 0 ? 'seit ' + -x.d.n + ' Tagen überfällig' : 'in ' + x.d.n + ' Tagen'} (${fDate(x.v.tuev)})`), ...sv.map((x) => `- ${x.v.plate}: Service ${x.d.n < 0 ? 'überfällig' : 'in ' + x.d.n + ' Tagen'} (${fDate(x.v.service)})`)].join('\n') : 'In den nächsten 30 Tagen ist kein Termin fällig.'; }
    if (has(/frei|verfuegbar|einsatzbereit/)) { const list = vs.filter((v) => vehicleState(v).id === 'frei'); return `**${list.length} Fahrzeuge frei:** ${list.map((v) => v.plate).join(', ')}.`; }
    return `**${vs.length} Fahrzeuge:** ${vs.filter((v) => vehicleState(v).id === 'frei').length} frei, ${vs.filter((v) => vehicleState(v).id === 'einsatz').length} im Einsatz, ${vs.filter((v) => ['gesperrt', 'werkstatt'].includes(v.status)).length} gesperrt oder in der Werkstatt. ${aiLink('Fuhrpark', '#/fuhrpark')}`;
  }
  // 5) Geld
  if (has(/rechnung|forderung|offene posten|mahn|zahlung|ueberfaellig|bezahlt|unbezahlt|eingangsrechnung|verbindlich/) && !howTo) {
    const d = aiDeny('abrechnung'); if (d) return d; const open = DB.invoices.filter((i) => i.kind === 'rechnung' && i.status === 'offen'); const over = open.filter((i) => invoiceState(i).id === 'ueberfaellig');
    if (has(/eingangsrechnung|verbindlich/)) { const o2 = DB.inInvoices.filter((i) => i.status === 'offen'); return `**${o2.length} offene Eingangsrechnungen über ${eur(sum(o2, (i) => i.gross))}:**\n` + aiMore(o2, 6, (i) => `${i.nr} · ${aiClean(i.supplier)} · ${eur(i.gross)} · fällig ${fDate(i.due)}`, aiLink('Abrechnung', '#/abrechnung')); }
    if (has(/ueberfaellig|mahn|verzug/)) return over.length ? `**${over.length} überfällige Rechnung${over.length > 1 ? 'en' : ''} über ${eur(sum(over, (i) => i.gross))}:**\n` + aiMore(over, 6, (i) => `${i.nr} · ${aiClean(custName(i.customerId))} · ${eur(i.gross)} · ${invoiceState(i).label}, Stand: ${DUNNING[i.dunning]}`, aiLink('Mahnen', '#/abrechnung')) : 'Es gibt keine überfälligen Rechnungen.';
    const ready = readyOrders(); return `**Offene Forderungen: ${eur(sum(open, (i) => i.gross))}** in ${open.length} Rechnungen, davon ${over.length} überfällig (${eur(sum(over, (i) => i.gross))}). ${ready.length} zugestellte Aufträge (${eur(sum(ready, (o) => o.price))} netto) warten auf die Rechnung. ${aiLink('Abrechnung', '#/abrechnung')}`;
  }
  if (has(/umsatz|marge|gewinn|deckungsbeitrag|erloes|einnahmen|verdienst/)) {
    const d = aiDeny('auftraege'); if (d) return d; const T = today(); const d30 = os.filter((o) => isDone(o) && diffDays(T, o.delivery.date) <= 30 && diffDays(T, o.delivery.date) >= 0); const rev = sum(d30, (o) => o.price), cost = sum(d30, (o) => o.cost);
    const by = {}; d30.forEach((o) => { by[o.customerId] = (by[o.customerId] || 0) + o.price; }); const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `**Letzte 30 Tage (zugestellt):** Umsatz ${eur(rev)} netto, Kosten ${eur(cost)}, Deckungsbeitrag ${eur(rev - cost)} (Marge ${rev ? nf(((rev - cost) / rev) * 100) : 0} %), ${d30.length} Transporte.${top.length ? '\nUmsatzstärkste Kunden: ' + top.map(([id, v]) => `${aiClean(custName(id))} ${eur(v)}`).join(', ') : ''}\n${aiLink('Reporting', '#/reporting')}`;
  }
  if (has(/bester kunde|top kunde|wichtigste kunden|umsatzstaerkste/)) { const d = aiDeny('kunden'); if (d) return d; const rows = DB.customers.map((c) => ({ c, v: sum(DB.orders.filter((o) => o.customerId === c.id && o.status !== 'storniert'), (o) => o.price) })).sort((a, b) => b.v - a.v).slice(0, 5); return '**Kunden nach Umsatz (netto):**\n' + rows.map((r) => `- ${aiClean(r.c.name)}: ${eur(r.v)}`).join('\n'); }
  if (has(/\bkunden\b|kunde/) && !has(/portal/) && !howTo) { const d = aiDeny('kunden'); if (d) return d; const cs = DB.customers.filter((c) => !c.archived); return `Es gibt **${cs.length} aktive Kunden** (${DB.customers.length - cs.length} archiviert): ${cs.slice(0, 8).map((c) => aiClean(c.name)).join(', ')}${cs.length > 8 ? ' …' : ''}. ${aiLink('Kunden', '#/kunden')}`; }
  // 6) Weiteres
  if (has(/reklamation|schaden|beschwerde|fehlmenge/) && !howTo) { const d = aiDeny('reklamation'); if (d) return d; const open = DB.claims.filter((c) => !['geloest', 'abgelehnt'].includes(c.status)); return open.length ? `**${open.length} offene Reklamation${open.length > 1 ? 'en' : ''}** (${eur(sum(open, (c) => c.cost))} geschätzt):\n` + aiMore(open, 6, (c) => `${c.nr} · ${c.type} · Auftrag ${c.orderId} · ${(CLAIM_STATUS[c.status] || [c.status])[0]}`, aiLink('Reklamationen', '#/reklamation')) : 'Es gibt keine offenen Reklamationen.'; }
  if (has(/frachtfuehrer|partner|spedition|subunternehmer/) && !howTo) { const d = aiDeny('partner'); if (d) return d; const ps = DB.partners.slice().sort((a, b) => a.perKm - b.perKm); return `**${ps.length} Frachtführer** (nach Preis je km):\n` + ps.map((p) => `- ${aiClean(p.name)} (${p.city}): ${eur(p.perKm)}/km, mind. ${eur(p.min)}, Bewertung ${nf(p.rating, 1)}, ${p.onTime} % pünktlich`).join('\n'); }
  if (has(/lager|bestand|bestaende|vorrat|auf lager|nachbestellen|mindestbestand|hoodie|pullover|t-shirt|tshirt|chino|guertel|cap\b|stoffbeutel|schluesselband/) && !howTo) {
    const d = aiDeny('lager'); if (d) return d; const arts = DB.wh.articles;
    if (has(/mindestbestand|knapp|nachbestellen|zu wenig|niedrig|leer/)) { const low = arts.filter((a) => stockOf(a) < a.min); return low.length ? `**${low.length} Artikel unter Mindestbestand:**\n` + low.map((a) => `- ${a.name}: ${nf(stockOf(a))} Stück (Minimum ${a.min})`).join('\n') : 'Alle Artikel liegen über dem Mindestbestand.'; }
    const stop = new Set(['lager', 'bestand', 'bestaende', 'artikel', 'viele', 'haben', 'noch', 'gibt', 'stueck', 'vorrat', 'welche', 'sind', 'unsere', 'davon', 'wie', 'wir', 'sie', 'der', 'die', 'das', 'ist', 'und', 'auf', 'wieviel', 'wieviele']);
    const words = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stop.has(w));
    const hit = arts.filter((a) => { const toks = aiNorm(a.name + ' ' + a.sku).split(/[^a-z0-9]+/).filter((t) => t.length >= 3); return words.some((w) => toks.some((t) => w.startsWith(t) || t.startsWith(w))); });
    if (hit.length) return hit.slice(0, 6).map((a) => `**${a.name}** (${a.sku}): ${nf(stockOf(a))} Stück gesamt, ${DB.wh.locations.map((l) => `${l.name.split(' ').pop()} ${a.stock[l.id] || 0}`).join(', ')}${stockOf(a) < a.min ? ' – **unter Mindestbestand**' : ''}`).join('\n');
    return `Das Lager führt **${arts.length} Artikel** mit zusammen ${nf(sum(arts, stockOf))} Stück. ${arts.filter((a) => stockOf(a) < a.min).length} liegen unter dem Mindestbestand. ${aiLink('Lager', '#/lager')}`;
  }
  if (has(/angebot/) && !howTo) { const d = aiDeny('angebote'); if (d) return d; const qs = DB.quotes.filter((x) => x.status === 'versendet'); return `**${qs.length} Angebote warten auf Antwort** (${eur(sum(qs, (x) => x.net))} netto):\n` + (qs.length ? aiMore(qs, 6, (x) => `${x.nr} · ${aiClean(custName(x.customerId))} · ${x.from} → ${x.to} · ${eur(x.net)} · gültig bis ${fDate(x.valid)}`, aiLink('Angebote', '#/angebote')) : 'keine'); }
  if (has(/aufgabe|todo|to-do|zu erledigen/)) { const open = DB.tasks.filter((t) => !t.done); return open.length ? `**${open.length} offene Aufgaben:**\n` + open.map((t) => `- ${aiClean(t.text)} (bis ${fDate(t.due)})`).join('\n') : 'Alle Aufgaben sind erledigt.'; }
  if (has(/nachricht|postfach|ungelesen|chat mit/)) { const d = aiDeny('komm'); if (d) return d; const un = DB.threads.filter((t) => t.unread); return un.length ? `**${un.length} Unterhaltungen mit ungelesenen Nachrichten:**\n` + un.map((t) => `- ${aiClean(t.title)} (${t.unread})`).join('\n') + '\n' + aiLink('Kommunikation', '#/komm') : 'Keine ungelesenen Nachrichten.'; }
  // 7) Anleitungen
  const h = aiHelp(n);
  if (h) return `**${h.title}**\n${h.text}\n${aiLink(`${h.title} öffnen`, h.link)}`;
  return `Dazu habe ich im Lokalmodus keine passende Antwort. Ich kann Daten abfragen (z. B. „Welche Sendungen sind verspätet?“, „Welche Fahrer sind morgen frei?“, „Wo ist JWG-1DP7H?“, „Was kostet ein Palettenversand von Frankfurt nach Hamburg mit 300 kg?“) und die Bedienung erklären („Wie lege ich einen Auftrag an?“). Mit eingerichtetem KI-Server verstehe ich auch freie Fragen.`;
}

/* ---------- Darstellung der Antworten (nur eigene Auszeichnung, alles andere wird maskiert) ---------- */
function aiIdHref(id) {
  if (/^A-/.test(id)) return ord(id) && can('auftraege') ? `#/auftraege/${id}` : null;
  if (/^JWG-/.test(id)) { const o = findOrderByNo(id); return o && can('tracking') ? `#/tracking?nr=${o.tracking}` : o && can('auftraege') ? `#/auftraege/${o.id}` : null; }
  if (/^T-/.test(id)) { const t = tour(id); return t && can('dispo') ? `#/dispo?date=${t.date}&tour=${id}` : null; }
  if (/^(R|G)-/.test(id)) return DB.invoices.some((i) => i.nr === id) && can('abrechnung') ? '#/abrechnung' : null;
  if (/^RK-/.test(id)) return DB.claims.some((c) => c.nr === id) && can('reklamation') ? `#/reklamation/${id}` : null;
  if (/^AN-/.test(id)) return DB.quotes.some((c) => c.nr === id) && can('angebote') ? `#/angebote/${id}` : null;
  if (/^K-/.test(id)) { const c = DB.customers.find((x) => x.nr === id); return c && can('kunden') ? `#/kunden/${c.id}` : null; }
  return null;
}
const AI_HREF = /^#\/[a-z0-9\-/]+(\?[A-Za-z0-9\-_=&.%]*)?$/i;
function aiFmt(text) {
  const re = /\[\[([^\]|]{1,80})\|([^\]]{1,120})\]\]|\*\*([^*\n]{1,200})\*\*|\b(A-\d{4}-\d{4}|T-\d{4}-\d{4}|RK-\d{4}-\d{3}|AN-\d{4}-\d{4}|(?:R|G)-\d{4}-\d{4}|K-\d{4}|JWG-[A-Z0-9]{4,8})\b/g;
  const inline = (line) => {
    let last = 0, out = ''; let m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      out += esc(line.slice(last, m.index)); last = m.index + m[0].length;
      if (m[1] != null) out += AI_HREF.test(m[2]) ? `<a class="ai-link" href="${esc(m[2])}" data-act="ai.nav">${esc(m[1])}</a>` : esc(m[1]);
      else if (m[3] != null) out += `<b>${esc(m[3])}</b>`;
      else { const href = aiIdHref(m[4]); out += href ? `<a class="ai-link" href="${esc(href)}" data-act="ai.nav">${esc(m[4])}</a>` : esc(m[4]); }
    }
    return out + esc(line.slice(last));
  };
  const lines = String(text || '').split('\n'); let html_ = '', list = false;
  for (const l of lines) {
    if (/^\s*[-•]\s+/.test(l)) { if (!list) { html_ += '<ul>'; list = true; } html_ += `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`; }
    else { if (list) { html_ += '</ul>'; list = false; } if (l.trim()) html_ += `<p>${inline(l)}</p>`; }
  }
  return html_ + (list ? '</ul>' : '');
}

/* ---------- Chat-Zustand und Seitenleiste ---------- */
const AI = { open: false, msgs: [], busy: false, avail: null, availAt: 0, pending: null, wide: false };
const AI_KEY = 'jwg-logistik-ai';
function aiLoad() { try { const s = JSON.parse(sessionStorage.getItem(AI_KEY) || 'null'); if (s) { AI.msgs = (s.msgs || []).slice(-30); AI.open = !!s.open; } } catch (e) { /* ohne Speicher */ } }
function aiSave() { try { sessionStorage.setItem(AI_KEY, JSON.stringify({ msgs: AI.msgs.slice(-30), open: AI.open })); } catch (e) { /* ohne Speicher */ } }
const aiMode = () => (AI.avail === true && SESS.aiConsent === 'yes' ? 'ai' : 'local');
function aiSuggestions(page) {
  const by = { dashboard: ['Was ist heute los?', 'Welche Sendungen sind verspätet?', 'Welche Rechnungen sind überfällig?', 'Welche Fahrer sind morgen frei?'], auftraege: ['Wie viele Aufträge sind offen?', 'Wie lege ich einen Auftrag an?', 'Was kostet ein Palettenversand von Frankfurt nach Hamburg mit 300 kg?'], dispo: ['Welche Fahrer sind morgen frei?', 'Welche Fahrzeuge sind gesperrt?', 'Wie weise ich einen Auftrag einer Tour zu?', 'Welche Touren gibt es heute?'], abrechnung: ['Welche Rechnungen sind überfällig?', 'Wie erstelle ich eine Rechnung?', 'Wie hoch ist die Marge?'], fahrer: ['Welche Fahrer sind heute abwesend?', 'Welche Nachweise laufen ab?', 'Wie trage ich eine Abwesenheit ein?'], fuhrpark: ['Welche Fahrzeuge sind gesperrt?', 'Wann ist die nächste Hauptuntersuchung fällig?'], lager: ['Welche Artikel sind unter Mindestbestand?', 'Wie viele Hoodies haben wir?'], reklamation: ['Welche Reklamationen sind offen?', 'Wie bearbeite ich eine Reklamation?'], tracking: ['Welche Sendungen sind verspätet?', 'Wie schicke ich dem Kunden den Tracking-Link?'] };
  const e = aiPageEntity(page);
  if (e && e.kind === 'order') return ['Wo ist diese Sendung?', 'Wann kommt diese Sendung an?', 'Was kostet dieser Auftrag?', 'Wie storniere ich diesen Auftrag?'];
  if (e && e.kind === 'customer') return ['Wie hoch ist der Umsatz dieses Kunden?', 'Welche Konditionen hat dieser Kunde?'];
  if (e && e.kind === 'driver') return ['Ist dieser Fahrer morgen frei?', 'Laufen bei diesem Fahrer Nachweise ab?'];
  if (e && e.kind === 'vehicle') return ['Wann ist die nächste Hauptuntersuchung dieses Fahrzeugs?', 'Gibt es bei diesem Fahrzeug offene Defekte?'];
  return by[page.name] || by.dashboard;
}
function aiBuild() {
  if ($('#ai-root')) return;
  const root = document.createElement('div'); root.id = 'ai-root';
  root.innerHTML = String(html`<button type="button" class="ai-fab" id="ai-fab" data-act="ai.toggle" aria-expanded="false" aria-controls="ai-panel">${ic('spark')}<span>Assistent</span></button>
    <aside class="ai-panel" id="ai-panel" role="complementary" aria-label="KI-Assistent" hidden>
      <header><div class="ai-title">${ic('spark')}<div><b>JWG-Assistent</b><span id="ai-mode" class="chip tone-gray">Lokalmodus</span></div></div>
        <div class="row gap-s" style="flex-wrap:nowrap"><button type="button" class="icon-btn" data-act="ai.info" aria-label="Datenschutz und Funktionsweise" title="Datenschutz und Funktionsweise">${ic('shield')}</button><button type="button" class="icon-btn" data-act="ai.clear" aria-label="Verlauf löschen" title="Verlauf löschen">${ic('trash')}</button><button type="button" class="icon-btn" data-act="ai.toggle" aria-label="Assistent schließen">${ic('x')}</button></div></header>
      <div class="ai-log" id="ai-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div>
      <div class="ai-sugg" id="ai-sugg" aria-label="Vorschläge"></div>
      <form class="ai-form" data-submit="ai.send" autocomplete="off"><label class="sr" for="ai-in">Frage an den Assistenten</label><textarea id="ai-in" name="text" rows="1" maxlength="600" placeholder="Frag mich etwas …" required></textarea><button class="btn primary" aria-label="Senden">${ic('arrow')}</button></form>
      <p class="ai-note" id="ai-note"></p></aside>`);
  document.body.appendChild(root);
  const inp = $('#ai-in');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inp.form.requestSubmit(); } });
  inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px'; });
}
function aiRender() {
  const log = $('#ai-log'); if (!log) return;
  const page = aiPageCtx();
  const intro = html`<div class="ai-msg bot"><div class="ai-b">${raw(aiFmt(`Hallo ${curUser().name.split(' ')[0]}! Ich beantworte Fragen zu den Daten der App und erkläre die Bedienung. Ich lese nur und ändere nichts. Du siehst mit der Rolle **${aiRole()}** genau das, was auch ich sehe.`))}</div></div>`;
  log.innerHTML = String(html`${intro}${AI.msgs.map((m, i) => (m.role === 'user' ? html`<div class="ai-msg me"><div class="ai-b">${m.text}</div></div>` : m.role === 'consent' ? html`<div class="ai-msg bot"><div class="ai-b">${raw(aiFmt(m.text))}<div class="row mt-s"><button type="button" class="btn sm primary" data-act="ai.consent" data-v="yes">Mit KI antworten</button><button type="button" class="btn sm" data-act="ai.consent" data-v="no">Nur lokal</button></div></div></div>` : html`<div class="ai-msg bot ${m.role === 'sys' ? 'sys' : ''}"><div class="ai-b">${raw(aiFmt(m.text))}${m.via ? html`<span class="ai-via">${m.via === 'ai' ? 'KI' : 'lokal'}</span>` : ''}</div></div>`))}${AI.busy ? html`<div class="ai-msg bot"><div class="ai-b typing" aria-label="Der Assistent schreibt"><i></i><i></i><i></i></div></div>` : ''}`);
  log.scrollTop = log.scrollHeight;
  const mode = aiMode(); const badge = $('#ai-mode');
  badge.className = 'chip tone-' + (mode === 'ai' ? 'violet' : 'gray'); badge.textContent = mode === 'ai' ? 'KI (Claude)' : AI.avail === null ? 'prüfe …' : 'Lokalmodus';
  badge.title = mode === 'ai' ? 'Claude antwortet anhand eines Datenauszugs' : 'Antworten aus festen Regeln, ohne KI-Server';
  $('#ai-sugg').innerHTML = AI.msgs.length > 2 ? '' : String(html`${aiSuggestions(page).slice(0, 4).map((s) => html`<button type="button" class="ai-chip" data-act="ai.sugg" data-q="${s}">${s}</button>`)}`);
  $('#ai-note').textContent = mode === 'ai' ? 'KI-Antworten können Fehler enthalten. Wichtige Zahlen bitte in der App prüfen.' : 'Antworten im Lokalmodus stammen aus festen Regeln und den Daten dieser App.';
  $('#ai-fab').setAttribute('aria-expanded', String(AI.open));
  $('#ai-panel').hidden = !AI.open; document.body.classList.toggle('ai-open', AI.open);
}
async function aiProbe(force) {
  if (!force && AI.avail !== null && NOW() - AI.availAt < 5 * 60000) return AI.avail;
  AI.availAt = NOW();
  if (typeof location === 'undefined' || location.protocol === 'file:') { AI.avail = false; return false; }
  try { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000); const r = await fetch(AI_API, { method: 'GET', signal: ctl.signal, headers: { Accept: 'application/json' } }); clearTimeout(t); const j = r.ok ? await r.json() : null; AI.avail = !!(j && j.available === true); } catch (e) { AI.avail = false; }
  return AI.avail;
}
async function aiAsk(text, page) {
  const hist = AI.msgs.filter((m) => m.role === 'user' || (m.role === 'bot' && m.text)).slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: aiShort(m.text, 1400) }));
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(AI_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ messages: hist, snapshot: aiSnapshot(page), page: { name: page.name, id: page.id, label: page.label } }) });
    const j = await r.json().catch(() => null);
    if (r.status === 429 && j && j.reply) return { text: j.reply, via: 'ai' };
    if (!r.ok || !j || !j.reply) { const e = new Error('server'); e.status = r.status; throw e; }
    return { text: j.reply, via: 'ai' };
  } finally { clearTimeout(timer); }
}
async function aiSend(text) {
  text = String(text || '').trim().slice(0, 600); if (!text || AI.busy) return;
  const page = aiPageCtx(); AI.msgs.push({ role: 'user', text }); AI.busy = true; aiRender();
  let ans;
  try {
    if (SESS.aiConsent !== 'no') await aiProbe();
    if (AI.avail === true && SESS.aiConsent === undefined) { AI.msgs.push({ role: 'consent', text: 'Für freie Fragen kann **Claude** antworten. Dafür sendet der Assistent einen **Datenauszug** an den Server: nur, was deine Rolle sehen darf, ohne Straßen, Telefonnummern, E-Mail-Adressen und Unterschriften, Privatpersonen nur mit Initialen. Soll ich die KI nutzen?' }); AI.pending = text; AI.busy = false; aiSave(); aiRender(); return; }
    if (aiMode() === 'ai') {
      try { ans = await aiAsk(text, page); } catch (e) { AI.avail = false; AI.availAt = NOW(); ans = { text: aiLocal(text, page), via: 'local', note: 'Der KI-Server hat nicht geantwortet. Ich antworte im Lokalmodus aus den Daten der App.' }; }
    } else ans = { text: aiLocal(text, page), via: 'local' };
  } catch (e) { ans = { text: 'Das hat nicht geklappt. Bitte versuch es noch einmal.', via: 'local' }; }
  if (ans.note) AI.msgs.push({ role: 'sys', text: ans.note });
  AI.msgs.push({ role: 'bot', text: ans.text, via: ans.via }); AI.busy = false; aiSave(); aiRender();
}
act('ai.toggle', null, () => { AI.open = !AI.open; aiSave(); aiRender(); if (AI.open) { aiProbe().then(aiRender); setTimeout(() => { const i = $('#ai-in'); if (i) i.focus({ preventScroll: true }); }, 60); } else { const f = $('#ai-fab'); if (f) f.focus({ preventScroll: true }); } });
act('ai.clear', null, () => { AI.msgs = []; AI.pending = null; aiSave(); aiRender(); });
act('ai.sugg', null, (d) => aiSend(d.q));
act('ai.nav', null, () => { if (window.innerWidth < 1100) { AI.open = false; aiSave(); aiRender(); } });
act('ai.consent', null, (d) => { SESS.aiConsent = d.v; saveSess(); AI.msgs = AI.msgs.filter((m) => m.role !== 'consent'); const p = AI.pending; AI.pending = null; aiSave(); aiRender(); if (p) { AI.msgs = AI.msgs.filter((m, i, a) => !(m.role === 'user' && m.text === p && i === a.length - 1)); aiSend(p); } });
act('ai.info', null, () => openModal({ title: 'So arbeitet der Assistent', cls: 'small', body: html`<div class="stack"><p>Der Assistent <b>liest nur</b>. Er legt nichts an und ändert nichts.</p><p><b>Lokalmodus:</b> Feste Regeln beantworten die häufigsten Fragen aus den Daten dieser App. Es verlässt nichts den Browser.</p><p><b>KI-Modus:</b> Wenn der Server eingerichtet ist und du zustimmst, antwortet Claude. Dafür geht ein Datenauszug an den Server, passend zu Rolle und Standortfilter. Ohne Straßen, Telefonnummern, E-Mail-Adressen und Unterschriften; Privatpersonen nur mit Initialen.</p><p>Deine Zustimmung: <b>${SESS.aiConsent === 'yes' ? 'KI erlaubt' : SESS.aiConsent === 'no' ? 'nur lokal' : 'noch nicht gefragt'}</b>.</p></div>`, foot: html`${SESS.aiConsent ? html`<button type="button" class="btn" data-act="ai.reset-consent">Zustimmung zurücksetzen</button>` : ''}<button type="button" class="btn primary" data-act="modal.close" autofocus>Schließen</button>` }));
act('ai.reset-consent', null, () => { delete SESS.aiConsent; saveSess(); closeModal(); aiRender(); toast('Zustimmung zurückgesetzt. Beim nächsten Mal fragt der Assistent erneut.', 'ok'); });
onSubmit('ai.send', null, (f, form) => { const v = f.text; form.reset(); const i = $('#ai-in'); if (i) i.style.height = 'auto'; aiSend(v); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && AI.open && !modals.length && document.activeElement && document.activeElement.closest && document.activeElement.closest('#ai-panel')) { AI.open = false; aiSave(); aiRender(); const f = $('#ai-fab'); if (f) f.focus(); } });
function aiInit() { aiLoad(); aiBuild(); aiRender(); if (AI.open) aiProbe().then(aiRender); }
function aiOnRoute() { if ($('#ai-root')) aiRender(); }
