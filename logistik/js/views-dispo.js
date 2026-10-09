'use strict';
/* JWG.logistik – Disposition und Tourenplanung (Drag-and-drop, Konfliktprüfung, Karte, Optimierung) */

const dispoDate = () => UI.dispoDate || today();
function carrierPrice(o, p) { const km = o.km || roadKm(o.pickup, o.delivery); return Math.round(Math.max(p.min, km * p.perKm) * 100) / 100; }

view('dispo', {
  mod: 'dispo', title: 'Disposition', live: true,
  render(seg, q, r) {
    if (UI._appliedD !== r.raw) { UI._appliedD = r.raw; if (q.get('date')) UI.dispoDate = q.get('date'); if (q.get('tour')) UI.f['dispo.focus'] = q.get('tour'); }
    const date = dispoDate(), T = today();
    const tours = scoped(DB.tours).filter((t) => t.date === date).sort((a, b) => a.id.localeCompare(b.id));
    const showAll = fv('dispo.all', false) === true || fv('dispo.all') === 'true';
    const pool = scoped(DB.orders).filter((o) => o.status === 'offen' && !o.carrier && (showAll || o.pickup.date === date)).sort((a, b) => (a.pickup.date + a.pickup.from).localeCompare(b.pickup.date + b.pickup.from));
    const carrierOrders = scoped(DB.orders).filter((o) => o.carrier && !['storniert'].includes(o.status) && (o.pickup.date === date || o.delivery.date === date || (o.status === 'offen' && showAll)));
    const focus = fv('dispo.focus');
    const sch = tours.map((t, idx) => ({ tour: t, idx, sch: scheduleTour(t), pos: tourPosition(t).pos }));
    const w = canWrite('dispo');
    const drivers = scoped(DB.drivers), vehicles = scoped(DB.vehicles);
    const busyD = (id) => tours.find((t) => t.driverId === id && t.status !== 'abgeschlossen'), busyV = (id) => tours.find((t) => t.vehicleId === id && t.status !== 'abgeschlossen');
    return html`
      ${pageHead('Disposition', 'Aufträge per Drag-and-drop auf Touren ziehen. Kapazität, Fahrerlaubnis, Verfügbarkeit und Zeitfenster werden vor jeder Zuweisung geprüft.', html`
        <div class="seg"><button type="button" data-act="dispo.date" data-d="-1" aria-label="Vorheriger Tag">${ic('chev', 'flip')}</button><button type="button" data-act="dispo.date" data-d="0" aria-pressed="${date === T}">${date === T ? 'Heute' : fDay(date)}</button><button type="button" data-act="dispo.date" data-d="1" aria-label="Nächster Tag">${ic('chev')}</button></div>
        <input type="date" value="${date}" data-dispo-date aria-label="Datum wählen" style="width:auto">
        ${w ? html`<button type="button" class="btn primary" data-act="tour.new">${ic('plus')} Neue Tour</button>` : ''}`)}
      <div class="dispo">
        <aside class="card pool" id="pool" data-drop-pool aria-label="Nicht disponierte Aufträge">
          <div class="card-h"><h2>Offene Aufträge (${pool.length})</h2></div>
          <label class="chk mb"><input type="checkbox" data-bind="dispo.all" ${showAll ? raw('checked') : ''}><span>Alle Tage anzeigen</span></label>
          ${pool.length ? pool.map((o) => html`<div class="ocard" ${w ? raw('draggable="true"') : ''} data-drag-order="${o.id}">
            <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b><a href="#/auftraege/${o.id}">${o.nr}</a></b>${prioChip(o.prio)}</div>
            <span class="muted">${custName(o.customerId)}</span>
            <span>${route(o)}</span>
            <span class="tiny muted">${fDay(o.pickup.date)} ${o.pickup.from}–${o.pickup.to} · ${nf(o.goods.weight, o.goods.weight < 10 ? 1 : 0)} kg${o.goods.pallets ? ` · ${o.goods.pallets} Pal.` : ''} · ${ttype(o.type).name.split(' (')[0]}</span>
            ${w ? html`<div class="row gap-s mt-s"><button type="button" class="btn sm" data-act="assign.pick" data-order="${o.id}">${ic('route')} Zuweisen</button><button type="button" class="btn sm ghost" data-act="carrier.open" data-order="${o.id}">${ic('link')} Frachtführer</button></div>` : ''}</div>`) : empty('Alles disponiert', showAll ? 'Es gibt keine offenen Aufträge.' : 'Für diesen Tag gibt es keine offenen Aufträge.')}
          ${w ? html`<div class="dropzone mt-s" data-drop-pool>Hierher ziehen, um einen Auftrag aus der Tour zu nehmen</div>` : ''}
        </aside>
        <div class="stack">
          ${tours.length ? html`<div class="tours">${sch.map((x) => tourCard(x, focus, w))}</div>` : html`<div class="card">${empty('Keine Touren an diesem Tag', w ? 'Lege eine Tour an und ziehe Aufträge hinein.' : '')}${w ? html`<div class="row" style="justify-content:center"><button type="button" class="btn primary" data-act="tour.new">${ic('plus')} Neue Tour</button></div>` : ''}</div>`}
          <section class="card"><div class="card-h"><h2>Karte der Touren</h2><span class="muted tiny">● Abholung, ■ Zustellung, gestrichelt = geplant</span></div>
            ${sch.length ? mapSVG({ tours: sch, fit: true, ratio: 2, focus, px: 720, label: 'Touren des Tages' }) : mapSVG({ px: 600, label: 'Karte' })}
            ${sch.length ? html`<div class="legend">${sch.map((x) => html`<span><i style="background:${TOUR_COLORS[x.idx % TOUR_COLORS.length]}"></i>${x.tour.id} · ${(drv(x.tour.driverId) || {}).name || '–'}</span>`)}</div>` : ''}</section>
          ${carrierOrders.length ? html`<section class="card"><div class="card-h"><h2>Vergabe an Frachtführer</h2><a href="#/partner">Frachtführer</a></div><ul class="list">${carrierOrders.map((o) => html`<li>${chip(o.carrier.status, o.carrier.status === 'abgelehnt' ? 'red' : o.carrier.status === 'angefragt' ? 'amber' : 'green')}<div class="grow"><a href="#/auftraege/${o.id}">${o.nr}</a> · ${route(o)}<div class="tiny muted">${(par(o.carrier.partnerId) || {}).name} · ${eur(o.carrier.price)}</div></div>${w && ['angefragt', 'abgelehnt'].includes(o.carrier.status) ? html`<button type="button" class="btn sm ghost" data-act="carrier.remove" data-order="${o.id}">Zurückholen</button>` : ''}</li>`)}</ul></section>` : ''}
          <div class="grid g2">
            <section class="card"><div class="card-h"><h2>Fahrer am ${fDate(date)}</h2></div><ul class="list">${drivers.map((d) => { const ab = driverAbsent(d, date), bt = busyD(d.id); return html`<li>${avatar(d.name)}<div class="grow"><a href="#/fahrer/${d.id}">${d.name}</a><div class="tiny muted">${branchName(d.branch)} · ${d.licenses.join(', ')}</div></div>${ab ? chip(ab.kind, 'red') : bt ? chip(bt.id.slice(-4), 'violet', `Tour ${bt.id}`) : chip('frei', 'green')}</li>`; })}</ul></section>
            <section class="card"><div class="card-h"><h2>Fahrzeuge am ${fDate(date)}</h2></div><ul class="list">${vehicles.map((v) => { const bt = busyV(v.id); const st = vehicleState(v); const blocked = ['gesperrt', 'werkstatt'].includes(st.id) || diffDays(v.tuev, date) < 0; return html`<li><span class="avatar tone-gray">${ic('truck')}</span><div class="grow"><a href="#/fuhrpark/${v.id}">${v.plate}</a><div class="tiny muted">${vtype(v.type).name} · ${nf(v.payload)} kg</div></div>${blocked ? chip(st.id === 'frei' ? 'TÜV fällig' : st.label, 'red') : bt ? chip(bt.id.slice(-4), 'violet', `Tour ${bt.id}`) : chip('frei', 'green')}</li>`; })}</ul></section>
          </div>
        </div>
      </div>`;
  },
});
function tourCard(x, focus, w) {
  const t = x.tour, sch = x.sch, d = drv(t.driverId), v = veh(t.vehicleId), L = tourLoad(t);
  const col = TOUR_COLORS[x.idx % TOUR_COLORS.length];
  const active = t.status !== 'abgeschlossen';
  const allDone = sch.stops.length && sch.stops.every((s) => s.done);
  const co2 = sch.totalKm * (v ? vtype(v.type).co2 : 0.3);
  return html`<article class="tour ${focus === t.id ? 'sel' : ''}" ${w && active ? raw(`data-drop-tour="${esc(t.id)}"`) : ''} aria-label="Tour ${t.id}">
    <div class="tour-h"><span class="status-dot" style="--c:${col};width:14px;height:14px"></span><div class="grow"><b>${t.id}</b> <span class="muted tiny">Start ${t.status === 'geplant' ? t.startTime : hhmm(sch.start)}</span><div class="tiny">${d ? html`<a href="#/fahrer/${d.id}">${d.name}</a>` : '–'} · ${v ? html`<a href="#/fuhrpark/${v.id}">${v.plate}</a>` : '–'}</div></div>${chip(t.status === 'geplant' ? 'Geplant' : t.status === 'unterwegs' ? 'Unterwegs' : 'Abgeschlossen', t.status === 'geplant' ? 'blue' : t.status === 'unterwegs' ? 'violet' : 'green')}</div>
    ${v ? html`<div class="stack gap-s" style="gap:4px"><div class="row" style="justify-content:space-between"><span class="tiny muted">Nutzlast ${nf(L.kg)} / ${nf(v.payload)} kg</span><span class="tiny muted">${nf(L.m3, 1)} / ${nf(v.volume)} m³</span></div>${progress(L.kg, v.payload)}${progress(L.m3, v.volume)}</div>` : ''}
    <ul class="stops">${sch.stops.length ? sch.stops.map((s, i) => html`<li class="${s.done ? 'done' : ''} ${s.late ? 'late' : ''}" ${w && !s.done && active ? raw(`draggable="true" data-drag-order="${esc(s.orderId)}"`) : ''}>
      <span class="n ${s.kind === 'D' ? 'd' : ''}" style="--n:${col}" title="${s.kind === 'P' ? 'Abholung' : 'Zustellung'}">${i + 1}</span>
      <div style="min-width:0"><a href="#/auftraege/${s.orderId}"><b>${s.kind === 'P' ? 'Abholung' : 'Zustellung'}</b></a> ${s.addr.city}<div class="tiny muted">${s.orderId} · ${s.addr.from}–${s.addr.to}${s.legKm ? ` · ${s.legKm} km` : ''}${s.wait ? ` · Warten ${s.wait} Min.` : ''}</div></div>
      <div class="row gap-s" style="flex-wrap:nowrap"><div class="right tiny nowrap">${s.done ? html`<b class="up">${ic('check')} ${hhmm(s.doneTs)}</b>` : html`<b>${hhmm(s.eta)}</b>${s.late ? html`<div class="down">+${s.lateMin} Min.</div>` : ''}`}</div>
        ${w && active && !s.done ? html`<div class="mini-btns"><button type="button" class="icon-btn" data-act="stop.up" data-tour="${t.id}" data-key="${s.key}" aria-label="Stopp nach oben" ${i === 0 ? raw('disabled') : ''}>${ic('up')}</button><button type="button" class="icon-btn" data-act="stop.down" data-tour="${t.id}" data-key="${s.key}" aria-label="Stopp nach unten" ${i === sch.stops.length - 1 ? raw('disabled') : ''}>${ic('down')}</button>${s.kind === 'P' ? html`<button type="button" class="icon-btn" data-act="stop.move" data-order="${s.orderId}" aria-label="Auftrag neu zuweisen" title="Neu zuweisen">${ic('refresh')}</button><button type="button" class="icon-btn" data-act="stop.remove" data-order="${s.orderId}" aria-label="Auftrag aus Tour nehmen" title="Aus Tour nehmen">${ic('x')}</button>` : ''}</div>` : ''}</div></li>`) : html`<li style="display:block" class="dropzone">Aufträge hierher ziehen</li>`}</ul>
    <div class="tiny muted">${nf(sch.totalKm)} km · Fahrzeit ${dur(sch.driveMin)} · Gesamt ${dur(sch.durationMin)} · Ende ca. ${hhmm(sch.end)} Uhr · CO₂ ≈ ${nf(co2, 1)} kg</div>
    ${sch.lateCount ? notice('red', `${sch.lateCount} Zeitfenster-Konflikt${sch.lateCount > 1 ? 'e' : ''} in dieser Tour.`) : ''}
    ${w ? html`<div class="row gap-s">
      <button type="button" class="btn sm" data-act="dispo.focus" data-id="${t.id}">${ic('pin')} Karte</button>
      ${active && sch.stops.filter((s) => !s.done).length > 2 ? html`<button type="button" class="btn sm" data-act="tour.opt" data-id="${t.id}">${ic('spark')} Optimieren</button>` : ''}
      ${t.status === 'geplant' ? html`<button type="button" class="btn sm primary" data-act="tour.start" data-id="${t.id}" ${sch.stops.length ? '' : raw('disabled')}>Tour starten</button>` : ''}
      ${t.status === 'unterwegs' ? html`<button type="button" class="btn sm primary" data-act="tour.finish" data-id="${t.id}">Abschließen</button>` : ''}
      ${active ? html`<button type="button" class="btn sm ghost" data-act="tour.edit" data-id="${t.id}">${ic('edit')} Fahrer/Fahrzeug</button>` : ''}
      ${t.status === 'geplant' && !sch.stops.length ? html`<button type="button" class="btn sm ghost" data-act="tour.delete" data-id="${t.id}">${ic('trash')}</button>` : ''}</div>` : ''}
  </article>`;
}
act('dispo.date', null, (d) => { UI.dispoDate = d.d === '0' ? today() : addDays(dispoDate(), +d.d); UI.f['dispo.focus'] = ''; render(); });
document.addEventListener('change', (e) => { if (e.target.matches('[data-dispo-date]') && e.target.value) { UI.dispoDate = e.target.value; render(); } });
act('dispo.focus', null, (d) => { UI.f['dispo.focus'] = UI.f['dispo.focus'] === d.id ? '' : d.id; render(); });

