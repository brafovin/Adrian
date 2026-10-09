'use strict';
/* JWG.logistik – Dashboard und Auftragsmanagement */

const scoped = (list, key = 'branch') => list.filter((x) => inScope(x[key]));
const custName = (id) => (cust(id) || { name: '–' }).name;
const route = (o) => html`${o.pickup.city} <span class="muted">→</span> ${o.delivery.city}`;
const winTxt = (a) => `${fDay(a.date)} ${a.from}–${a.to}`;

/* ---------- Dashboard ---------- */
view('dashboard', {
  mod: 'dashboard', title: 'Dashboard', live: true,
  render() {
    const T = today();
    const os = scoped(DB.orders);
    const cnt = (ids) => os.filter((o) => ids.includes(o.status)).length;
    const probs = problems().filter((p) => inScope(p.order.branch));
    const lateOrders = probs.filter((p) => ['Verspätet', 'Verspätung'].includes(p.kind));
    const done30 = os.filter((o) => isDone(o) && diffDays(T, o.delivery.date) <= 30 && diffDays(T, o.delivery.date) >= 0);
    const rev30 = sum(done30, (o) => o.price), cost30 = sum(done30, (o) => o.cost);
    const deliveredToday = os.filter((o) => isDone(o) && o.delivery.date === T).length;
    const tours = scoped(DB.tours).filter((t) => t.date === T);
    const vAvail = scoped(DB.vehicles).filter((v) => vehicleState(v).id !== 'gesperrt' && vehicleState(v).id !== 'werkstatt');
    const vUse = vAvail.filter((v) => vehicleState(v).id === 'einsatz').length;
    const days = Array.from({ length: 14 }, (_, i) => addDays(T, i - 13));
    const revByDay = days.map((d) => sum(os.filter((o) => isDone(o) && o.delivery.date === d), (o) => o.price));
    const cntByDay = days.map((d) => os.filter((o) => o.status !== 'storniert' && o.pickup.date === d).length);
    const statusData = DB.settings.statuses.map((s, i) => ({ label: s.name, v: os.filter((o) => o.status === s.id).length, color: ['#9AA3C7', '#FFB020', '#4F6BFF', '#9B83FF', '#FF7DBB', '#27D3A2', '#1BA59A', '#FF5A47'][i] })).filter((x) => x.v);
    const upcoming = [];
    os.filter((o) => ACTIVE.includes(o.status)).forEach((o) => {
      if (['offen', 'geplant'].includes(o.status) && diffDays(o.pickup.date, T) >= 0 && diffDays(o.pickup.date, T) <= 1) upcoming.push({ o, kind: 'Abholung', a: o.pickup });
      if (diffDays(o.delivery.date, T) >= 0 && diffDays(o.delivery.date, T) <= 1) upcoming.push({ o, kind: 'Zustellung', a: o.delivery });
    });
    upcoming.sort((a, b) => (a.a.date + a.a.from).localeCompare(b.a.date + b.a.from));
    const unbilled = os.filter((o) => o.status === 'zugestellt' && !o.invoiceId);
    const byCust = {}; done30.forEach((o) => { byCust[o.customerId] = (byCust[o.customerId] || 0) + o.price; });
    const topCust = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ label: custName(id).replace(/ (GmbH|e\. V\.|KG|UG)$/, ''), v, text: eur(v) }));
    const livePos = tours.filter((t) => t.status === 'unterwegs').map((t, idx) => ({ tour: t, idx, sch: scheduleTour(t), pos: tourPosition(t).pos }));
    const tasks = DB.tasks.slice().sort((a, b) => a.done - b.done || a.due.localeCompare(b.due));
    return html`
      ${pageHead('Dashboard', `Stand ${fDate(T)}, ${hhmm(NOW())} Uhr${SESS.branch === 'all' ? '' : ' · Standort ' + branchName(SESS.branch)}`, html`${canWrite('auftraege') ? html`<a class="btn primary" href="#/auftraege/neu">${ic('plus')} Neuer Auftrag</a>` : ''}<a class="btn" href="#/dispo">${ic('route')} Zur Disposition</a>`)}
      <div class="kpis">
        <a class="kpi" href="#/auftraege?grp=offen" style="--k:var(--sun)"><small>Offene Aufträge</small><b>${cnt(['entwurf', 'offen'])}</b><span>noch nicht disponiert</span></a>
        <a class="kpi" href="#/auftraege?grp=geplant" style="--k:var(--cobalt)"><small>Geplant</small><b>${cnt(['geplant'])}</b><span>Tour oder Frachtführer zugewiesen</span></a>
        <a class="kpi" href="#/auftraege?grp=laufend" style="--k:var(--lilac)"><small>Unterwegs</small><b>${cnt(['abgeholt', 'in_zustellung'])}</b><span>${tours.filter((t) => t.status === 'unterwegs').length} Touren aktiv</span></a>
        <a class="kpi" href="#/auftraege?grp=fertig" style="--k:var(--mint)"><small>Heute zugestellt</small><b>${deliveredToday}</b><span>${cnt(['zugestellt', 'abgeschlossen'])} insgesamt abgeschlossen</span></a>
        <a class="kpi" href="#/auftraege?grp=problem" style="--k:var(--coral)"><small>Verspätet / Probleme</small><b>${probs.filter((p) => p.kind !== 'Reklamation').length}</b><span>${DB.claims.filter((c) => !['geloest', 'abgelehnt'].includes(c.status)).length} offene Reklamationen</span></a>
        <a class="kpi" href="#/reporting" style="--k:var(--pink)"><small>Umsatz, 30 Tage</small><b>${eur(rev30)}</b><span>Marge ${rev30 ? nf(((rev30 - cost30) / rev30) * 100) : 0} % · netto</span></a>
        <a class="kpi" href="#/fuhrpark" style="--k:var(--navy)"><small>Fuhrpark-Auslastung</small><b>${vAvail.length ? nf((vUse / vAvail.length) * 100) : 0} %</b><span>${vUse} von ${vAvail.length} einsatzbereiten Fahrzeugen</span></a>
      </div>
      <div class="grid g21 mb">
        <section class="card" aria-labelledby="h-trend"><div class="card-h"><h2 id="h-trend">Aufträge und Umsatz, letzte 14 Tage</h2><span class="muted tiny">Umsatz = zugestellte Aufträge, netto</span></div>
          ${lineChart([{ name: 'Umsatz (€)', data: revByDay, color: '#4F6BFF' }], days.map((d) => fDate(d).slice(0, 5)), { area: true, fmt: (v) => nf(v), label: 'Umsatz der letzten 14 Tage' })}
          <div class="mt-s"><b class="tiny muted">Abholungen pro Tag</b>${barChart(days.map((d, i) => ({ label: fDate(d).slice(0, 2), v: cntByDay[i], color: d === T ? '#FFB020' : '#27D3A2' })), { h: 120, label: 'Abholungen pro Tag' })}</div></section>
        <section class="card" aria-labelledby="h-st"><div class="card-h"><h2 id="h-st">Aufträge nach Status</h2></div>${donut(statusData, { center: os.length, centerLabel: 'Aufträge', label: 'Aufträge nach Status' })}</section>
      </div>
      <div class="grid g2 mb">
        <section class="card" aria-labelledby="h-prob"><div class="card-h"><h2 id="h-prob">Verspätungen und Problemfälle</h2><a href="#/auftraege?grp=problem">Alle ansehen</a></div>
          ${probs.length ? html`<ul class="list">${probs.slice(0, 6).map((p) => html`<li>${chip(p.kind, p.tone)}<div class="grow"><a href="#/auftraege/${p.order.id}">${p.order.nr}</a> <span class="muted">· ${custName(p.order.customerId)}</span><div class="tiny muted">${p.text}</div></div></li>`)}</ul>` : empty('Keine Verspätungen', 'Alle Sendungen laufen nach Plan.')}</section>
        <section class="card" aria-labelledby="h-up"><div class="card-h"><h2 id="h-up">Anstehende Abholungen und Zustellungen</h2><span class="muted tiny">heute und morgen</span></div>
          ${upcoming.length ? html`<ul class="list">${upcoming.slice(0, 7).map((u) => html`<li>${chip(u.kind, u.kind === 'Abholung' ? 'amber' : 'green')}<div class="grow"><a href="#/auftraege/${u.o.id}">${u.o.nr}</a> <span class="muted">· ${u.a.city}</span><div class="tiny muted">${winTxt(u.a)} · ${u.a.name}</div></div>${statusChip(u.o.status)}</li>`)}</ul>` : empty('Nichts geplant', 'In den nächsten zwei Tagen stehen keine Termine an.')}</section>
      </div>
      <div class="grid g3 mb">
        <section class="card" aria-labelledby="h-dr"><div class="card-h"><h2 id="h-dr">Fahrer</h2><a href="#/fahrer">Alle</a></div>
          <ul class="list">${scoped(DB.drivers).slice(0, 7).map((d) => { const s = driverState(d); return html`<li>${avatar(d.name)}<div class="grow"><a href="#/fahrer/${d.id}">${d.name}</a><div class="tiny muted">${(veh(d.vehicleId) || {}).plate || 'kein Fahrzeug'}</div></div>${chip(s.label, s.tone)}</li>`; })}</ul></section>
        <section class="card" aria-labelledby="h-ve"><div class="card-h"><h2 id="h-ve">Fahrzeuge</h2><a href="#/fuhrpark">Alle</a></div>
          <ul class="list">${scoped(DB.vehicles).slice(0, 7).map((v) => { const s = vehicleState(v); return html`<li><span class="avatar tone-gray">${ic('truck')}</span><div class="grow"><a href="#/fuhrpark/${v.id}">${v.plate}</a><div class="tiny muted">${vtype(v.type).name}</div></div>${chip(s.label, s.tone)}</li>`; })}</ul></section>
        <section class="card" aria-labelledby="h-map"><div class="card-h"><h2 id="h-map">Flotte live</h2><a href="#/dispo">Disposition</a></div>
          ${livePos.length ? mapSVG({ tours: livePos, fit: true, ratio: 1.2, label: 'Fahrzeuge unterwegs' }) : mapSVG({ vehicles: [], label: 'Karte' })}
          <p class="tiny muted mt-s">Schematische Karte. Positionen werden aus dem Tourverlauf berechnet (Simulation).</p></section>
      </div>
      <div class="grid g2">
        <section class="card" aria-labelledby="h-tk"><div class="card-h"><h2 id="h-tk">Offene Aufgaben</h2><span class="muted tiny">${tasks.filter((t) => !t.done).length} offen</span></div>
          <ul class="list">${unbilled.length ? html`<li>${chip('Abrechnung', 'blue')}<div class="grow"><a href="#/abrechnung">${unbilled.length} zugestellte Aufträge sind noch nicht abgerechnet</a><div class="tiny muted">${eur(sum(unbilled, (o) => o.price))} netto</div></div></li>` : ''}
          ${tasks.map((t) => html`<li><label class="chk"><input type="checkbox" data-act="task.toggle" data-id="${t.id}" ${t.done ? raw('checked') : ''}><span style="${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${t.link ? html`<a href="${t.link}">${t.text}</a>` : t.text}</span></label><span class="tiny muted" style="margin-left:auto;white-space:nowrap">${diffDays(t.due, T) < 0 && !t.done ? chip('überfällig', 'red') : fDate(t.due)}</span></li>`)}</ul>
          <form data-submit="task.add" class="row mt-s"><input name="text" placeholder="Neue Aufgabe …" required aria-label="Neue Aufgabe" style="flex:1"><button class="btn primary">${ic('plus')} Hinzufügen</button></form></section>
        <section class="card" aria-labelledby="h-rev"><div class="card-h"><h2 id="h-rev">Umsatz nach Kunde, 30 Tage</h2><a href="#/reporting">Reporting</a></div>
          ${topCust.length ? hbars(topCust) : empty('Noch kein Umsatz')}</section>
      </div>`;
  },
});
onSubmit('task.add', null, (d) => { DB.tasks.unshift({ id: uid('tk'), text: d.text.trim(), done: false, link: '', due: addDays(today(), 3) }); commit(); });
act('task.toggle', null, (d) => { const t = DB.tasks.find((x) => x.id === d.id); if (t) { t.done = !t.done; commit(); } });

/* ---------- Aufträge: Liste ---------- */
const GRP_LABEL = { '': 'Alle', offen: 'Offen', geplant: 'Geplant', laufend: 'Laufend', fertig: 'Abgeschlossen', storniert: 'Storniert', problem: 'Probleme' };
function orderFilter(rows) {
  const g = fv('o.grp'), q = fv('o.q').trim().toLowerCase();
  const probIds = new Set(problems().filter((p) => p.kind !== 'Reklamation').map((p) => p.order.id));
  return rows.filter((o) => {
    if (g === 'problem' ? !probIds.has(o.id) : g === 'storniert' ? o.status !== 'storniert' : g && !GROUPS[g].includes(o.status)) return false;
    if (fv('o.status') && o.status !== fv('o.status')) return false;
    if (fv('o.prio') && o.prio !== fv('o.prio')) return false;
    if (fv('o.cust') && o.customerId !== fv('o.cust')) return false;
    if (fv('o.type') && o.type !== fv('o.type')) return false;
    if (fv('o.from') && o.pickup.date < fv('o.from')) return false;
    if (fv('o.to') && o.pickup.date > fv('o.to')) return false;
    if (q) { const hay = [o.nr, o.tracking, o.ref, o.shopNo, custName(o.customerId), o.pickup.city, o.delivery.city, o.delivery.name, o.pickup.name, o.goods.desc].join(' ').toLowerCase(); if (!q.split(/\s+/).every((w) => hay.includes(w))) return false; }
    return true;
  });
}
function applyQuery(r) {
  if (UI._applied !== r.raw) { UI._applied = r.raw; if (r.q.has('grp')) { UI.f['o.grp'] = r.q.get('grp'); UI.lim = {}; } }
}
view('auftraege', {
  mod: 'auftraege', title: 'Aufträge', live: true,
  render(seg, q, r) {
    if (seg[0] === 'neu') return orderForm(null, q);
    if (seg[0] && seg[1] === 'edit') return orderForm(ord(seg[0]), q);
    if (seg[0]) return orderDetail(seg[0]);
    applyQuery(r);
    const all = scoped(DB.orders);
    const rows = orderFilter(all);
    const cols = [
      { k: 'nr', t: 'Auftrag', cls: 'nw', f: (o) => html`<a href="#/auftraege/${o.id}">${o.nr}</a>${o.source === 'shop' ? html` <span class="chip tone-pink" title="aus JWG.onlineshop">Shop</span>` : ''}`, s: (o) => o.nr },
      { k: 'cust', t: 'Kunde', f: (o) => custName(o.customerId), s: (o) => custName(o.customerId) },
      { k: 'route', t: 'Strecke', f: (o) => route(o), s: (o) => o.pickup.city + o.delivery.city, x: (o) => `${o.pickup.city} -> ${o.delivery.city}` },
      { k: 'pick', t: 'Abholung', cls: 'nw', f: (o) => winTxt(o.pickup), s: (o) => o.pickup.date + o.pickup.from },
      { k: 'del', t: 'Zustellung', cls: 'nw', f: (o) => winTxt(o.delivery), s: (o) => o.delivery.date + o.delivery.from },
      { k: 'kg', t: 'Ware', cls: 'num nw', f: (o) => `${nf(o.goods.weight, o.goods.weight < 10 ? 1 : 0)} kg`, s: (o) => o.goods.weight },
      { k: 'type', t: 'Art', f: (o) => ttype(o.type).name.split(' (')[0], s: (o) => o.type },
      { k: 'prio', t: 'Priorität', cls: 'nw', f: (o) => prioChip(o.prio), s: (o) => ['normal', 'hoch', 'express'].indexOf(o.prio), x: (o) => prioOf(o.prio).name },
      { k: 'status', t: 'Status', cls: 'nw', f: (o) => html`${statusChip(o.status)}${isLate(o) ? html` ${chip('verspätet', 'red')}` : ''}`, s: (o) => o.status, x: (o) => stat(o.status).name },
      { k: 'price', t: 'Preis netto', cls: 'num nw', f: (o) => eur(o.price), s: (o) => o.price },
    ];
    return html`
      ${pageHead('Aufträge', 'Transportaufträge anlegen, suchen und verfolgen.', html`${canWrite('auftraege') ? html`<a class="btn primary" href="#/auftraege/neu">${ic('plus')} Neuer Auftrag</a>` : ''}`)}
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Statusgruppe">${Object.entries(GRP_LABEL).map(([k, l]) => html`<button type="button" aria-pressed="${fv('o.grp') === k}" data-act="o.grp" data-k="${k}">${l}</button>`)}</div>
      </div>
      <div class="toolbar">
        ${bindInp('Suche', 'o.q', 'Nummer, Kunde, Ort, Sendung …', { cls: 'search' })}
        ${bindSel('Status', 'o.status', [['', 'Alle Status'], ...DB.settings.statuses.map((s) => [s.id, s.name])])}
        ${bindSel('Priorität', 'o.prio', [['', 'Alle'], ...DB.settings.priorities.map((s) => [s.id, s.name])])}
        ${bindSel('Kunde', 'o.cust', [['', 'Alle Kunden'], ...DB.customers.filter((c) => !c.archived).map((c) => [c.id, c.name])])}
        ${bindSel('Transportart', 'o.type', [['', 'Alle'], ...DB.settings.transportTypes.map((t) => [t.id, t.name])])}
        ${bindInp('Abholung ab', 'o.from', '', { type: 'date' })}${bindInp('bis', 'o.to', '', { type: 'date' })}
        <button type="button" class="btn ghost" data-act="o.reset">${ic('refresh')} Zurücksetzen</button>
      </div>
      ${table('orders', cols, rows, { sort: { k: 'nr', dir: -1 }, name: 'auftraege', noun: 'Aufträgen', empty: 'Keine Aufträge gefunden' })}`;
  },
});
act('o.grp', null, (d) => { UI.f['o.grp'] = d.k; UI.lim = {}; render(); });
act('o.reset', null, () => { Object.keys(UI.f).filter((k) => k.startsWith('o.')).forEach((k) => delete UI.f[k]); render(); });

/* ---------- Aufträge: Detail ---------- */
const STEPS = [['offen', 'Angelegt'], ['geplant', 'Disponiert'], ['abgeholt', 'Abgeholt'], ['in_zustellung', 'In Zustellung'], ['zugestellt', 'Zugestellt']];
function stepper(o) {
  const order = ['entwurf', 'offen', 'geplant', 'abgeholt', 'in_zustellung', 'zugestellt', 'abgeschlossen'];
  const idx = order.indexOf(o.status === 'abgeschlossen' ? 'zugestellt' : o.status);
  if (o.status === 'storniert') return html`<div class="notice tone-red">${ic('x')}<div>Dieser Auftrag wurde storniert${o.cancelReason ? ': ' + o.cancelReason : ''}.</div></div>`;
  return html`<ol class="steps" aria-label="Fortschritt">${STEPS.map(([id, l]) => { const i = order.indexOf(id); return html`<li class="${i <= idx ? 'on' : ''} ${i === idx ? 'now' : ''}">${l}</li>`; })}</ol>`;
}
function addrBlock(a, title) {
  return html`<section class="card flat"><div class="card-h"><h2>${title}</h2><a class="tiny" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.street}, ${a.zip} ${a.city}`)}" target="_blank" rel="noopener">Karte öffnen ${ic('external')}</a></div>
    <dl>${kv('Name', a.name)}${kv('Adresse', html`${a.street}<br>${a.zip} ${a.city}`)}${kv('Ansprechpartner', a.contact ? html`${a.contact}${a.phone ? html`<br><a href="tel:${a.phone.replace(/\s/g, '')}">${a.phone}</a>` : ''}` : '–')}${kv('Termin', html`${fDay(a.date)}, ${a.from}–${a.to} Uhr`)}</dl></section>`;
}
function orderDetail(id) {
  const o = ord(id);
  if (!o) return html`${pageHead('Auftrag nicht gefunden')}${empty('Diesen Auftrag gibt es nicht', html`<a href="#/auftraege">Zurück zur Liste</a>`)}`;
  const tl = [['u', 'Übersicht'], ['v', 'Sendungsverlauf'], ['d', 'Dokumente'], ['m', 'Nachrichten'], ['a', 'Abrechnung'], ['h', 'Änderungen']];
  const cur = UI.tab['od-' + id] || 'u';
  const c = cust(o.customerId) || {};
  const eta = orderEta(o);
  const t = o.tourId && tour(o.tourId);
  const pr = calcPrice(o);
  const editable = !['zugestellt', 'abgeschlossen', 'storniert'].includes(o.status);
  const km = o.km || pr.km;
  const body = {
    u: html`<div class="grid g2">${addrBlock(o.pickup, 'Abholung')}${addrBlock(o.delivery, 'Zustellung')}</div>
      <div class="grid g2 mt">
        <section class="card flat"><div class="card-h"><h2>Ware</h2></div><dl>${kv('Beschreibung', o.goods.desc)}${kv('Gewicht', `${nf(o.goods.weight, 1)} kg`)}${kv('Volumen', `${nf(o.goods.volume, 2)} m³`)}${kv('Packstücke', `${o.goods.pieces}${o.goods.pallets ? ` (davon ${o.goods.pallets} Paletten)` : ''}`)}${kv('Transportart', ttype(o.type).name)}${kv('Zusatzleistungen', o.extras.length ? o.extras.map(extraName).join(', ') : 'keine')}${kv('Referenz', o.ref || '–')}${kv('Bemerkung', o.note || '–')}</dl></section>
        <section class="card flat"><div class="card-h"><h2>Disposition</h2>${canWrite('dispo') && editable ? html`<a class="btn sm" href="#/dispo?date=${o.pickup.date}">${ic('route')} Disponieren</a>` : ''}</div><dl>
          ${kv('Zuordnung', t ? html`<a href="#/dispo?date=${t.date}&tour=${t.id}">Tour ${t.id}</a> · ${(drv(t.driverId) || {}).name || '–'} · ${(veh(t.vehicleId) || {}).plate || '–'}` : o.carrier ? html`Frachtführer: <a href="#/partner/${o.carrier.partnerId}">${(par(o.carrier.partnerId) || {}).name}</a> (${chip(o.carrier.status, o.carrier.status === 'abgelehnt' ? 'red' : o.carrier.status === 'angefragt' ? 'amber' : 'green')}, ${eur(o.carrier.price)})` : 'noch nicht disponiert')}
          ${kv('Voraussichtliche Zustellung', eta ? html`${hhmm(eta.eta)} Uhr${eta.late ? html` ${chip(`+${eta.lateMin} Min. nach Fenster`, 'red')}` : html` ${chip('im Zeitfenster', 'green')}`}${eta.wait ? html`<div class="tiny muted">Fahrer wartet ca. ${eta.wait} Min. bis Fensterbeginn</div>` : ''}` : isDone(o) ? `zugestellt ${fDT(o.pod && o.pod.ts)}` : '–')}
          ${kv('Strecke', `${nf(km)} km (Straßenfaktor ${DB.settings.surcharges.roadFactor})`)}
          ${kv('CO₂ (Schätzung)', `${nf(co2Of(km, o.goods.weight, o.type), 1)} kg`)}
          ${kv('Sendungsnummer', html`<span class="mono">${o.tracking}</span> · <a href="#/tracking?nr=${o.tracking}">verfolgen</a>`)}
          ${kv('Standort teilen', html`<label class="switch"><input type="checkbox" data-act="o.loc" data-id="${o.id}" ${o.locShare ? raw('checked') : ''} ${canWrite('auftraege') ? '' : raw('disabled')}><i></i><span>${o.locShare ? 'Kunde sieht Live-Standort' : 'nur Status, kein Standort'}</span></label>`)}
        </dl></section></div>
      ${o.pod ? html`<section class="card flat mt"><div class="card-h"><h2>Liefernachweis</h2><button type="button" class="btn sm" data-act="doc.open" data-kind="pod" data-id="${o.id}">${ic('eye')} Ansehen</button></div><p>Empfangen von <b>${o.pod.name}</b> am ${fDT(o.pod.ts)}${o.pod.sig ? ' (digital unterschrieben)' : ''}.</p>${(o.pod.photos || []).length ? html`<div class="thumbs mt-s">${o.pod.photos.map((p) => html`<img src="${p}" alt="Foto bei Zustellung">`)}</div>` : ''}</section>` : ''}`,
    v: html`<ol class="tl">${o.history.slice().reverse().map((h, i) => html`<li class="${i === 0 ? 'now' : 'on'}"><time>${fDT(h.ts)} · ${h.by}</time><b>${h.text}</b>${h.status ? html` ${statusChip(h.status)}` : ''}</li>`)}</ol>`,
    d: orderDocs(o),
    m: orderMsgs(o),
    a: html`<div class="grid g2"><section class="card flat"><div class="card-h"><h2>Preisberechnung (netto)</h2></div><table class="tbl"><tbody>${pr.lines.map((l) => html`<tr><td class="nolabel" data-l="">${l.label}</td><td class="num nolabel" data-l="">${eur(l.amount)}</td></tr>`)}</tbody><tfoot><tr><td data-l="">Summe netto</td><td class="num" data-l="">${eur(pr.net)}</td></tr><tr><td data-l="">MwSt. ${DB.settings.vat} %</td><td class="num" data-l="">${eur(pr.vat)}</td></tr><tr><td data-l="">Brutto</td><td class="num" data-l="">${eur(pr.gross)}</td></tr></tfoot></table>
      ${Math.abs(pr.net - o.price) > 0.01 ? html`<p class="tiny muted mt-s">Gespeicherter Preis: ${eur(o.price)}. Die Berechnung folgt den aktuellen Tarifen.</p>` : ''}</section>
      <section class="card flat"><div class="card-h"><h2>Erlös und Kosten</h2></div><dl>${kv('Erlös netto', eur(o.price))}${kv('Kosten', eur(o.cost))}${kv('Deckungsbeitrag', html`<b class="${o.price - o.cost >= 0 ? 'up' : 'down'}">${eur(o.price - o.cost)}</b> (${o.price ? nf(((o.price - o.cost) / o.price) * 100) : 0} %)`)}${kv('Rechnung', o.invoiceId ? html`<a href="#/abrechnung">${o.invoiceId}</a>` : isDone(o) ? html`noch nicht abgerechnet ${canWrite('abrechnung') ? html`<button type="button" class="btn sm primary" data-act="inv.create.order" data-id="${o.id}">Rechnung erstellen</button>` : ''}` : 'nach Zustellung')}</dl></section></div>`,
    h: (() => { const au = DB.audit.filter((a) => a.ref === o.nr || a.ref === o.id); return au.length ? html`<ul class="list">${au.map((a) => html`<li><div class="grow"><b>${a.action}</b> · ${a.text}<div class="tiny muted">${a.user} · ${fDT(a.ts)}</div></div></li>`)}</ul>` : empty('Keine Änderungen protokolliert'); })(),
  }[cur];
  const mapTour = t ? [{ tour: t, idx: 0, sch: scheduleTour(t), pos: tourPosition(t).pos }] : [];
  const pts = [{ lat: o.pickup.lat, lon: o.pickup.lon, label: 'Abholung ' + o.pickup.city, color: '#FFB020', mark: 'A' }, { lat: o.delivery.lat, lon: o.delivery.lon, label: 'Zustellung ' + o.delivery.city, color: '#27D3A2', mark: 'Z' }];
  const lines = [[{ lat: o.pickup.lat, lon: o.pickup.lon }, { lat: o.delivery.lat, lon: o.delivery.lon }, '#6B7699']];
  return html`
    ${pageHead(html`${o.nr} ${statusChip(o.status)}`, `${custName(o.customerId)} · ${o.pickup.city} → ${o.delivery.city}`, html`
      ${editable && canWrite('auftraege') ? html`<a class="btn" href="#/auftraege/${o.id}/edit">${ic('edit')} Bearbeiten</a>` : ''}
      ${canWrite('auftraege') ? html`<a class="btn" href="#/auftraege/neu?copy=${o.id}">${ic('copy')} Kopieren</a>` : ''}
      <button type="button" class="btn" data-act="doc.open" data-kind="confirm" data-id="${o.id}">${ic('file')} Auftragsbestätigung</button>
      ${canWrite('auftraege') && o.status !== 'storniert' ? html`<button type="button" class="btn" data-act="o.status" data-id="${o.id}">${ic('flag')} Status ändern</button>` : ''}
      ${canWrite('auftraege') && ['entwurf', 'offen', 'geplant'].includes(o.status) ? html`<button type="button" class="btn danger" data-act="o.cancel" data-id="${o.id}">${ic('x')} Stornieren</button>` : ''}`, html`<a href="#/auftraege">Aufträge</a> › ${o.nr}`)}
    ${o.flags && o.flags.problem ? html`<div class="mb">${notice('red', html`<b>Problemfall:</b> ${o.flags.problemText} ${canWrite('auftraege') ? html`<button type="button" class="btn sm" data-act="o.problem.clear" data-id="${o.id}">Als gelöst markieren</button>` : ''}`)}</div>` : ''}
    ${o.flags && o.flags.delay ? html`<div class="mb">${notice('amber', html`<b>Verspätung gemeldet:</b> ca. ${o.flags.delay.min} Min. (${o.flags.delay.reason}), ${fDT(o.flags.delay.ts)}`)}</div>` : ''}
    <div class="card mb">${stepper(o)}</div>
    <div class="grid g21">
      <div>${tabs('od-' + id, tl, 'u')}${body}</div>
      <aside class="stack">
        <section class="card"><div class="card-h"><h2>Karte</h2></div>${mapSVG({ tours: mapTour, points: t ? [] : pts, lines: t ? [] : lines, fit: true, ratio: 1.2, label: 'Strecke des Auftrags' })}</section>
        <section class="card"><div class="card-h"><h2>Kunde</h2></div><div class="row">${avatar(c.name || '?')}<div><a href="#/kunden/${c.id}"><b>${c.name}</b></a><div class="tiny muted">${c.nr} · ${c.terms ? c.terms + ' Tage netto' : 'sofort'}</div></div></div>${c.contacts && c.contacts[0] ? html`<dl class="mt-s">${kv('Kontakt', c.contacts[0].name)}${kv('E-Mail', html`<a href="mailto:${c.contacts[0].email}">${c.contacts[0].email}</a>`)}${kv('Telefon', c.contacts[0].phone)}</dl>` : ''}</section>
        <section class="card"><div class="card-h"><h2>Preis</h2></div><div class="row" style="justify-content:space-between"><span class="muted">netto</span><b style="font-family:var(--font-display);font-size:1.8rem">${eur(o.price)}</b></div><div class="tiny muted">brutto ${eur(o.price * (1 + DB.settings.vat / 100))}</div></section>
      </aside>
    </div>`;
}
act('o.loc', 'auftraege', (d, el) => { const o = ord(d.id); o.locShare = el.checked; o.rev++; audit('Auftrag', o.nr, 'bearbeitet', `Standortfreigabe: ${o.locShare ? 'ja' : 'nein'}`); commit(); });
act('o.problem.clear', 'auftraege', (d) => { const o = ord(d.id); o.flags.problem = false; addHistory(o, o.status, 'Problemfall als gelöst markiert'); audit('Auftrag', o.nr, 'bearbeitet', 'Problemfall gelöst'); commit(); });

