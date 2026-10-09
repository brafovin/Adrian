'use strict';
/* JWG.logistik – Fahrer-App (Simulation im Telefonrahmen): Anmeldung, Touren, Stopps, Unterschrift, Fotos, Offline-Warteschlange */

const APPST = { photos: [], sig: null, name: '', note: '', count: '' }; // Eingaben des aktuellen Stopps (nur im Speicher)
const appRst = () => { APPST.photos = []; APPST.sig = null; APPST.name = ''; APPST.note = ''; APPST.count = ''; };
const A_ = () => SESS.app;
const appDriver = () => drv(A_().driverId);
const pendingQ = (tourId, key, type) => DB.appQueue.some((a) => a.tourId === tourId && a.key === key && a.type === type);
const stopDone = (t, key) => t.done[key] || (pendingQ(t.id, key, 'pickup') || pendingQ(t.id, key, 'deliver') ? 'wartet' : null);
const stopArrived = (t, key) => t.arrived[key] || (pendingQ(t.id, key, 'arrive') ? 'wartet' : null);

/* Aktionen anwenden (online sofort, offline später aus der Warteschlange) */
function applyDriverAction(a) {
  const t = tour(a.tourId); const d = drv(a.driverId); if (!d) return;
  const [oid, kind] = (a.key || '').split(':'); const o = oid ? ord(oid) : null;
  const by = `${d.name} (Fahrer-App)`; const ts = a.ts; const city = o ? (kind === 'P' ? o.pickup.city : o.delivery.city) : '';
  ACTOR = by;
  try {
    switch (a.type) {
      case 'start': t.status = 'unterwegs'; t.startedAt = ts; tourLoad(t).orders.forEach((x) => addHistory(x, x.status, `Tour ${t.id} gestartet`, by, { ts })); audit('Tour', t.id, 'gestartet', `Fahrer-App: ${d.name}`); pushNotif(`${d.name} hat Tour ${t.id} gestartet.`, 'info', '#/dispo'); break;
      case 'arrive': t.arrived[a.key] = ts; if (kind === 'D') setStatus(o, 'in_zustellung', `Fahrer ist in ${city} eingetroffen`, by, { ts }); else addHistory(o, o.status, `Fahrer am Abholort ${city} eingetroffen`, by, { ts }); break;
      case 'pickup': {
        if (t.status === 'geplant') { t.status = 'unterwegs'; t.startedAt = ts; }
        t.done[a.key] = ts; if (!t.arrived[a.key]) t.arrived[a.key] = ts;
        setStatus(o, 'abgeholt', `Abgeholt in ${city}${(a.data.photos || []).length ? ' (mit Foto)' : ''}`, by, { ts });
        o.pickupConf = { ts, photos: a.data.photos || [], count: a.data.count };
        if (a.data.count != null && a.data.count !== '' && +a.data.count !== o.goods.pieces) { const c = newClaim({ orderId: o.id, type: 'Fehlmenge', text: `Fahrer meldet bei Abholung ${a.data.count} statt ${o.goods.pieces} Packstücken.${a.data.note ? ' ' + a.data.note : ''}`, cost: 0, resp: 'Tobias Brandt', photos: a.data.photos || [] }); addHistory(o, o.status, `Abweichende Stückzahl: ${a.data.count} statt ${o.goods.pieces} (Reklamation ${c.nr})`, by, { ts }); }
        audit('Auftrag', o.nr, 'Abholung', `Fahrer-App: ${d.name}`); break; }
      case 'deliver':
        t.done[a.key] = ts; if (!t.arrived[a.key]) t.arrived[a.key] = ts;
        setStatus(o, 'zugestellt', `Zugestellt in ${city}, Empfang bestätigt durch ${a.data.name}`, by, { ts });
        o.pod = { name: a.data.name, ts, sig: a.data.sig, photos: a.data.photos || [], by: d.name, note: a.data.note || '' };
        audit('Auftrag', o.nr, 'Zustellung', `Fahrer-App: ${d.name}, Empfänger ${a.data.name}`); break;
      case 'notmet': t.arrived[a.key] = t.arrived[a.key] || ts; o.flags.problem = true; o.flags.problemText = `Empfänger in ${city} nicht angetroffen${a.data.note ? ': ' + a.data.note : ''}`; addHistory(o, o.status, o.flags.problemText, by, { ts }); pushNotif(`${o.nr}: ${o.flags.problemText}`, 'warn', `#/auftraege/${o.id}`); break;
      case 'delay': {
        const open = tourStopList(t).filter((s) => !t.done[s.key] && s.kind === 'D').map((s) => s.order);
        open.forEach((x) => { x.flags.delay = { min: a.data.min, reason: a.data.reason, ts }; addHistory(x, x.status, `Verspätung gemeldet: ca. ${a.data.min} Min. (${a.data.reason})`, by, { ts }); if (DB.settings.automation.delayMail) { const e = orderEta(x); queueMail('delay', x, { minuten: a.data.min, eta: e ? hhmm(e.eta + a.data.min * 60000) + ' Uhr' : '–' }); } });
        pushNotif(`${d.name} meldet ${a.data.min} Min. Verspätung (${a.data.reason}), Tour ${t.id}.`, 'warn', '#/dispo'); break; }
      case 'damage': { const c = newClaim({ orderId: o.id, type: 'Schaden', text: `Fahrer-App (${d.name}): ${a.data.text}`, cost: 0, resp: 'Lea Fischer', photos: a.data.photos || [] }); addHistory(o, o.status, `Schaden gemeldet (Reklamation ${c.nr})`, by, { ts }); break; }
      case 'doc': DB.docs.unshift({ id: uid('u'), type: 'Lieferschein', name: a.data.name, size: a.data.size || 0, data: a.data.data || null, orderId: o.id, ts, by: d.name, role: ['admin', 'dispo', 'buch', 'service'] }); addHistory(o, o.status, `Lieferschein hochgeladen: ${a.data.name}`, by, { ts }); break;
      case 'msg': { let th = DB.threads.find((x) => x.kind === 'fahrer' && x.refId === d.id); if (!th) { th = { id: uid('th'), kind: 'fahrer', title: `${d.name} (${(veh(d.vehicleId) || {}).plate || ''})`, refId: d.id, orderId: null, unread: 0, msgs: [] }; DB.threads.unshift(th); } th.msgs.push({ id: uid('m'), from: d.name, text: a.data.text, ts, kind: 'fahrer' }); th.unread = (th.unread || 0) + 1; break; }
    }
    if (['pickup', 'deliver'].includes(a.type) && t.seq.length && t.seq.every((k) => t.done[k])) { t.status = 'abgeschlossen'; t.finishedAt = ts; pushNotif(`Tour ${t.id} von ${d.name} ist abgeschlossen.`, 'ok', '#/dispo'); audit('Tour', t.id, 'abgeschlossen', 'alle Stopps erledigt (Fahrer-App)'); }
  } finally { ACTOR = null; }
}
function appDo(type, tourId, key, data = {}) {
  const a = { id: uid('q'), ts: NOW(), type, tourId, key, data, driverId: A_().driverId };
  if (A_().offline) { DB.appQueue.push(a); commit(); toast('Offline gespeichert. Die Aktion wird synchronisiert, sobald du wieder online bist.'); } else { applyDriverAction(a); commit(); }
}
function syncQueue() {
  const q = DB.appQueue.slice().sort((a, b) => a.ts - b.ts); DB.appQueue = [];
  q.forEach((a) => { try { applyDriverAction(a); } catch (e) { console.error('Sync-Fehler', e); } });
  commit(); if (q.length) toast(`${q.length} Aktion${q.length > 1 ? 'en' : ''} synchronisiert.`, 'ok');
}