/* ---------- Drag-and-drop ---------- */
let dragOrder = null;
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest && e.target.closest('[data-drag-order]'); if (!el) return;
  dragOrder = el.dataset.dragOrder; e.dataTransfer.setData('text/plain', dragOrder); e.dataTransfer.effectAllowed = 'move'; el.classList.add('drag');
});
document.addEventListener('dragend', (e) => { dragOrder = null; $$('.drag,.over').forEach((x) => x.classList.remove('drag', 'over')); });
document.addEventListener('dragover', (e) => {
  const t = e.target.closest && e.target.closest('[data-drop-tour],[data-drop-pool]');
  if (t && dragOrder) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; $$('.over').forEach((x) => x !== t && x.classList.remove('over')); t.classList.add('over'); }
});
document.addEventListener('dragleave', (e) => { const t = e.target.closest && e.target.closest('[data-drop-tour],[data-drop-pool]'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  const t = e.target.closest && e.target.closest('[data-drop-tour],[data-drop-pool]'); if (!t) return;
  e.preventDefault(); t.classList.remove('over');
  const id = e.dataTransfer.getData('text/plain') || dragOrder; dragOrder = null;
  if (!id || !ord(id)) return;
  if (t.dataset.dropTour) tryAssign(id, t.dataset.dropTour); else removeFromTour(id);
});

let forceCb = null;
function tryAssign(orderId, tourId) {
  const o = ord(orderId), t = tour(tourId);
  if (!o || !t) return;
  if (!canWrite('dispo')) return toast('Dafür fehlt dir die Berechtigung.', 'bad');
  if (o.tourId === tourId) return toast('Der Auftrag ist bereits in dieser Tour.');
  if (!['entwurf', 'offen', 'geplant'].includes(o.status)) return toast(`Der Auftrag ist ${stat(o.status).name.toLowerCase()} und kann nicht mehr disponiert werden.`, 'bad');
  if (o.tourId && tour(o.tourId) && tour(o.tourId).done[o.id + ':P']) return toast('Der Auftrag wurde schon abgeholt.', 'bad');
  const checks = checkAssign(o, t), errs = checks.filter((c) => c.sev === 'error'), warns = checks.filter((c) => c.sev === 'warn');
  const list = (arr, tone) => html`<ul class="stack" style="list-style:none;padding:0;margin:0">${arr.map((c) => html`<li>${notice(tone, c.text, tone === 'red' ? 'x' : 'alert')}</li>`)}</ul>`;
  if (errs.length) return openModal({ title: 'Zuweisung nicht möglich', cls: 'small', body: html`<p class="mb"><b>${o.nr}</b> kann nicht in Tour <b>${t.id}</b>:</p>${list(errs, 'red')}${warns.length ? html`<div class="mt">${list(warns, 'amber')}</div>` : ''}`, foot: html`<button type="button" class="btn" data-act="assign.pick" data-order="${o.id}">Andere Tour wählen</button><button type="button" class="btn primary" data-act="modal.close" autofocus>Verstanden</button>` });
  const doIt = () => {
    const from = o.tourId;
    assignOrder(orderId, tourId); commit();
    toast(`${o.nr} → ${t.id}${from ? ` (neu zugewiesen von ${from})` : ''}`, 'ok');
    if (t.status === 'unterwegs') { pushNotif(`Push an ${(drv(t.driverId) || {}).name}: Neuer Auftrag ${o.nr} in Tour ${t.id}.`, 'info', '#/dispo'); save(); }
  };
  if (warns.length) { forceCb = () => { closeModal(); doIt(); }; return openModal({ title: 'Hinweise zur Zuweisung', cls: 'small', body: html`<p class="mb"><b>${o.nr}</b> → Tour <b>${t.id}</b>. Bitte prüfen:</p>${list(warns, 'amber')}`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button type="button" class="btn primary" data-act="assign.force">Trotzdem zuweisen</button>` }); }
  doIt();
}
act('assign.force', 'dispo', () => forceCb && forceCb());
function removeFromTour(orderId) {
  const o = ord(orderId); if (!o || !o.tourId) return;
  if (!canWrite('dispo')) return toast('Dafür fehlt dir die Berechtigung.', 'bad');
  if (unassignOrder(orderId)) { commit(); toast(`${o.nr} wurde aus der Tour genommen.`, 'ok'); }
}
act('stop.remove', 'dispo', (d) => removeFromTour(d.order));

/* Auswahl-Dialog (für Touchgeräte und "neu zuweisen") */
act('assign.pick', 'dispo', (d) => {
  const o = ord(d.order);
  const all = DB.tours.filter((t) => t.status !== 'abgeschlossen' && inScope(t.branch)).map((t) => {
    const checks = checkAssign(o, t); const errs = checks.filter((c) => c.sev === 'error'), warns = checks.filter((c) => c.sev === 'warn');
    const base = scheduleTour(t).totalKm;
    const probe = scheduleTour({ ...t, seq: o.tourId === t.id ? t.seq : addToSeq(t.seq, o.id) }, { ...DB }).totalKm;
    return { t, errs, warns, extra: o.tourId === t.id ? 0 : probe - base, score: errs.length * 1000 + warns.length * 50 + (t.date === o.pickup.date ? 0 : 200) + (probe - base) };
  }).sort((a, b) => a.score - b.score);
  closeAllModals();
  openModal({ title: `${o.nr} einer Tour zuweisen`, wide: true, body: html`<p class="muted mb">${custName(o.customerId)} · ${route(o)} · ${nf(o.goods.weight, 1)} kg · Abholung ${fDay(o.pickup.date)} ${o.pickup.from}–${o.pickup.to}</p>
    ${all.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tour</th><th>Datum</th><th>Fahrer / Fahrzeug</th><th class="num">Mehr-km</th><th>Prüfung</th><th></th></tr></thead><tbody>${all.map((x, i) => html`<tr><td data-l="Tour" class="first nw"><b>${x.t.id}</b>${i === 0 && !x.errs.length ? html` ${chip('Empfehlung', 'green')}` : ''}</td><td data-l="Datum" class="nw">${fDay(x.t.date)}</td><td data-l="Fahrer">${(drv(x.t.driverId) || {}).name || '–'} · ${(veh(x.t.vehicleId) || {}).plate || '–'}</td><td data-l="Mehr-km" class="num">${x.extra > 0 ? '+' : ''}${nf(x.extra)} km</td><td data-l="Prüfung">${x.errs.length ? chip(`${x.errs.length} Fehler`, 'red', x.errs.map((e) => e.text).join('\n')) : ''} ${x.warns.length ? chip(`${x.warns.length} Hinweis${x.warns.length > 1 ? 'e' : ''}`, 'amber', x.warns.map((e) => e.text).join('\n')) : ''} ${!x.errs.length && !x.warns.length ? chip('passt', 'green') : ''}</td><td data-l=""><button type="button" class="btn sm ${i === 0 && !x.errs.length ? 'primary' : ''}" data-act="assign.do" data-order="${o.id}" data-tour="${x.t.id}" ${o.tourId === x.t.id ? raw('disabled') : ''}>${o.tourId === x.t.id ? 'aktuell' : 'Zuweisen'}</button></td></tr>`)}</tbody></table></div>` : empty('Keine offene Tour vorhanden', 'Lege zuerst eine Tour an.')}
    <p class="note-demo mt">Regelbasierter Vorschlag: Die Empfehlung wählt die Tour mit den wenigsten Konflikten und den geringsten Mehr-Kilometern. Es ist kein KI-Modell.</p>`,
  foot: html`<button type="button" class="btn ghost" data-act="modal.close">Schließen</button><button type="button" class="btn" data-act="tour.new" data-order="${o.id}">${ic('plus')} Neue Tour anlegen</button>` });
});
act('assign.do', 'dispo', (d) => { closeModal(); tryAssign(d.order, d.tour); });
act('stop.move', 'dispo', (d) => ACT['assign.pick'].fn({ order: d.order }));

/* Reihenfolge in der Tour */
function moveStop(d, dir) {
  const t = tour(d.tour); const i = t.seq.indexOf(d.key), j = i + dir;
  if (i < 0 || j < 0 || j >= t.seq.length) return;
  const nk = t.seq[j];
  if (t.done[nk]) return toast('Ein bereits erledigter Stopp kann nicht verschoben werden.', 'bad');
  const seq = t.seq.slice(); [seq[i], seq[j]] = [seq[j], seq[i]];
  const bad = seq.findIndex((k, idx) => k.endsWith(':D') && seq.indexOf(k.replace(':D', ':P')) > idx);
  if (bad >= 0) return toast('Eine Zustellung kann nicht vor ihrer Abholung liegen.', 'bad');
  t.seq = seq; audit('Tour', t.id, 'Reihenfolge', `Stopp ${d.key} verschoben`); commit();
}
act('stop.up', 'dispo', (d) => moveStop(d, -1));
act('stop.down', 'dispo', (d) => moveStop(d, 1));
act('tour.opt', 'dispo', (d) => {
  const t = tour(d.id); const r = optimizeTour(t);
  if (r.kept || r.after >= r.before) toast('Die Reihenfolge ist bereits kürzeste Variante.', 'ok');
  else { audit('Tour', t.id, 'optimiert', `${r.before} km → ${r.after} km`); toast(`Strecke von ${r.before} km auf ${r.after} km verkürzt (−${nf(((r.before - r.after) / r.before) * 100)} %).`, 'ok'); }
  commit();
});

/* Tour anlegen, ändern, starten, beenden */
function tourForm(t, orderId) {
  const date = t ? t.date : dispoDate();
  const mk = (list, label) => list;
  const dOpts = DB.drivers.filter((d) => allowedBranches().includes(d.branch)).map((d) => { const ab = driverAbsent(d, date); const bt = DB.tours.find((x) => x.date === date && x.driverId === d.id && x.status !== 'abgeschlossen' && (!t || x.id !== t.id)); return [d.id, `${d.name} (${d.licenses.join('/')})${ab ? ' – ' + ab.kind : bt ? ' – schon in ' + bt.id : ''}`]; });
  const vOpts = DB.vehicles.filter((v) => allowedBranches().includes(v.branch)).map((v) => { const bt = DB.tours.find((x) => x.date === date && x.vehicleId === v.id && x.status !== 'abgeschlossen' && (!t || x.id !== t.id)); const st = vehicleState(v); return [v.id, `${v.plate} · ${vtype(v.type).name}${['gesperrt', 'werkstatt'].includes(st.id) ? ' – ' + st.label : bt ? ' – schon in ' + bt.id : ''}`]; });
  const now = new Date(NOW()); const q15 = new Date(Math.ceil((NOW() + 30 * 60000) / 9e5) * 9e5);
  const defStart = date === today() ? hhmm(q15.getTime()) : '07:30';
  return html`${t ? html`<input type="hidden" name="id" value="${t.id}">` : ''}<input type="hidden" name="orderId" value="${orderId || ''}">
    <div class="fgrid">${t ? '' : fld('Datum', 'date', date, { type: 'date', req: true })}${fld('Niederlassung', 'branch', t ? t.branch : (SESS.branch !== 'all' ? SESS.branch : 'b1'), { type: 'select', options: allowedBranches().map((b) => [b, branchName(b)]) })}
    ${fld('Fahrer', 'driverId', t ? t.driverId : (dOpts.find((o) => !/ – /.test(o[1])) || dOpts[0])[0], { type: 'select', options: dOpts, req: true })}${fld('Fahrzeug', 'vehicleId', t ? t.vehicleId : (vOpts.find((o) => !/ – /.test(o[1])) || vOpts[0])[0], { type: 'select', options: vOpts, req: true })}
    ${t ? '' : fld('Geplanter Start', 'startTime', defStart, { type: 'time', req: true })}</div>
    <p class="note-demo mt">Fahrer und Fahrzeug werden auf Abwesenheit, Sperren, Hauptuntersuchung und passende Fahrerlaubnis geprüft.</p>`;
}
act('tour.new', 'dispo', (d) => { closeAllModals(); openModal({ title: 'Neue Tour', form: 'tour.save', cls: 'small', body: tourForm(null, d.order), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Tour anlegen</button>` }); });
act('tour.edit', 'dispo', (d) => { const t = tour(d.id); openModal({ title: `${t.id}: Fahrer und Fahrzeug`, form: 'tour.save', cls: 'small', body: tourForm(t), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Speichern</button>` }); });
onSubmit('tour.save', 'dispo', (f) => {
  const t = f.id ? tour(f.id) : { id: '', date: f.date, branch: f.branch, status: 'geplant', startTime: f.startTime, startedAt: null, finishedAt: null, seq: [], done: {}, arrived: {}, note: '' };
  const probe = { ...t, driverId: f.driverId, vehicleId: f.vehicleId, branch: f.branch };
  const d = drv(f.driverId), v = veh(f.vehicleId);
  const errs = [];
  const ab = driverAbsent(d, probe.date); if (ab) errs.push(`${d.name} ist am ${fDate(probe.date)} abwesend (${ab.kind}).`);
  if (['gesperrt', 'werkstatt'].includes(v.status)) errs.push(`${v.plate} ist ${v.status === 'gesperrt' ? 'gesperrt' : 'in der Werkstatt'}.`);
  if (diffDays(v.tuev, probe.date) < 0) errs.push(`Die Hauptuntersuchung von ${v.plate} ist abgelaufen.`);
  const lic = vtype(v.type).req; if (!lic.some((x) => d.licenses.includes(x))) errs.push(`${d.name} hat keine passende Fahrerlaubnis für ${vtype(v.type).name} (nötig: ${lic.join(' oder ')}).`);
  const dup = DB.tours.find((x) => x.id !== t.id && x.date === probe.date && x.status !== 'abgeschlossen' && (x.driverId === d.id || x.vehicleId === v.id));
  if (dup) errs.push(`${dup.driverId === d.id ? d.name : v.plate} ist am selben Tag schon in Tour ${dup.id} eingeplant.`);
  if (errs.length) return openModal({ title: 'Tour nicht möglich', cls: 'small', body: html`<ul class="stack" style="list-style:none;padding:0;margin:0">${errs.map((e) => html`<li>${notice('red', e, 'x')}</li>`)}</ul>`, foot: html`<button type="button" class="btn primary" data-act="modal.close" autofocus>Zurück</button>` });
  closeAllModals();
  if (f.id) { t.driverId = f.driverId; t.vehicleId = f.vehicleId; t.branch = f.branch; audit('Tour', t.id, 'bearbeitet', `${d.name}, ${v.plate}`); toast('Tour aktualisiert.', 'ok'); }
  else { t.id = nextNo('tour'); t.driverId = f.driverId; t.vehicleId = f.vehicleId; DB.tours.push(t); audit('Tour', t.id, 'erstellt', `${d.name}, ${v.plate}, ${fDate(t.date)}`); toast(`Tour ${t.id} angelegt.`, 'ok'); if (f.orderId) { UI.dispoDate = t.date; commit(); return tryAssign(f.orderId, t.id); } }
  commit();
});
act('tour.delete', 'dispo', (d) => { const t = tour(d.id); confirmBox(`Tour ${t.id} löschen?`, 'Löschen', () => { DB.tours = DB.tours.filter((x) => x.id !== t.id); audit('Tour', t.id, 'gelöscht', 'Leere Tour entfernt'); commit(); toast('Tour gelöscht.', 'ok'); }); });
act('tour.start', 'dispo', (d) => {
  const t = tour(d.id); const dr = drv(t.driverId);
  t.status = 'unterwegs'; t.startedAt = NOW();
  tourOrdersOf(t).forEach((o) => addHistory(o, o.status, `Tour ${t.id} gestartet`, curUserName()));
  audit('Tour', t.id, 'gestartet', `${dr ? dr.name : ''}`); if (DB.settings.automation.pushDriver) pushNotif(`Push an ${dr ? dr.name : 'Fahrer'}: Tour ${t.id} wurde gestartet.`, 'info', '#/fahrer-app');
  commit(); toast(`Tour ${t.id} gestartet. Die Fahrer-App zeigt sie jetzt an.`, 'ok');
});
const tourOrdersOf = (t) => tourLoad(t).orders;
act('tour.finish', 'dispo', (d) => {
  const t = tour(d.id); const open = t.seq.filter((k) => !t.done[k]).length;
  const doIt = () => { t.status = 'abgeschlossen'; t.finishedAt = NOW(); audit('Tour', t.id, 'abgeschlossen', ''); commit(); toast(`Tour ${t.id} abgeschlossen.`, 'ok'); };
  if (open) confirmBox(`In Tour ${t.id} sind noch ${open} Stopps offen. Trotzdem abschließen? Offene Aufträge bleiben im Status wie bisher.`, 'Abschließen', doIt, 'primary'); else doIt();
});

/* ---------- Frachtführer vergeben ---------- */
act('carrier.open', 'dispo', (d) => {
  const o = ord(d.order); const km = o.km || roadKm(o.pickup, o.delivery);
  const opts = DB.partners.filter((p) => p.active).map((p) => ({ p, price: carrierPrice(o, p) })).sort((a, b) => a.price - b.price);
  openModal({ title: `${o.nr} an Frachtführer vergeben`, form: 'carrier.assign', body: html`<input type="hidden" name="order" value="${o.id}"><p class="muted mb">${route(o)} · ${nf(km)} km · ${nf(o.goods.weight, 1)} kg · Verkaufspreis netto ${eur(o.price)}</p>
    <fieldset><legend>Frachtführer wählen</legend><div class="stack">${opts.map((x, i) => html`<label class="chk" style="align-items:flex-start"><input type="radio" name="partnerId" value="${x.p.id}" data-price="${x.price}" ${i === 0 ? raw('checked') : ''}><span><b>${x.p.name}</b> · ${eur(x.price)} <span class="muted">(${eur(x.p.perKm)}/km, mind. ${eur(x.p.min)})</span><br><small class="muted">${x.p.capacity} · Bewertung ${nf(x.p.rating, 1)} · Pünktlichkeit ${x.p.onTime} %</small></span></label>`)}</div></fieldset>
    ${fld('Vereinbarter Frachtpreis netto (€)', 'price', opts[0].price, { type: 'number', req: true, min: 0, step: '0.01' })}`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Anfrage senden</button>` });
});
document.addEventListener('change', (e) => { if (e.target.matches('[data-price]')) { const f = e.target.closest('form'); if (f) f.elements.price.value = e.target.dataset.price; } });
onSubmit('carrier.assign', 'dispo', (f) => {
  const o = ord(f.order), p = par(f.partnerId);
  if (o.tourId) unassignOrder(o.id, true);
  o.carrier = { partnerId: p.id, price: +f.price, status: 'angefragt' }; o.cost = +f.price; o.rev++;
  addHistory(o, o.status, `Anfrage an Frachtführer ${p.name} (${eur(+f.price)})`);
  audit('Auftrag', o.nr, 'Frachtführer', `Anfrage an ${p.name}`);
  const th = DB.threads.find((t) => t.kind === 'partner' && t.refId === p.id && t.orderId === o.id);
  if (!th) DB.threads.unshift({ id: uid('th'), kind: 'partner', title: `${p.name} – ${o.nr}`, refId: p.id, orderId: o.id, unread: 0, msgs: [{ id: uid('m'), from: curUser().name, text: `Anfrage: ${o.nr}, ${o.pickup.city} → ${o.delivery.city}, ${nf(o.goods.weight, 1)} kg, Abholung ${fDate(o.pickup.date)}. Angebot ${eur(+f.price)}.`, ts: NOW(), kind: 'intern' }] });
  closeModal(); commit(); toast(`Anfrage an ${p.name} gesendet.`, 'ok');
});
act('carrier.remove', 'dispo', (d) => { const o = ord(d.order); o.carrier = null; o.cost = estCost(o.type, o.km || 0, o.goods.weight); addHistory(o, o.status, 'Frachtführer-Vergabe zurückgenommen'); if (o.status === 'geplant') setStatus(o, 'offen', 'Wieder offen'); commit(); toast('Auftrag zurückgeholt.', 'ok'); });