function orderDocs(o) {
  const gen = [['confirm', 'Auftragsbestätigung', true], ['delivnote', 'Lieferschein', o.status !== 'entwurf'], ['cmr', 'Frachtbrief', o.status !== 'entwurf'], ['pod', 'Liefernachweis (POD)', !!o.pod]];
  const up = DB.docs.filter((d) => d.orderId === o.id);
  return html`<div class="card flat"><div class="card-h"><h2>Dokumente zum Auftrag</h2>${canWrite('dokumente') ? html`<button type="button" class="btn sm" data-act="doc.upload" data-order="${o.id}">${ic('upload')} Hochladen</button>` : ''}</div>
    <ul class="list">${gen.filter((g) => g[2]).map(([k, l]) => html`<li>${ic('file')}<div class="grow"><b>${l}</b><div class="tiny muted">automatisch erzeugt</div></div><button type="button" class="btn sm" data-act="doc.open" data-kind="${k}" data-id="${o.id}">Ansehen</button></li>`)}
    ${up.map((d) => html`<li>${ic('folder')}<div class="grow"><b>${d.name}</b><div class="tiny muted">${d.type} · ${fDT(d.ts)} · ${d.by}</div></div>${d.data ? html`<a class="btn sm" href="${d.data}" download="${d.name}">Laden</a>` : ''}</li>`)}</ul></div>`;
}
function orderThread(o, create) {
  let th = DB.threads.find((t) => t.orderId === o.id);
  if (!th && create) { th = { id: uid('th'), kind: 'kunde', title: `Auftrag ${o.nr}`, refId: o.customerId, orderId: o.id, unread: 0, msgs: [] }; DB.threads.unshift(th); }
  return th;
}
function orderMsgs(o) {
  const th = orderThread(o);
  return html`<div class="card flat"><div class="card-h"><h2>Nachrichten zum Auftrag</h2>${th ? html`<a class="tiny" href="#/komm?t=${th.id}">Im Postfach öffnen</a>` : ''}</div>
    ${th && th.msgs.length ? html`<ul class="list">${th.msgs.map((m) => html`<li>${avatar(m.from)}<div class="grow"><b>${m.from}</b> <span class="tiny muted">${fDT(m.ts)}</span><div>${m.text}</div></div></li>`)}</ul>` : empty('Noch keine Nachrichten')}
    ${canWrite('komm') ? html`<form data-submit="o.msg" class="row mt-s" style="flex-wrap:nowrap"><input type="hidden" name="id" value="${o.id}"><input name="text" required placeholder="Nachricht an den Kunden …" aria-label="Nachricht" style="flex:1"><button class="btn primary">Senden</button></form>` : ''}</div>`;
}
onSubmit('o.msg', 'komm', (d) => { const o = ord(d.id); const th = orderThread(o, true); th.msgs.push({ id: uid('m'), from: curUser().name, text: d.text.trim(), ts: NOW(), kind: 'intern' }); audit('Auftrag', o.nr, 'Nachricht', 'Nachricht an Kunden'); commit(); });