/* ---------- Ansicht ---------- */
const appTop = (d, title, back) => html`<div class="phone-top">${back ? html`<button type="button" class="icon-btn" data-act="app.back" aria-label="Zurück">${ic('chev', 'flip')}</button>` : ''}<b class="grow">${title}</b>${d ? html`<button type="button" class="icon-btn" data-act="app.offline" aria-label="${A_().offline ? 'Offline-Modus beenden' : 'Offline-Modus einschalten'}" title="${A_().offline ? 'Offline' : 'Online'}">${ic(A_().offline ? 'wifioff' : 'wifi')}</button>` : ''}</div>${A_().offline ? html`<div class="offline-bar">${ic('wifioff')} Offline · ${DB.appQueue.length} Aktion${DB.appQueue.length === 1 ? '' : 'en'} warten auf Sync</div>` : ''}`;
const appNav = (cur) => html`<nav class="phone-nav" aria-label="App-Navigation">${[['tours', 'Touren', 'route'], ['chat', 'Chat', 'chat'], ['more', 'Mehr', 'menu']].map(([id, l, i]) => html`<button type="button" data-act="app.nav" data-s="${id}" ${cur === id ? raw('aria-current="true"') : ''}>${ic(i)}${l}${id === 'chat' && chatBadge() ? html`<span class="badge" style="position:absolute;margin:-6px 0 0 22px">${chatBadge()}</span>` : ''}</button>`)}</nav>`;
function chatBadge() { const d = appDriver(); const th = d && DB.threads.find((x) => x.kind === 'fahrer' && x.refId === d.id); if (!th) return 0; return th.msgs.filter((m) => m.kind !== 'fahrer' && m.ts > (th.appSeen || 0)).length; }

function appLogin() {
  const fails = A_().fails || 0, lock = DB.settings.security.lockAfter;
  return html`${appTop(null, 'JWG.driver')}<div class="phone-body"><div class="pcard big"><h2 style="font-size:1.2rem">Anmelden</h2><p class="muted tiny">Melde dich mit Namen und PIN an. Die Anmeldung ist an das Gerät gebunden (Demo).</p>
    <form data-submit="app.login" class="stack mt-s"><label class="fld"><span>Fahrer</span><select name="driver">${DB.drivers.map((d) => html`<option value="${d.id}">${d.name} · ${branchName(d.branch)}</option>`)}</select></label>
    <label class="fld"><span>PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="off" required maxlength="6" placeholder="4 bis 6 Ziffern"></label>
    ${fails >= lock ? notice('red', 'Zu viele Fehlversuche. Der Zugang ist für dieses Gerät gesperrt (Demo: Seite neu laden hebt die Sperre auf).', 'lock') : fails ? notice('amber', `PIN falsch. Noch ${lock - fails} Versuche.`) : ''}
    <button class="p-btn" ${fails >= lock ? raw('disabled') : ''}>${ic('lock')} Anmelden</button></form><p class="note-demo mt-s">Demo-PIN für alle Fahrer: <b>1234</b>.</p></div></div>`;
}
onSubmit('app.login', null, (f) => {
  const d = drv(f.driver); const lock = DB.settings.security.lockAfter;
  if ((A_().fails || 0) >= lock) return;
  ACTOR = d.name + ' (Fahrer-App)';
  if (f.pin === d.pin) { A_().driverId = d.id; A_().screen = 'tours'; A_().fails = 0; secLog('Fahrer-App Anmeldung', 'Erfolgreich'); } else { A_().fails = (A_().fails || 0) + 1; secLog('Fahrer-App Anmeldung', `Fehlgeschlagen (PIN, Versuch ${A_().fails})`, false); }
  ACTOR = null; saveSess(); save(); render();
});
function stopRow(t, s, i) {
  const done = stopDone(t, s.key), arr = stopArrived(t, s.key);
  return html`<button type="button" class="pcard" style="text-align:left;cursor:pointer;${done ? 'opacity:.6' : ''}" data-act="app.stop" data-tour="${t.id}" data-key="${s.key}"><div class="row" style="flex-wrap:nowrap"><span class="n" style="width:26px;height:26px;border-radius:${s.kind === 'D' ? '7px' : '50%'};background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-weight:800;font-size:.8rem;flex:none">${i + 1}</span><div class="grow"><b>${s.kind === 'P' ? 'Abholung' : 'Zustellung'} · ${s.addr.city}</b><div class="tiny muted">${s.addr.name}, ${s.addr.street}</div><div class="tiny muted">${s.addr.from}–${s.addr.to} Uhr · ${s.orderId}</div></div><div class="right tiny">${done ? html`<b class="up">${done === 'wartet' ? 'Sync …' : hhmm(done)}</b>` : html`<b>${hhmm(s.eta)}</b>${s.late ? html`<div class="down">+${s.lateMin} Min.</div>` : arr ? html`<div class="up">vor Ort</div>` : ''}`}</div></div></button>`;
}
function appTours(d) {
  const T = today();
  const tours = DB.tours.filter((t) => t.driverId === d.id && (t.status !== 'abgeschlossen' ? diffDays(t.date, T) <= 1 : t.date === T)).sort((a, b) => a.date.localeCompare(b.date));
  return html`${appTop(d, `Hallo ${d.name.split(' ')[0]}`)}<div class="phone-body">
    ${tours.length ? tours.map((t) => { const sch = scheduleTour(t); const open = sch.stops.filter((s) => !stopDone(t, s.key)).length; return html`<section class="stack"><div class="pcard big"><div class="row" style="justify-content:space-between"><b>${t.id}</b>${chip(t.status === 'geplant' ? 'Geplant' : t.status === 'unterwegs' ? 'Unterwegs' : 'Abgeschlossen', t.status === 'geplant' ? 'blue' : t.status === 'unterwegs' ? 'violet' : 'green')}</div><div class="tiny muted">${fDay(t.date)} · ${(veh(t.vehicleId) || {}).plate} · ${nf(sch.totalKm)} km · ${open} von ${sch.stops.length} Stopps offen</div>
        ${t.status === 'geplant' && t.date === T ? html`<button type="button" class="p-btn mt-s" data-act="app.start" data-tour="${t.id}">${ic('truck')} Tour starten</button>` : t.status === 'geplant' ? html`<p class="tiny muted">Start geplant ${t.startTime} Uhr</p>` : ''}</div>
        ${sch.stops.map((s, i) => stopRow(t, s, i))}</section>`; }) : html`<div class="pcard big">${empty('Keine Tour', 'Für dich ist heute keine Tour eingeplant.')}</div>`}</div>${appNav('tours')}`;
}
function appStop(d) {
  const t = tour(A_().tourId); const key = A_().key; if (!t || !key) { A_().screen = 'tours'; return appTours(d); }
  const sch = scheduleTour(t); const s = sch.stops.find((x) => x.key === key); if (!s) { A_().screen = 'tours'; return appTours(d); }
  const o = s.order, done = stopDone(t, key), arr = stopArrived(t, key), P = s.kind === 'P';
  const pickedUp = !!stopDone(t, o.id + ':P');
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.addr.street}, ${s.addr.zip} ${s.addr.city}`)}&travelmode=driving`;
  return html`${appTop(d, `${P ? 'Abholung' : 'Zustellung'} · ${s.addr.city}`, true)}<div class="phone-body">
    <div class="pcard big"><b>${s.addr.name}</b><div>${s.addr.street}<br>${s.addr.zip} ${s.addr.city}</div><div class="tiny muted">Zeitfenster ${s.addr.from}–${s.addr.to} Uhr · ETA ${done ? '–' : hhmm(s.eta)}${s.late ? ' (verspätet)' : ''}</div>
      <div class="row gap-s mt-s"><a class="btn sm primary" href="${nav}" target="_blank" rel="noopener">${ic('pin')} Navigation starten</a>${s.addr.phone ? html`<a class="btn sm" href="tel:${s.addr.phone.replace(/\s/g, '')}">${ic('phone')} ${s.addr.contact || 'Anrufen'}</a>` : ''}</div></div>
    <div class="pcard"><b>${o.nr} · ${custName(o.customerId)}</b><div class="tiny">${o.goods.desc}</div><div class="tiny muted">${o.goods.pieces} Packstücke${o.goods.pallets ? ` (${o.goods.pallets} Paletten)` : ''} · ${nf(o.goods.weight, 1)} kg${o.extras.length ? ' · ' + o.extras.map(extraName).join(', ') : ''}</div>${o.note ? html`<div class="notice tone-amber mt-s">${ic('alert')}<div>${o.note}</div></div>` : ''}</div>
    ${done ? html`<div class="notice tone-green">${ic('check')}<div><b>${P ? 'Abholung' : 'Zustellung'} erledigt</b>${done === 'wartet' ? ' (wartet auf Synchronisation)' : ' um ' + hhmm(done) + ' Uhr'}.</div></div>`
    : html`
      ${arr ? html`<div class="notice tone-blue">${ic('check')}<div>Ankunft gemeldet${arr === 'wartet' ? ' (Sync …)' : ' um ' + hhmm(arr)} Uhr.</div></div>` : html`<button type="button" class="p-btn alt" data-act="app.arrive" data-tour="${t.id}" data-key="${key}">${ic('pin')} Ankunft melden</button>`}
      ${P ? html`<div class="pcard"><label class="fld"><span>Geladene Packstücke (Soll ${o.goods.pieces})</span><input type="number" min="0" inputmode="numeric" data-app-in="count" value="${APPST.count !== '' ? APPST.count : o.goods.pieces}"></label>
        ${photoBox()}<button type="button" class="p-btn good" data-act="app.pickup" data-tour="${t.id}" data-key="${key}">${ic('check')} Abholung bestätigen</button></div>`
      : html`${!pickedUp ? notice('amber', 'Dieser Auftrag wurde noch nicht abgeholt. Zustellung erst nach der Abholung möglich.') : ''}<div class="pcard"><label class="fld"><span>Name des Empfängers</span><input data-app-in="name" value="${APPST.name || o.delivery.contact || ''}" placeholder="Wer hat unterschrieben?" autocomplete="off"></label>
        <div><div class="fld"><span>Unterschrift</span></div><canvas class="sig" id="sigpad" width="480" height="200" aria-label="Unterschriftsfeld, mit Finger oder Maus zeichnen"></canvas><button type="button" class="btn sm ghost" data-act="app.sig.clear">Löschen</button></div>
        ${photoBox()}<label class="fld"><span>Notiz (optional)</span><input data-app-in="note" value="${APPST.note}" placeholder="z. B. Ablageort"></label>
        <button type="button" class="p-btn good" data-act="app.deliver" data-tour="${t.id}" data-key="${key}" ${pickedUp ? '' : raw('disabled')}>${ic('check')} Zustellung bestätigen</button>
        <button type="button" class="p-btn alt" data-act="app.notmet" data-tour="${t.id}" data-key="${key}">Empfänger nicht angetroffen</button></div>`}`}
    <div class="pcard"><b>Weitere Meldungen</b><div class="row gap-s"><label class="btn sm" style="cursor:pointer">${ic('upload')} Lieferschein<input type="file" accept="image/*,application/pdf" data-app-doc="${key}" hidden></label><button type="button" class="btn sm" data-act="app.damage" data-key="${key}">${ic('alert')} Schaden</button><button type="button" class="btn sm" data-act="app.delay" data-tour="${t.id}">${ic('clock')} Verspätung</button></div></div></div>${appNav('tours')}`;
}
const photoBox = () => html`<div><div class="fld"><span>Fotos (${APPST.photos.length})</span></div><div class="thumbs">${APPST.photos.map((p) => html`<img src="${p}" alt="Foto">`)}<label class="btn" style="cursor:pointer;height:68px;width:68px;flex-direction:column;gap:2px;font-size:.7rem">${ic('camera')}Foto<input type="file" accept="image/*" capture="environment" data-app-photo hidden></label></div></div>`;
function appChat(d) {
  let th = DB.threads.find((x) => x.kind === 'fahrer' && x.refId === d.id);
  if (th) th.appSeen = NOW();
  return html`${appTop(d, 'Disposition')}<div class="phone-body" style="justify-content:flex-end">${th && th.msgs.length ? th.msgs.map((m) => { const mine = m.kind === 'fahrer'; return html`<div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:85%;background:${mine ? 'var(--accent)' : 'var(--panel)'};color:${mine ? 'var(--accent-ink)' : 'inherit'};border:1px solid var(--line);border-radius:16px;padding:8px 12px"><div class="tiny" style="opacity:.75">${mine ? 'Du' : m.from} · ${hhmm(m.ts)}</div>${m.text}</div>`; }) : html`<p class="muted tiny" style="text-align:center">Noch keine Nachrichten.</p>`}</div>
    <form data-submit="app.msg" class="row" style="padding:8px 10px;border-top:1px solid var(--line);flex-wrap:nowrap"><input name="text" required placeholder="Nachricht an die Disposition" aria-label="Nachricht" style="flex:1"><button class="btn primary">${ic('arrow')}<span class="sr">Senden</span></button></form>${appNav('chat')}`;
}
onSubmit('app.msg', null, (f) => { appDo('msg', null, null, { text: f.text.trim() }); });
function appMore(d) {
  const pushes = DB.notifs.filter((n) => n.text.startsWith('Push an ' + d.name)).slice(0, 6);
  return html`${appTop(d, 'Mehr')}<div class="phone-body">
    <div class="pcard"><b>${d.name}</b><div class="tiny muted">${(veh(d.vehicleId) || {}).plate || 'kein Fahrzeug'} · ${branchName(d.branch)}</div></div>
    <div class="pcard"><label class="switch"><input type="checkbox" data-act="app.offline" ${A_().offline ? raw('checked') : ''}><i></i><span><b>Offline-Modus testen</b><br><small class="muted">Aktionen werden gespeichert und später gesendet.</small></span></label>
      ${DB.appQueue.length ? html`<ul class="list">${DB.appQueue.map((a) => html`<li>${chip(a.type, 'amber')}<div class="grow tiny">${a.key || 'Chat'} · ${hhmm(a.ts)}</div></li>`)}</ul><button type="button" class="p-btn" data-act="app.sync" ${A_().offline ? raw('disabled') : ''}>${ic('refresh')} Jetzt synchronisieren</button>` : html`<p class="tiny muted">Keine Aktionen in der Warteschlange.</p>`}</div>
    <div class="pcard"><b>Mitteilungen</b>${pushes.length ? html`<ul class="list">${pushes.map((n) => html`<li><div class="grow tiny">${n.text.replace(/^Push an [^:]+: /, '')}<div class="muted">${rel(n.ts)}</div></div></li>`)}</ul>` : html`<p class="tiny muted">Keine Mitteilungen.</p>`}</div>
    <div class="pcard"><b>Datenschutz</b><p class="tiny muted">${d.consent ? 'Deine Position wird nur während einer laufenden Tour an die Disposition und die Kundenansicht übermittelt. Du kannst die Einwilligung bei der Disposition widerrufen.' : 'Du hast der Standortübermittlung nicht zugestimmt. Es werden keine Positionsdaten gezeigt.'}</p></div>
    <button type="button" class="p-btn alt" data-act="app.logout">Abmelden</button></div>${appNav('more')}`;
}
view('fahrer-app', {
  title: 'Fahrer-App',
  render() {
    const d = appDriver(); const sc = d ? A_().screen || 'tours' : 'login';
    const screen = !d ? appLogin() : sc === 'stop' ? appStop(d) : sc === 'chat' ? appChat(d) : sc === 'more' ? appMore(d) : appTours(d);
    const feed = DB.audit.filter((a) => /Fahrer-App/.test(a.user) || /Fahrer-App/.test(a.text)).slice(0, 7);
    const th = d && DB.threads.find((x) => x.kind === 'fahrer' && x.refId === d.id);
    return html`${pageHead('Fahrer-App', 'Simulation der mobilen App für Fahrer. Aktionen hier erscheinen sofort in Disposition, Sendungsverfolgung und Kundenansicht.', html`<a class="btn" href="#/dispo">${ic('route')} Disposition</a>`)}
      <div class="app-wrap"><div class="phone" role="region" aria-label="Fahrer-App Simulation">${screen}</div>
        <div class="stack">
          <section class="card"><div class="card-h"><h2>So probierst du es aus</h2></div><ol style="margin:0;padding-left:20px;display:grid;gap:6px"><li>Mit einem Fahrer anmelden (PIN 1234). <b>Emre Kaya</b> oder <b>Lars Petersen</b> haben laufende Touren.</li><li>Einen Stopp öffnen, Ankunft melden, Abholung oder Zustellung bestätigen. Bei der Zustellung unterschreiben.</li><li>Den Offline-Modus einschalten, Stopps bestätigen und danach synchronisieren.</li><li>Dann in <a href="#/tracking">Sendungsverfolgung</a> oder <a href="#/auftraege">Aufträge</a> den neuen Status ansehen.</li></ol><p class="note-demo mt-s">Die App läuft hier im Browser. Eine native App mit Hintergrund-GPS, Push und Kamera-Zugriff braucht einen eigenen Build.</p></section>
          <section class="card"><div class="card-h"><h2>Live bei der Disposition</h2></div>${feed.length ? html`<ul class="list feed">${feed.map((a) => html`<li><div class="grow"><b>${a.ref}</b> · ${a.text}<div class="tiny muted">${a.user} · ${rel(a.ts)}</div></div></li>`)}</ul>` : empty('Noch keine Aktionen', 'Bestätige einen Stopp in der App.')}</section>
          ${d ? html`<section class="card"><div class="card-h"><h2>Als Disposition antworten</h2></div><form data-submit="app.reply" class="row" style="flex-wrap:nowrap"><input name="text" required placeholder="Nachricht an ${d.name.split(' ')[0]} …" aria-label="Antwort an Fahrer" style="flex:1"><button class="btn primary">Senden</button></form>${th ? html`<p class="tiny muted mt-s">${th.msgs.length} Nachrichten im Verlauf.</p>` : ''}</section>` : ''}
        </div></div>`;
  },
  after() {
    const c = $('#sigpad'); if (!c) return;
    const ctx = c.getContext('2d'); ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0D1233';
    if (APPST.sig) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = APPST.sig; }
    let drawing = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
    c.addEventListener('pointerdown', (e) => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); });
    c.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
    const end = () => { if (!drawing) return; drawing = false; APPST.sig = c.toDataURL('image/png'); };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  },
});
VIEWS['fahrer-app'].form = () => A_().screen === 'stop' && !!appDriver();
VIEWS['fahrer-app'].live = false;
onSubmit('app.reply', null, (f) => {
  const d = appDriver(); let th = DB.threads.find((x) => x.kind === 'fahrer' && x.refId === d.id);
  if (!th) { th = { id: uid('th'), kind: 'fahrer', title: `${d.name} (${(veh(d.vehicleId) || {}).plate || ''})`, refId: d.id, orderId: null, unread: 0, msgs: [] }; DB.threads.unshift(th); }
  th.msgs.push({ id: uid('m'), from: curUser().name, text: f.text.trim(), ts: NOW(), kind: 'intern' }); pushNotif(`Push an ${d.name}: Neue Nachricht der Disposition.`, 'info'); commit(); toast('Nachricht gesendet. In der App erscheint sie im Chat.', 'ok');
});

/* ---------- Bedienung ---------- */
document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.appIn; if (k) APPST[k] = e.target.value; });
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.matches('[data-app-photo]')) { const p = await shrinkImage(el.files[0]); if (p) { APPST.photos.push(p); render(); } }
  if (el.matches('[data-app-doc]')) {
    const file = el.files[0]; if (!file) return; const t = tour(A_().tourId);
    const data = /^image\//.test(file.type) ? { name: file.name, size: file.size, data: await shrinkImage(file) } : await readFileSmall(file);
    appDo('doc', t.id, el.dataset.appDoc, data); toast(`Lieferschein „${file.name}“ hochgeladen.`, 'ok');
  }
});
const appGo = (screen, extra) => { Object.assign(A_(), { screen }, extra || {}); saveSess(); if (screen !== 'stop') appRst(); render(); };
act('app.nav', null, (d) => appGo(d.s));
act('app.back', null, () => appGo('tours'));
act('app.stop', null, (d) => { appRst(); appGo('stop', { tourId: d.tour, key: d.key }); });
act('app.logout', null, () => { secLog('Fahrer-App Abmeldung', ''); A_().driverId = null; A_().screen = 'login'; saveSess(); render(); });
act('app.offline', null, (d, el) => {
  const goOffline = el.type === 'checkbox' ? el.checked : !A_().offline;
  A_().offline = goOffline; saveSess();
  if (!goOffline && DB.appQueue.length) syncQueue(); else { render(); toast(goOffline ? 'Offline-Modus an.' : 'Wieder online.'); }
});
act('app.sync', null, () => syncQueue());
act('app.start', null, (d) => appDo('start', d.tour, null));
act('app.arrive', null, (d) => appDo('arrive', d.tour, d.key));
act('app.pickup', null, (d) => { const c = APPST.count; appDo('pickup', d.tour, d.key, { photos: APPST.photos.slice(), count: c === '' ? undefined : +c }); appRst(); toast('Abholung bestätigt.', 'ok'); });
act('app.deliver', null, (d) => {
  const name = (APPST.name || '').trim(); const empty_ = !APPST.sig;
  if (!name) return toast('Bitte den Namen des Empfängers eintragen.', 'bad');
  if (empty_) return toast('Bitte lass den Empfänger unterschreiben.', 'bad');
  appDo('deliver', d.tour, d.key, { name, sig: APPST.sig, photos: APPST.photos.slice(), note: APPST.note }); appRst(); toast('Zustellung bestätigt.', 'ok');
});
act('app.notmet', null, (d) => { appDo('notmet', d.tour, d.key, { note: APPST.note }); appRst(); toast('Meldung an die Disposition gesendet.', 'ok'); });
act('app.delay', null, (d) => openModal({ title: 'Verspätung melden', form: 'app.delay', cls: 'small', body: html`<input type="hidden" name="tour" value="${d.tour}"><div class="stack">${fld('Verzögerung', 'min', '30', { type: 'select', options: [['15', '15 Minuten'], ['30', '30 Minuten'], ['45', '45 Minuten'], ['60', '1 Stunde'], ['90', '1,5 Stunden']] })}${fld('Grund', 'reason', 'Verkehr', { type: 'select', options: ['Verkehr', 'Wartezeit beim Abholen', 'Fahrzeugproblem', 'Wetter', 'Sonstiges'] })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Melden</button>` }));
onSubmit('app.delay', null, (f) => { closeModal(); appDo('delay', f.tour, null, { min: +f.min, reason: f.reason }); toast('Verspätung gemeldet. Kunden werden informiert.', 'ok'); });
act('app.damage', null, (d) => openModal({ title: 'Schaden melden', form: 'app.damage', cls: 'small', body: html`<input type="hidden" name="key" value="${d.key}"><div class="stack">${fld('Was ist passiert?', 'text', '', { type: 'textarea', req: true })}${fld('Fotos (optional)', 'files', '', { type: 'file', attrs: 'accept="image/*" multiple' })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Melden</button>` }));
onSubmit('app.damage', null, async (f) => { const photos = []; for (const file of Array.from(f.files || []).slice(0, 3)) { const p = await shrinkImage(file); if (p) photos.push(p); } closeModal(); appDo('damage', A_().tourId, f.key, { text: f.text.trim(), photos }); toast('Schaden gemeldet. Es wurde eine Reklamation angelegt.', 'ok'); });
act('app.sig.clear', null, () => { APPST.sig = null; const c = $('#sigpad'); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); });