/* Status ändern, stornieren */
const NEXT = { entwurf: ['offen', 'storniert'], offen: ['geplant', 'storniert'], geplant: ['offen', 'abgeholt', 'storniert'], abgeholt: ['in_zustellung', 'zugestellt'], in_zustellung: ['zugestellt'], zugestellt: ['abgeschlossen'], abgeschlossen: [], storniert: ['offen'] };
act('o.status', 'auftraege', (d) => {
  const o = ord(d.id);
  const opts = NEXT[o.status].map((s) => [s, stat(s).name]);
  if (!opts.length) return toast('Dieser Auftrag ist abgeschlossen. Weitere Statuswechsel sind nicht vorgesehen.', 'bad');
  openModal({ title: `Status ändern: ${o.nr}`, form: 'o.status', cls: 'small', body: html`<input type="hidden" name="id" value="${o.id}">${notice('blue', 'Üblicherweise ändert sich der Status automatisch durch Disposition und Fahrer-App. Manuelle Wechsel werden protokolliert.', 'alert')}<div class="stack mt">${fld('Neuer Status', 'status', opts[0][0], { type: 'select', options: opts })}${fld('Empfänger (nur bei „Zugestellt“)', 'rec', o.delivery.contact || '')}${fld('Notiz', 'note', '', { ph: 'Grund oder Hinweis' })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Status setzen</button>` });
});
onSubmit('o.status', 'auftraege', (d) => {
  const o = ord(d.id); closeModal();
  if (d.status === 'storniert') return cancelOrder(o, d.note || 'Manuell storniert');
  if (d.status === 'offen' && o.tourId) unassignOrder(o.id, true);
  setStatus(o, d.status, d.note ? `Manuell: ${stat(d.status).name} (${d.note})` : `Manuell auf „${stat(d.status).name}“ gesetzt`);
  if (d.status === 'zugestellt') { o.pod = { name: d.rec || 'Empfänger', ts: NOW(), sig: null, photos: [], by: curUser().name, manual: true }; }
  if (d.status === 'storniert') cancelOrder(o, d.note);
  commit(); toast(`Status: ${stat(d.status).name}`, 'ok');
});
function cancelOrder(o, reason) {
  if (o.tourId) unassignOrder(o.id, true);
  o.carrier = null; o.cancelReason = reason;
  setStatus(o, 'storniert', `Storniert: ${reason}`);
  queueMail('status', o, { status: 'Storniert' });
  commit(); toast(`${o.nr} wurde storniert.`, 'ok');
}
act('o.cancel', 'auftraege', (d) => {
  const o = ord(d.id);
  openModal({ title: `Auftrag ${o.nr} stornieren`, form: 'o.cancel', cls: 'small', body: html`<input type="hidden" name="id" value="${o.id}"><p class="mb">Der Auftrag wird aus Tour oder Frachtführer-Vergabe entfernt. Der Kunde erhält eine Statusmeldung.</p>${fld('Grund', 'reason', '', { req: true, ph: 'z. B. Kunde hat Auftrag zurückgezogen' })}`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Zurück</button><button class="btn danger">Stornieren</button>` });
});
onSubmit('o.cancel', 'auftraege', (d) => { closeModal(); cancelOrder(ord(d.id), d.reason.trim()); });

/* ---------- Auftragsformular ---------- */
const DRAFT_KEY = 'jwg-logistik-order-draft';
function addrOptions(custId) {
  const c = cust(custId) || { addresses: [] };
  return [
    ...BRANCHES.map((b) => ({ label: `Lager ${b.name}`, v: { name: `JWG Logistikzentrum ${b.name}`, street: b.street, zip: b.zip, city: b.city, contact: 'Lagerleitung', phone: b.phone } })),
    ...c.addresses.map((a) => ({ label: `${c.name}: ${a.label}`, v: { name: a.name, street: a.street, zip: a.zip, city: a.city, contact: (c.contacts[0] || {}).name || '', phone: (c.contacts[0] || {}).phone || '' } })),
  ];
}
function addrFieldset(p, title, a, custId, label) {
  const opts = addrOptions(custId);
  return html`<fieldset><legend>${title}</legend>
    <div class="fgrid">
      <label class="fld wide"><span>Adresse aus Stammdaten übernehmen</span><select data-addr="${p}"><option value="">– auswählen –</option>${opts.map((o, i) => html`<option value="${i}">${o.label}</option>`)}</select><script type="application/json" data-addr-json="${p}">${raw(JSON.stringify(opts.map((o) => o.v)).replace(/</g, '\\u003c'))}</script></label>
      ${fld('Name / Firma', p + 'Name', a.name || '', { req: true })}${fld('Straße und Hausnummer', p + 'Street', a.street || '', { req: true })}
      ${fld('Stadt', p + 'City', a.city || 'Frankfurt am Main', { type: 'select', options: CITIES.map((c) => c.name) })}${fld('PLZ', p + 'Zip', a.zip || (CITY[a.city || 'Frankfurt am Main'] || {}).zip || '', { req: true, pattern: '[0-9]{5}', maxlength: 5, ph: '60311' })}
      ${fld('Ansprechpartner', p + 'Contact', a.contact || '')}${fld('Telefon', p + 'Phone', a.phone || '', { type: 'tel' })}
      ${fld(label + 'datum', p + 'Date', a.date || addDays(today(), 1), { type: 'date', req: true })}${fld('Zeitfenster von', p + 'From', a.from || '08:00', { type: 'time', req: true })}${fld('bis', p + 'To', a.to || (p === 'p' ? '12:00' : '17:00'), { type: 'time', req: true })}
    </div></fieldset>`;
}
function orderForm(o, q) {
  const copy = !o && q.get('copy') ? ord(q.get('copy')) : null;
  const src = o || copy;
  if (o && ['zugestellt', 'abgeschlossen', 'storniert'].includes(o.status)) return html`${pageHead('Auftrag nicht bearbeitbar')}${notice('amber', `Der Auftrag ${o.nr} ist ${stat(o.status).name.toLowerCase()} und kann nicht mehr geändert werden. Du kannst ihn kopieren.`)}<p class="mt"><a class="btn" href="#/auftraege/${o.id}">Zurück</a></p>`;
  let draft = null;
  if (!src) { try { draft = JSON.parse(lsGet(DRAFT_KEY) || 'null'); } catch (e) { draft = null; } }
  const v = (name, def) => (draft && draft[name] != null ? draft[name] : def);
  const g = src ? src.goods : { desc: '', weight: '', volume: '', pieces: 1, pallets: 0 };
  const pa = src ? { ...src.pickup, date: copy ? addDays(today(), 1) : src.pickup.date } : { name: '', street: '', city: 'Frankfurt am Main', zip: '' };
  const da = src ? { ...src.delivery, date: copy ? addDays(today(), 1) : src.delivery.date } : { name: '', street: '', city: 'Frankfurt am Main', zip: '' };
  const custId = v('customerId', src ? src.customerId : (q.get('cust') && cust(q.get('cust')) ? q.get('cust') : (DB.customers.find((c) => !c.archived) || {}).id));
  const dv = (p, k, def) => v(p + k, def);
  const A = (p, a) => ({ name: dv(p, 'Name', a.name), street: dv(p, 'Street', a.street), city: dv(p, 'City', a.city), zip: dv(p, 'Zip', a.zip), contact: dv(p, 'Contact', a.contact), phone: dv(p, 'Phone', a.phone), date: dv(p, 'Date', a.date), from: dv(p, 'From', a.from), to: dv(p, 'To', a.to) });
  return html`
    ${pageHead(o ? `Auftrag ${o.nr} bearbeiten` : copy ? `Kopie von ${copy.nr}` : 'Neuer Transportauftrag', 'Pflichtfelder sind mit * markiert. Änderungen werden automatisch als Entwurf gesichert.', '', html`<a href="#/auftraege">Aufträge</a> › ${o ? o.nr : 'Neu'}`)}
    <form data-submit="order.save" data-draft="${o ? '' : '1'}" class="grid g21" novalidate>
      <div>
        <input type="hidden" name="editId" value="${o ? o.id : ''}"><input type="hidden" name="rev" value="${o ? o.rev : ''}">
        <fieldset><legend>Auftraggeber</legend><div class="fgrid">
          ${fld('Kunde', 'customerId', custId, { type: 'select', options: DB.customers.filter((c) => !c.archived || (src && src.customerId === c.id)).map((c) => [c.id, `${c.name} (${c.nr})`]), req: true })}
          ${fld('Kundenreferenz / Bestellnummer', 'ref', v('ref', src ? (copy ? '' : src.ref) : ''))}
          ${fld('Niederlassung', 'branch', v('branch', src ? src.branch : (SESS.branch !== 'all' ? SESS.branch : 'b1')), { type: 'select', options: allowedBranches().map((b) => [b, branchName(b)]) })}
        </div></fieldset>
        ${addrFieldset('p', 'Abholadresse', A('p', pa), custId, 'Abhol')}
        ${addrFieldset('d', 'Lieferadresse', A('d', da), custId, 'Liefer')}
        <fieldset><legend>Ware</legend><div class="fgrid">
          ${fld('Beschreibung', 'desc', v('desc', g.desc), { req: true, cls: 'wide' })}
          ${fld('Gewicht (kg)', 'weight', v('weight', g.weight), { type: 'number', req: true, min: 0.1, step: '0.1' })}${fld('Volumen (m³)', 'volume', v('volume', g.volume), { type: 'number', min: 0, step: '0.01' })}
          ${fld('Packstücke', 'pieces', v('pieces', g.pieces), { type: 'number', min: 1, step: '1', req: true })}${fld('davon Paletten', 'pallets', v('pallets', g.pallets), { type: 'number', min: 0, step: '1' })}
        </div></fieldset>
        <fieldset><legend>Transport</legend><div class="fgrid">
          ${fld('Transportart', 'type', v('type', src ? src.type : 'paket'), { type: 'select', options: DB.settings.transportTypes.map((t) => [t.id, t.name]) })}
          ${fld('Priorität', 'prio', v('prio', src ? src.prio : 'normal'), { type: 'select', options: DB.settings.priorities.map((t) => [t.id, t.name]) })}
          <div class="wide"><div class="fld"><span>Zusatzleistungen</span></div>${checks('extras', DB.settings.extras.map((e) => [e.id, `${e.name}${e.fix ? ' (+' + eur(e.fix) + ')' : ''}`]), v('extras', src ? src.extras : []))}</div>
          ${fld('Bemerkung für Fahrer und Disposition', 'note', v('note', src ? src.note : ''), { type: 'textarea', cls: 'wide' })}
        </div></fieldset>
      </div>
      <aside class="stack" style="position:sticky;top:76px;align-self:start">
        <section class="card"><div class="card-h"><h2>Vorschau</h2></div><div id="oprev" aria-live="polite"></div></section>
        <div class="card stack">
          ${!o || o.status === 'entwurf' ? html`<button class="btn primary block" data-save="open">${ic('check')} Auftrag anlegen</button><button class="btn block" data-save="draft">${o ? 'Entwurf speichern' : 'Als Entwurf speichern'}</button>` : html`<button class="btn primary block" data-save="keep">${ic('check')} Änderungen speichern</button>`}
          <a class="btn ghost block" href="#/auftraege${o ? '/' + o.id : ''}">Abbrechen</a>
          ${o ? '' : html`<p class="tiny muted" id="draftmsg">Entwurf wird automatisch gesichert.</p>`}
        </div>
      </aside>
    </form>`;
}
VIEWS.auftraege.form = (seg) => seg[0] === 'neu' || seg[1] === 'edit';
VIEWS.auftraege.after = (seg) => { if (seg[0] === 'neu' || seg[1] === 'edit') formSetup(); };
function formValues(form) { const f = formObj(form); f.extras = f.extras || []; return f; }
function formPreview(form) {
  const f = formValues(form);
  const pc = CITY[f.pCity], dc = CITY[f.dCity];
  const box = $('#oprev'); if (!box || !pc || !dc) return;
  const o = { type: f.type, prio: f.prio, extras: f.extras, customerId: f.customerId, goods: { weight: +f.weight || 0, volume: +f.volume || 0, pallets: +f.pallets || 0 }, pickup: geoFor(f.pStreet || 'x', f.pCity), delivery: geoFor(f.dStreet || 'y', f.dCity) };
  const pr = calcPrice(o);
  const warns = [];
  const tt = ttype(f.type);
  if (tt.maxKg && +f.weight > tt.maxKg) warns.push(`${tt.name}: maximal ${nf(tt.maxKg, 1)} kg. Bitte eine andere Transportart wählen.`);
  if (f.pDate && f.dDate && f.dDate < f.pDate) warns.push('Das Lieferdatum liegt vor dem Abholdatum.');
  if (f.pFrom && f.pTo && f.pTo <= f.pFrom) warns.push('Das Abholfenster endet vor seinem Beginn.');
  if (f.dDate === f.pDate && f.dFrom && f.dTo && f.dTo <= f.dFrom) warns.push('Das Lieferfenster endet vor seinem Beginn.');
  if (+f.pallets > +f.pieces) warns.push('Es gibt mehr Paletten als Packstücke.');
  if (f.pDate && f.pDate < today() && !f.editId) warns.push('Der Abholtermin liegt in der Vergangenheit.');
  const km = pr.km;
  box.innerHTML = String(html`<dl>${kv('Strecke', `${nf(km)} km`)}${kv('Fahrzeit (ca.)', dur(travelMin(km)))}${kv('Frachtpflichtig', `${nf(pr.kg)} kg`)}${kv('CO₂ (Schätzung)', `${nf(co2Of(km, +f.weight || 0, f.type), 1)} kg`)}</dl>
    <table class="tbl"><tbody>${pr.lines.map((l) => html`<tr><td class="nolabel tiny" data-l="">${l.label}</td><td class="num nolabel" data-l="">${eur(l.amount)}</td></tr>`)}</tbody><tfoot><tr><td data-l="">Netto</td><td class="num" data-l="">${eur(pr.net)}</td></tr></tfoot></table>
    ${warns.length ? html`<div class="stack mt-s">${warns.map((w) => notice('amber', w))}</div>` : ''}`);
}
function formSetup() {
  const form = $('form[data-submit="order.save"]'); if (!form) return;
  const jsonOf = (p) => { try { return JSON.parse($(`[data-addr-json="${p}"]`, form).textContent); } catch (e) { return []; } };
  $$('select[data-addr]', form).forEach((sel) => sel.addEventListener('change', () => {
    const p = sel.dataset.addr, a = jsonOf(p)[sel.value]; if (!a) return;
    form.elements[p + 'Name'].value = a.name; form.elements[p + 'Street'].value = a.street; form.elements[p + 'Zip'].value = a.zip; form.elements[p + 'City'].value = a.city; form.elements[p + 'Contact'].value = a.contact; form.elements[p + 'Phone'].value = a.phone;
    formPreview(form); saveDraft(form);
  }));
  ['p', 'd'].forEach((p) => form.elements[p + 'City'].addEventListener('change', () => { const c = CITY[form.elements[p + 'City'].value]; if (c && !form.elements[p + 'Zip'].value) form.elements[p + 'Zip'].value = c.zip; }));
  form.elements.customerId.addEventListener('change', () => {
    const opts = addrOptions(form.elements.customerId.value);
    ['p', 'd'].forEach((p) => {
      $(`[data-addr-json="${p}"]`, form).textContent = JSON.stringify(opts.map((x) => x.v));
      $(`select[data-addr="${p}"]`, form).innerHTML = '<option value="">– auswählen –</option>' + opts.map((x, i) => `<option value="${i}">${esc(x.label)}</option>`).join('');
    });
  });
  const upd = () => { formPreview(form); saveDraft(form); };
  form.addEventListener('input', upd); form.addEventListener('change', upd);
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-save]'); if (b) form.dataset.mode = b.dataset.save; });
  formPreview(form);
}
let draftTimer = null;
function saveDraft(form) {
  if (!form.dataset.draft) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { const f = formValues(form); delete f.editId; delete f.rev; lsSet(DRAFT_KEY, JSON.stringify(f)); const m = $('#draftmsg'); if (m) m.textContent = `Entwurf automatisch gesichert um ${hhmm(NOW())} Uhr.`; }, 400);
}
onSubmit('order.save', 'auftraege', (f, form) => {
  const mode = form.dataset.mode || 'open';
  const errs = [];
  const tt = ttype(f.type);
  if (tt.maxKg && +f.weight > tt.maxKg) errs.push(`${tt.name}: maximal ${nf(tt.maxKg, 1)} kg, eingegeben sind ${nf(+f.weight, 1)} kg.`);
  if (f.dDate < f.pDate) errs.push('Das Lieferdatum darf nicht vor dem Abholdatum liegen.');
  if (f.pTo <= f.pFrom) errs.push('Das Abholfenster endet vor seinem Beginn.');
  if (f.dDate === f.pDate && f.dTo <= f.dFrom) errs.push('Das Lieferfenster endet vor seinem Beginn.');
  if (+f.pallets > +f.pieces) errs.push('Es kann nicht mehr Paletten als Packstücke geben.');
  if (errs.length) return openModal({ title: 'Bitte korrigieren', cls: 'small', body: html`<ul>${errs.map((e) => html`<li>${e}</li>`)}</ul>`, foot: html`<button type="button" class="btn primary" data-act="modal.close" autofocus>Verstanden</button>` });
  if (f.editId) {
    const o = ord(f.editId);
    if (o.rev !== +f.rev) {
      conflictCb = () => { closeModal(); applyOrderEdit(o, f, true, mode); };
      return openModal({ title: 'Konflikt: Auftrag wurde geändert', cls: 'small', body: html`<p>Der Auftrag <b>${o.nr}</b> wurde zwischenzeitlich von jemand anderem geändert (Version ${o.rev} statt ${f.rev}). Möchtest du die neuere Version laden oder deine Eingaben trotzdem speichern?</p>`, foot: html`<a class="btn" href="#/auftraege/${o.id}/edit" data-act="modal.close">Neue Version laden</a><button type="button" class="btn danger" data-act="order.force">Meine Version speichern</button>` });
    }
    return applyOrderEdit(o, f, false, mode);
  }
  const o = newOrderFrom({ ...f, asDraft: mode === 'draft' });
  lsSet(DRAFT_KEY, ''); commit();
  toast(`${o.nr} wurde ${mode === 'draft' ? 'als Entwurf gespeichert' : 'angelegt'}.`, 'ok');
  location.hash = `#/auftraege/${o.id}`;
});
let conflictCb = null;
act('order.force', 'auftraege', () => conflictCb && conflictCb());
function applyOrderEdit(o, f, forced, mode) {
  const was = JSON.stringify([o.pickup, o.delivery, o.goods, o.type, o.prio, o.extras]);
  const pc = CITY[f.pCity], dc = CITY[f.dCity];
  const mk = (p, city, c0) => ({ name: f[p + 'Name'], street: f[p + 'Street'], zip: f[p + 'Zip'] || c0.zip, city, contact: f[p + 'Contact'], phone: f[p + 'Phone'], date: f[p + 'Date'], from: f[p + 'From'], to: f[p + 'To'], ...geoFor(f[p + 'Street'], city) });
  o.customerId = f.customerId; o.ref = f.ref; o.branch = f.branch; o.type = f.type; o.prio = f.prio; o.extras = f.extras || []; o.note = f.note;
  o.pickup = mk('p', f.pCity, pc); o.delivery = mk('d', f.dCity, dc);
  o.goods = { desc: f.desc, weight: +f.weight, volume: +f.volume || 0, pieces: +f.pieces || 1, pallets: +f.pallets || 0 };
  const pr = calcPrice(o); o.price = pr.net; o.km = pr.km; o.cost = o.carrier ? o.carrier.price : estCost(o.type, pr.km, o.goods.weight);
  o.rev++;
  if (o.status === 'entwurf' && mode === 'open') setStatus(o, 'offen', 'Entwurf als Auftrag angelegt');
  const changed = was !== JSON.stringify([o.pickup, o.delivery, o.goods, o.type, o.prio, o.extras]);
  addHistory(o, o.status, 'Auftragsdaten bearbeitet');
  audit('Auftrag', o.nr, 'bearbeitet', forced ? 'Auftragsdaten bearbeitet (Konflikt übergangen)' : 'Auftragsdaten bearbeitet');
  if (o.tourId && changed) { const t = tour(o.tourId); if (t) { const w = checkAssign(o, t).filter((c) => c.sev === 'error'); if (w.length) toast('Hinweis: Der Auftrag passt nicht mehr sicher in seine Tour. Bitte Disposition prüfen.', 'bad'); } }
  commit(); toast(`${o.nr} gespeichert.`, 'ok');
  location.hash = `#/auftraege/${o.id}`;
}
