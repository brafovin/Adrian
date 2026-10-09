'use strict';
/* JWG.logistik – Sendungsverfolgung (intern und öffentlich), Kommunikation, Reklamationen */

const findOrderByNo = (s) => { s = String(s || '').trim().toLowerCase(); if (!s) return null; return DB.orders.find((o) => [o.tracking, o.nr, o.ref, o.shopNo].some((x) => x && String(x).toLowerCase() === s)) || null; };
const etaWord = (o) => {
  const eta = orderEta(o);
  if (o.status === 'storniert') return 'Storniert';
  if (isDone(o)) return `Zugestellt am ${fDT(o.pod && o.pod.ts)}`;
  if (eta) return `${hhmm(eta.eta)} Uhr${eta.late ? ` (${eta.lateMin} Min. nach Zeitfenster)` : ''}`;
  if (o.carrier && o.carrier.status === 'angenommen') return `Abholung durch Frachtführer geplant`;
  return `geplant ${fDay(o.delivery.date)}`;
};
function trackPanel(o, pub) {
  const eta = orderEta(o), t = o.tourId && tour(o.tourId), d = t && drv(t.driverId);
  const live = t && t.status === 'unterwegs' && !['zugestellt', 'abgeschlossen', 'storniert'].includes(o.status);
  const share = live && o.locShare && d && d.consent;
  const tp = share ? tourPosition(t) : null;
  const before = share ? scheduleTour(t).stops.filter((s) => !s.done && s.kind === 'D').findIndex((s) => s.orderId === o.id) : -1;
  const pts = [{ lat: o.pickup.lat, lon: o.pickup.lon, label: 'Abholung ' + o.pickup.city, color: '#FFB020', mark: 'A' }, { lat: o.delivery.lat, lon: o.delivery.lon, label: 'Zustellung ' + o.delivery.city, color: '#27D3A2', mark: 'Z' }];
  const veh_ = tp ? [{ lat: tp.pos.lat, lon: tp.pos.lon, label: 'Fahrzeug', color: '#FF5A47' }] : [];
  const lines = [[{ lat: o.pickup.lat, lon: o.pickup.lon }, { lat: o.delivery.lat, lon: o.delivery.lon }, '#6B7699']];
  const ev = o.history.filter((h) => h.status || h.text).slice().reverse();
  return html`<div class="grid g21">
    <div class="stack">
      <section class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="mono tiny muted">Sendungsnummer</div><b style="font-family:var(--font-display);font-size:2.2rem;line-height:1">${o.tracking}</b></div>${statusChip(o.status)}</div>
        <dl class="mt"><div class="kv"><dt>Von</dt><dd>${o.pickup.city}</dd></div><div class="kv"><dt>Nach</dt><dd>${o.delivery.city}${pub ? '' : html` · ${o.delivery.name}`}</dd></div>
        <div class="kv"><dt>Geplante Zustellung</dt><dd>${fDay(o.delivery.date)}, ${o.delivery.from}–${o.delivery.to} Uhr</dd></div>
        <div class="kv"><dt>${isDone(o) ? 'Zugestellt' : 'Voraussichtlich (ETA)'}</dt><dd><b>${etaWord(o)}</b>${eta && eta.late ? html` ${chip('Verspätung', 'red')}` : eta ? html` ${chip('im Zeitfenster', 'green')}` : ''}</dd></div>
        ${o.flags && o.flags.delay && !isDone(o) ? html`<div class="kv"><dt>Hinweis</dt><dd>${chip('Verzögerung', 'amber')} ca. ${o.flags.delay.min} Minuten (${o.flags.delay.reason})</dd></div>` : ''}
        ${share && before >= 0 ? html`<div class="kv"><dt>Noch vor dir</dt><dd>${before === 0 ? 'Du bist als Nächstes dran.' : `${before} Zustellung${before > 1 ? 'en' : ''}`}</dd></div>` : ''}
        <div class="kv"><dt>Packstücke</dt><dd>${o.goods.pieces} · ${nf(o.goods.weight, 1)} kg</dd></div></dl>
        ${stepper(o)}</section>
      <section class="card"><div class="card-h"><h2>Sendungsverlauf</h2></div><ol class="tl">${ev.map((h, i) => html`<li class="${i === 0 ? 'now' : 'on'}"><time>${fDT(h.ts)}${pub ? '' : ' · ' + h.by}</time><b>${pub ? pubText(h) : h.text}</b></li>`)}</ol></section>
      ${o.pod ? html`<section class="card"><div class="card-h"><h2>Liefernachweis</h2></div><p>Empfangen von <b>${pub ? o.pod.name.replace(/^(\S)\S*\s/, '$1. ') : o.pod.name}</b> am ${fDT(o.pod.ts)}.</p>${o.pod.sig ? html`<div class="mt-s"><img class="sig-img" alt="Unterschrift" src="${o.pod.sig}" style="max-height:90px;background:#fff;border-radius:8px;border:1px solid var(--line)"></div>` : ''}${!pub && (o.pod.photos || []).length ? html`<div class="thumbs mt-s">${o.pod.photos.map((p) => html`<img src="${p}" alt="Foto">`)}</div>` : ''}</section>` : ''}
    </div>
    <aside class="stack"><section class="card"><div class="card-h"><h2>Standort</h2></div>
      ${mapSVG({ points: pts, lines, vehicles: veh_, fit: true, ratio: 1.15, label: 'Sendungsstrecke' })}
      ${live && !share ? html`<p class="note-demo mt-s">Der Live-Standort ist ${o.locShare ? 'für diesen Fahrer nicht freigegeben' : 'für diese Sendung ausgeschaltet'}. Du siehst nur den Status.</p>` : share ? html`<p class="tiny muted mt-s">Fahrzeug ${tp.state}. Schematische Karte, Position wird simuliert.</p>` : ''}</section>
      ${pub ? '' : html`<section class="card"><div class="card-h"><h2>Aktionen</h2></div><div class="stack">
        <a class="btn block" href="${`#/track/${o.tracking}`}" target="_blank" rel="noopener">${ic('external')} Öffentliche Sendungsseite öffnen</a>
        <button type="button" class="btn block" data-act="track.copy" data-nr="${o.tracking}">${ic('copy')} Tracking-Link kopieren</button>
        ${canWrite('tracking') ? html`<button type="button" class="btn block" data-act="track.notify" data-id="${o.id}">${ic('mail')} Kunden benachrichtigen</button><button type="button" class="btn block" data-act="track.delay" data-id="${o.id}" ${isDone(o) ? raw('disabled') : ''}>${ic('clock')} Verspätung melden</button>` : ''}
        <a class="btn block ghost" href="#/auftraege/${o.id}">Zum Auftrag ${o.nr}</a></div></section>`}
    </aside></div>`;
}
function pubText(h) {
  const m = { offen: 'Sendung angelegt', geplant: 'Abholung eingeplant', abgeholt: 'Sendung abgeholt', in_zustellung: 'In Zustellung', zugestellt: 'Zugestellt', abgeschlossen: 'Zugestellt', storniert: 'Storniert', entwurf: 'Sendung angelegt' };
  const city = /in ([^,()]+)/.exec(h.text);
  return (m[h.status] || 'Statusupdate') + (h.status === 'abgeholt' || h.status === 'in_zustellung' ? (city ? ` in ${city[1].trim()}` : '') : '');
}
act('track.copy', null, (d) => { const link = trackLink(d.nr); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Tracking-Link kopiert.', 'ok'), () => toast(link)); });
act('track.notify', 'tracking', (d) => { const o = ord(d.id); openModal({ title: `Kunden benachrichtigen: ${o.nr}`, form: 'track.notify', cls: 'small', body: html`<input type="hidden" name="id" value="${o.id}"><div class="stack">${fld('Vorlage', 'tpl', 'status', { type: 'select', options: [['status', 'Statusmeldung'], ['confirm', 'Auftragsbestätigung'], ['reminder', 'Erinnerung Abholung']] })}${fld('Empfänger', 'to', o.notifyEmail || ((cust(o.customerId) || {}).contacts || [{}])[0].email || '', { type: 'email', req: true })}</div><p class="note-demo mt">Die Nachricht landet im Versandprotokoll. Es wird keine echte E-Mail verschickt.</p>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">${ic('mail')} Senden</button>` }); });
onSubmit('track.notify', 'tracking', (f) => { const o = ord(f.id); o.notifyEmail = f.to; queueMail(f.tpl, o); audit('Auftrag', o.nr, 'Kundenbenachrichtigung', f.tpl); closeModal(); commit(); toast('Benachrichtigung im Versandprotokoll abgelegt.', 'ok'); });
act('track.delay', 'tracking', (d) => { const o = ord(d.id); openModal({ title: `Verspätung melden: ${o.nr}`, form: 'track.delay', cls: 'small', body: html`<input type="hidden" name="id" value="${o.id}"><div class="stack">${fld('Verzögerung (Minuten)', 'min', 30, { type: 'number', min: 5, step: '5', req: true })}${fld('Grund', 'reason', 'Verkehr', { type: 'select', options: ['Verkehr', 'Wartezeit beim Abholen', 'Fahrzeugproblem', 'Wetter', 'Sonstiges'] })}<label class="chk"><input type="checkbox" name="mail" checked><span>Kunden per E-Mail informieren</span></label></div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Melden</button>` }); });
onSubmit('track.delay', 'tracking', (f) => { const o = ord(f.id); o.flags.delay = { min: +f.min, reason: f.reason, ts: NOW() }; addHistory(o, o.status, `Verspätung gemeldet: ca. ${f.min} Min. (${f.reason})`); const e = orderEta(o); if (f.mail) queueMail('delay', o, { minuten: f.min, eta: e ? hhmm(e.eta + f.min * 60000) + ' Uhr' : '–' }); audit('Auftrag', o.nr, 'Verspätung', `${f.min} Min.`); closeModal(); commit(); toast('Verspätung erfasst.', 'ok'); });

view('tracking', {
  mod: 'tracking', title: 'Sendungsverfolgung', live: true,
  render(seg, q) {
    const nr = q.get('nr') || fv('tr.nr'); const o = findOrderByNo(nr);
    const act_ = scoped(DB.orders).filter((x) => ['abgeholt', 'in_zustellung', 'geplant'].includes(x.status));
    const cols = [{ k: 't', t: 'Sendung', cls: 'nw', f: (x) => html`<a href="#/tracking?nr=${x.tracking}" class="mono">${x.tracking}</a>`, s: (x) => x.tracking }, { k: 'n', t: 'Auftrag', cls: 'nw', f: (x) => x.nr, s: (x) => x.nr }, { k: 'r', t: 'Strecke', f: (x) => route(x), s: (x) => x.pickup.city }, { k: 's', t: 'Status', cls: 'nw', f: (x) => statusChip(x.status), s: (x) => x.status, x: (x) => stat(x.status).name }, { k: 'e', t: 'ETA', cls: 'nw', f: (x) => { const e = orderEta(x); return e ? html`${hhmm(e.eta)} Uhr${e.late ? html` ${chip('+' + e.lateMin + ' Min.', 'red')}` : ''}` : '–'; }, s: (x) => { const e = orderEta(x); return e ? e.eta : 0; }, x: (x) => etaWord(x) }];
    return html`${pageHead('Sendungsverfolgung', 'Status, ETA, Standort und Verlauf jeder Sendung. Mit der Sendungsnummer, Auftragsnummer oder Shop-Bestellnummer suchen.', html`<a class="btn" href="#/track">${ic('external')} Öffentliche Seite</a>`)}
      <form data-submit="track.search" class="row mb" role="search"><label class="fld grow" style="max-width:480px"><span class="sr">Sendungsnummer</span><input name="nr" value="${nr || ''}" placeholder="z. B. JWG-1DP7H, A-2026-0021 oder JWG-12345" required autocomplete="off"></label><button class="btn primary">${ic('search')} Suchen</button></form>
      ${nr && !o ? notice('amber', html`Zu „${nr}“ wurde keine Sendung gefunden. Prüfe die Schreibweise oder suche über die Liste unten.`) : ''}
      ${o ? trackPanel(o, false) : html`<div class="card-h"><h2>Aktive Sendungen (${act_.length})</h2></div>${table('track', cols, act_, { sort: { k: 'e', dir: 1 }, name: 'sendungen', noun: 'Sendungen' })}`}`;
  },
});
onSubmit('track.search', null, (f) => { UI.f['tr.nr'] = f.nr.trim(); location.hash = `#/tracking?nr=${encodeURIComponent(f.nr.trim())}`; });

/* Öffentliche Sendungsverfolgung ohne Anmeldung */
view('track', {
  layout: 'public', title: 'Sendungsverfolgung', live: true,
  render(seg) {
    const nr = seg[0] || ''; const o = findOrderByNo(nr);
    return html`<header class="pub-top"><a class="brand" href="#/track" style="color:#fff;text-decoration:none"><svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#2340E6"/><path d="M7 22h9a4.5 4.5 0 0 0 0-9h-1a4.5 4.5 0 0 1 0-9h10" fill="none" stroke="#FFD23F" stroke-width="3" stroke-linecap="round"/></svg><span><b>JWG.logistik</b><small>Sendungsverfolgung</small></span></a><nav aria-label="Navigation"><a href="#/portal">Kundenportal</a><a href="../onlineshop/">JWG.onlineshop</a><a href="#/dashboard">Zur Verwaltung</a></nav></header>
      <div class="pub-main">
        <section class="hero-track"><h1>Wo ist meine Sendung?</h1><p>Gib die Sendungsnummer aus deiner Versandbestätigung ein. Du brauchst keine Anmeldung.</p>
          <form data-submit="track.public" role="search"><label class="sr" for="pubnr">Sendungsnummer</label><input id="pubnr" name="nr" value="${nr}" placeholder="z. B. JWG-1DP7H" required autocomplete="off"><button class="btn">${ic('search')} Verfolgen</button></form></section>
        ${nr && !o ? notice('amber', html`Zur Nummer „${nr}“ wurde keine Sendung gefunden. Bitte prüfe die Eingabe. Die Nummer beginnt mit „JWG-“.`) : ''}
        ${o ? trackPanel(o, true) : !nr ? html`<div class="card">${empty('Noch keine Nummer eingegeben', html`Beispiel: <a href="#/track/${(DB.orders.find((x) => x.status === 'abgeholt') || DB.orders[0]).tracking}">${(DB.orders.find((x) => x.status === 'abgeholt') || DB.orders[0]).tracking}</a>`)}</div>` : ''}
        <p class="tiny muted mt">Dies ist eine Demo mit Beispieldaten. Die Seite zeigt öffentlich nur Orte, keine Straßen und keine Kundennamen.</p>
      </div>`;
  },
});
onSubmit('track.public', null, (f) => { location.hash = `#/track/${encodeURIComponent(f.nr.trim())}`; });

/* ---------- Kommunikation ---------- */
const THREAD_KINDS = { fahrer: ['Fahrer', 'violet'], kunde: ['Kunde', 'blue'], partner: ['Frachtführer', 'amber'], intern: ['Intern', 'gray'] };
view('komm', {
  mod: 'komm', title: 'Kommunikation', live: true,
  render(seg, q) {
    const tl = [['p', 'Postfach'], ['o', 'Versandprotokoll'], ['a', 'Vorlagen und Automatik'], ['e', 'Erinnerungen']];
    const cur = UI.tab['komm'] || 'p';
    const w = canWrite('komm');
    let body;
    if (cur === 'p') {
      const sel = DB.threads.find((t) => t.id === (q.get('t') || fv('komm.t'))) || null;
      const kind = fv('komm.k');
      const list = DB.threads.filter((t) => !kind || t.kind === kind).sort((a, b) => ((b.msgs.slice(-1)[0] || {}).ts || 0) - ((a.msgs.slice(-1)[0] || {}).ts || 0));
      body = html`<div class="seg mb" role="group" aria-label="Filter">${[['', 'Alle'], ...Object.entries(THREAD_KINDS).map(([k, v]) => [k, v[0]])].map(([k, l]) => html`<button type="button" aria-pressed="${kind === k}" data-act="komm.kind" data-k="${k}">${l}</button>`)}</div>
        <div class="grid g12" style="grid-template-columns:minmax(260px,1fr) minmax(0,2fr);align-items:start">
          <section class="card tight" aria-label="Unterhaltungen"><ul class="list" style="padding:4px 0">${list.length ? list.map((t) => { const last = t.msgs.slice(-1)[0] || {}; return html`<li style="padding:0"><button type="button" data-act="komm.open" data-id="${t.id}" class="btn ghost block" style="justify-content:flex-start;text-align:left;border:0;border-radius:0;padding:10px 14px;${sel && sel.id === t.id ? 'background:var(--accent-soft)' : ''}"><span class="grow" style="min-width:0"><b class="nw" style="display:block;overflow:hidden;text-overflow:ellipsis">${t.title}</b><small class="muted nw" style="display:block;overflow:hidden;text-overflow:ellipsis">${last.from ? last.from + ': ' : ''}${last.text || '–'}</small></span><span>${chip(THREAD_KINDS[t.kind][0], THREAD_KINDS[t.kind][1])}${t.unread ? html` <span class="badge">${t.unread}</span>` : ''}</span></button></li>`; }) : html`<li>${empty('Keine Unterhaltungen')}</li>`}</ul>${w ? html`<div style="padding:10px"><button type="button" class="btn primary block" data-act="komm.new">${ic('plus')} Neue Nachricht</button></div>` : ''}</section>
          <section class="card" aria-label="Verlauf">${sel ? threadView(sel, w) : empty('Unterhaltung wählen', 'Wähle links einen Eintrag oder schreibe eine neue Nachricht.')}</section></div>`;
    } else if (cur === 'o') {
      body = table('outbox', [{ k: 't', t: 'Zeit', cls: 'nw', f: (m) => fDT(m.ts), s: (m) => m.ts }, { k: 'to', t: 'An', f: (m) => m.to, s: (m) => m.to }, { k: 's', t: 'Betreff', f: (m) => html`<a href="#" data-act="mail.open" data-id="${m.id}">${m.subject}</a>`, s: (m) => m.subject, x: (m) => m.subject }, { k: 'o', t: 'Auftrag', cls: 'nw', f: (m) => m.orderId ? html`<a href="#/auftraege/${m.orderId}">${m.orderId}</a>` : '–', s: (m) => m.orderId || '', x: (m) => m.orderId || '' }, { k: 'c', t: 'Kanal', f: (m) => m.channel, s: (m) => m.channel }], DB.outbox, { sort: { k: 't', dir: -1 }, name: 'versandprotokoll', noun: 'Nachrichten', empty: 'Noch keine Nachrichten versendet', emptySub: 'Statusmeldungen entstehen automatisch, sobald Sendungen abgeholt oder zugestellt werden.' }) + '';
      body = raw(body);
    } else if (cur === 'a') {
      const a = DB.settings.automation;
      const sw = (k, label, hint) => html`<li><label class="switch"><input type="checkbox" data-act="auto.toggle" data-k="${k}" ${a[k] ? raw('checked') : ''} ${canWrite('einstellungen') ? '' : raw('disabled')}><i></i><span><b>${label}</b><br><small class="muted">${hint}</small></span></label></li>`;
      body = html`<div class="grid g2"><section class="card"><div class="card-h"><h2>Automatische Nachrichten</h2></div><ul class="list">${sw('statusMail', 'Statusmeldungen an Kunden', 'bei Abholung, Zustellung und Auslieferung')}${sw('delayMail', 'Verspätungsmeldungen', 'sobald die ETA das Zeitfenster überschreitet')}${sw('reminder', 'Erinnerung vor Abholung', 'am Vortag an den Abholort')}${sw('pushDriver', 'Push an Fahrer', 'bei Tourstart und neuen Aufträgen')}</ul>${canWrite('einstellungen') ? '' : html`<p class="tiny muted mt-s">Änderungen nur mit Recht „Einstellungen“.</p>`}</section>
        <section class="card"><div class="card-h"><h2>Vorlagen</h2><a href="#/einstellungen">Bearbeiten</a></div><ul class="list">${DB.settings.templates.map((t) => html`<li>${ic('mail')}<div class="grow"><b>${t.name}</b><div class="tiny muted">${t.subject}</div></div></li>`)}</ul></section></div>`;
    } else {
      const T = today(), tm = addDays(T, 1);
      const due = DB.orders.filter((o) => ['offen', 'geplant'].includes(o.status) && (o.pickup.date === T || o.pickup.date === tm));
      body = html`<div class="card"><div class="card-h"><h2>Anstehende Abholungen (heute und morgen)</h2></div>${due.length ? html`<ul class="list">${due.map((o) => html`<li>${ic('clock')}<div class="grow"><a href="#/auftraege/${o.id}">${o.nr}</a> · ${custName(o.customerId)}<div class="tiny muted">${fDay(o.pickup.date)} ${o.pickup.from}–${o.pickup.to} · ${o.pickup.name}, ${o.pickup.city}</div></div>${DB.outbox.some((m) => m.kind === 'reminder' && m.orderId === o.id) ? chip('erinnert', 'green') : w ? html`<button type="button" class="btn sm" data-act="remind.send" data-id="${o.id}">${ic('mail')} Erinnern</button>` : ''}</li>`)}</ul>` : empty('Keine Abholungen in den nächsten zwei Tagen')}</div>`;
    }
    return html`${pageHead('Kommunikation', 'Nachrichten an Fahrer, Kunden und Frachtführer, automatische Meldungen und Erinnerungen.')}${tabs('komm', tl, 'p')}${body}`;
  },
});
VIEWS.komm.form = () => false;
const unreadThreads = () => DB.threads.reduce((s, t) => s + (t.unread || 0), 0);
function threadView(t, w) {
  const o = t.orderId && ord(t.orderId);
  return html`<div class="card-h"><div><h2>${t.title}</h2>${o ? html`<a class="tiny" href="#/auftraege/${o.id}">Auftrag ${o.nr} öffnen</a>` : ''}</div>${chip(THREAD_KINDS[t.kind][0], THREAD_KINDS[t.kind][1])}</div>
    <div class="stack" style="max-height:420px;overflow:auto;padding-right:6px" tabindex="0" aria-label="Nachrichten">${t.msgs.map((m) => { const mine = !m.kind || m.kind === 'intern'; return html`<div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:82%;background:${mine ? 'var(--accent-soft)' : 'var(--panel2)'};border:1px solid var(--line);border-radius:14px;padding:8px 12px"><div class="tiny muted"><b>${m.from}</b> · ${fDT(m.ts)}${m.channel ? ' · ' + m.channel : ''}</div><div>${m.text}</div></div>`; })}${t.msgs.length ? '' : empty('Noch keine Nachrichten')}</div>
    ${w ? html`<form data-submit="komm.send" class="stack mt"><input type="hidden" name="id" value="${t.id}"><div class="row"><label class="fld" style="flex:1 1 160px"><span>Kanal</span><select name="channel"><option value="Chat">Chat (intern)</option><option value="E-Mail">E-Mail (simuliert)</option><option value="Push">Push (simuliert)</option></select></label><label class="fld" style="flex:1 1 200px"><span>Vorlage einfügen</span><select data-tpl><option value="">– keine –</option>${DB.settings.templates.slice(0, 5).map((x) => html`<option value="${x.id}">${x.name}</option>`)}</select></label></div><label class="fld"><span>Nachricht</span><textarea name="text" rows="3" required></textarea></label><div class="row"><button class="btn primary">${ic('mail')} Senden</button>${o && t.kind === 'kunde' ? html`<button type="button" class="btn" data-act="track.delay" data-id="${o.id}">Verspätung melden</button>` : ''}</div></form>` : ''}`;
}
document.addEventListener('change', (e) => { if (e.target.matches('[data-tpl]') && e.target.value) { const f = e.target.closest('form'); const t = DB.settings.templates.find((x) => x.id === e.target.value); const th = DB.threads.find((x) => x.id === f.elements.id.value); const o = th && th.orderId && ord(th.orderId); f.elements.text.value = fillTpl(t.body, o ? mailCtx(o) : { firma: DB.settings.company.name }); } });
act('komm.kind', null, (d) => { UI.f['komm.k'] = d.k; render(); });
act('komm.open', null, (d) => { const t = DB.threads.find((x) => x.id === d.id); UI.f['komm.t'] = d.id; if (t && t.unread) { t.unread = 0; save(); } render(); });
onSubmit('komm.send', 'komm', (f) => {
  const t = DB.threads.find((x) => x.id === f.id);
  t.msgs.push({ id: uid('m'), from: curUser().name, text: f.text.trim(), ts: NOW(), kind: 'intern', channel: f.channel === 'Chat' ? '' : f.channel });
  if (f.channel === 'E-Mail') DB.outbox.unshift({ id: uid('mail'), ts: NOW(), to: t.title, subject: `Nachricht: ${t.title}`, body: f.text, orderId: t.orderId, kind: 'manual', channel: 'E-Mail (simuliert)' });
  if (f.channel === 'Push') pushNotif(`Push (${t.title}): ${f.text.trim().slice(0, 60)}`, 'info');
  commit(); toast('Nachricht gesendet.', 'ok');
});
act('komm.new', 'komm', () => openModal({ title: 'Neue Nachricht', form: 'komm.create', body: html`<div class="fgrid">${fld('An', 'kind', 'fahrer', { type: 'select', options: [['fahrer', 'Fahrer'], ['kunde', 'Kunde'], ['partner', 'Frachtführer'], ['intern', 'Intern (Team)']] })}
    ${fld('Fahrer', 'driver', DB.drivers[0].id, { type: 'select', options: DB.drivers.map((d) => [d.id, d.name]) })}${fld('Kunde', 'customer', DB.customers[0].id, { type: 'select', options: DB.customers.filter((c) => !c.archived).map((c) => [c.id, c.name]) })}${fld('Frachtführer', 'partner', DB.partners[0].id, { type: 'select', options: DB.partners.map((p) => [p.id, p.name]) })}
    ${fld('Zum Auftrag (optional)', 'order', '', { type: 'select', options: [['', '– keiner –'], ...DB.orders.filter((o) => o.status !== 'storniert').slice(0, 60).map((o) => [o.id, `${o.nr} · ${o.pickup.city} → ${o.delivery.city}`])], cls: 'wide' })}${fld('Nachricht', 'text', '', { type: 'textarea', req: true, cls: 'wide' })}</div><p class="tiny muted mt-s">Es wird der passende Empfänger je nach Auswahl „An“ verwendet.</p>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Senden</button>` }));
onSubmit('komm.create', 'komm', (f) => {
  const refId = { fahrer: f.driver, kunde: f.customer, partner: f.partner, intern: null }[f.kind];
  const name = { fahrer: (drv(f.driver) || {}).name, kunde: (cust(f.customer) || {}).name, partner: (par(f.partner) || {}).name, intern: 'Team' }[f.kind];
  let t = DB.threads.find((x) => x.kind === f.kind && x.refId === refId && (x.orderId || '') === (f.order || ''));
  if (!t) { t = { id: uid('th'), kind: f.kind, title: `${name}${f.order ? ' – ' + f.order : ''}`, refId, orderId: f.order || null, unread: 0, msgs: [] }; DB.threads.unshift(t); }
  t.msgs.push({ id: uid('m'), from: curUser().name, text: f.text.trim(), ts: NOW(), kind: 'intern' });
  UI.f['komm.t'] = t.id; UI.tab.komm = 'p'; closeModal(); commit(); toast('Nachricht gesendet.', 'ok');
});
act('mail.open', null, (d) => { const m = DB.outbox.find((x) => x.id === d.id); openModal({ title: m.subject, cls: 'small', body: html`<p class="tiny muted">An ${m.to} · ${fDT(m.ts)} · ${m.channel}</p><pre style="white-space:pre-wrap;font:inherit;margin-top:10px">${m.body}</pre>`, foot: html`<button type="button" class="btn primary" data-act="modal.close">Schließen</button>` }); });
act('auto.toggle', 'einstellungen', (d, el) => { DB.settings.automation[d.k] = el.checked; audit('Einstellung', 'Automatik', 'bearbeitet', `${d.k}: ${el.checked ? 'an' : 'aus'}`); commit(); });
act('remind.send', 'komm', (d) => { const o = ord(d.id); if (!o.notifyEmail) { const c = cust(o.customerId); o.notifyEmail = ((c.contacts || [{}])[0] || {}).email; } queueMail('reminder', o); commit(); toast('Erinnerung im Versandprotokoll abgelegt.', 'ok'); });

/* ---------- Reklamationen und Schäden ---------- */
const CLAIM_STATUS = { neu: ['Neu', 'red'], pruefung: ['In Prüfung', 'amber'], massnahme: ['Maßnahme eingeleitet', 'blue'], geloest: ['Gelöst', 'green'], abgelehnt: ['Abgelehnt', 'gray'] };
const claimChip = (s) => chip(...(CLAIM_STATUS[s] || [s, 'gray']));
const CLAIM_TYPES = ['Schaden', 'Fehlmenge', 'Verspätung', 'Falschlieferung', 'Sonstiges'];
function newClaim(f) {
  const o = ord(f.orderId);
  const nr = nextNo('claim');
  const c = { id: nr, nr, orderId: f.orderId, customerId: o ? o.customerId : f.customerId, type: f.type, text: f.text.trim(), status: 'neu', cost: +f.cost || 0, resp: f.resp || '', created: NOW(), photos: f.photos || [], actions: [], log: [{ ts: NOW(), text: 'Reklamation angelegt', by: curUserName() }] };
  DB.claims.unshift(c);
  if (o) addHistory(o, o.status, `Reklamation ${nr} angelegt (${f.type})`);
  audit('Reklamation', nr, 'erstellt', `${f.type}: ${f.text.slice(0, 60)}`);
  pushNotif(`Neue Reklamation ${nr}: ${f.type}${o ? ' zu ' + o.nr : ''}`, 'warn', `#/reklamation/${nr}`);
  return c;
}
view('reklamation', {
  mod: 'reklamation', title: 'Reklamationen',
  render(seg) {
    if (seg[0]) return claimDetail(seg[0]);
    const rows = DB.claims.filter((c) => (!fv('c.st') || c.status === fv('c.st')) && (!fv('c.type') || c.type === fv('c.type')) && (!fv('c.q') || [c.nr, c.text, c.orderId, custName(c.customerId)].join(' ').toLowerCase().includes(fv('c.q').toLowerCase())));
    const total = DB.orders.filter((o) => o.status !== 'storniert').length;
    const open = DB.claims.filter((c) => !['geloest', 'abgelehnt'].includes(c.status));
    const cols = [{ k: 'n', t: 'Nr.', cls: 'nw', f: (c) => html`<a href="#/reklamation/${c.id}">${c.nr}</a>`, s: (c) => c.nr }, { k: 't', t: 'Art', f: (c) => c.type, s: (c) => c.type }, { k: 'o', t: 'Auftrag', cls: 'nw', f: (c) => html`<a href="#/auftraege/${c.orderId}">${c.orderId}</a>`, s: (c) => c.orderId, x: (c) => c.orderId }, { k: 'c', t: 'Kunde', f: (c) => custName(c.customerId), s: (c) => custName(c.customerId) }, { k: 'x', t: 'Beschreibung', f: (c) => c.text.length > 60 ? c.text.slice(0, 58) + '…' : c.text, x: (c) => c.text }, { k: 'r', t: 'Verantwortlich', f: (c) => c.resp || '–', s: (c) => c.resp || '' }, { k: 's', t: 'Status', cls: 'nw', f: (c) => claimChip(c.status), s: (c) => c.status, x: (c) => CLAIM_STATUS[c.status][0] }, { k: 'k', t: 'Kosten', cls: 'num nw', f: (c) => eur(c.cost), s: (c) => c.cost }];
    return html`${pageHead('Reklamationen und Schäden', 'Fälle erfassen, Verantwortliche zuweisen, Maßnahmen und Verlauf dokumentieren.', canWrite('reklamation') ? html`<button type="button" class="btn primary" data-act="claim.new">${ic('plus')} Neue Reklamation</button>` : '')}
      <div class="kpis"><div class="kpi" style="--k:var(--coral)"><small>Offene Fälle</small><b>${open.length}</b><span>${DB.claims.filter((c) => c.status === 'neu').length} neu</span></div><div class="kpi" style="--k:var(--sun)"><small>Reklamationsquote</small><b>${nf((DB.claims.length / Math.max(1, total)) * 100, 1)} %</b><span>${DB.claims.length} Fälle bei ${total} Aufträgen</span></div><div class="kpi" style="--k:var(--navy)"><small>Kosten offener Fälle</small><b>${eur(sum(open, (c) => c.cost))}</b><span>geschätzt</span></div></div>
      <div class="toolbar">${bindInp('Suche', 'c.q', 'Nummer, Text, Auftrag …', { cls: 'search' })}${bindSel('Status', 'c.st', [['', 'Alle'], ...Object.entries(CLAIM_STATUS).map(([k, v]) => [k, v[0]])])}${bindSel('Art', 'c.type', [['', 'Alle'], ...CLAIM_TYPES])}</div>
      ${table('claims', cols, rows, { sort: { k: 'n', dir: -1 }, name: 'reklamationen', noun: 'Reklamationen' })}`;
  },
});
function claimForm(pre) {
  return html`<div class="fgrid">${fld('Auftrag', 'orderId', pre || '', { type: 'select', req: true, options: [['', '– wählen –'], ...DB.orders.filter((o) => o.status !== 'storniert' && o.status !== 'entwurf').map((o) => [o.id, `${o.nr} · ${custName(o.customerId)} · ${o.delivery.city}`])], cls: 'wide' })}
    ${fld('Art', 'type', 'Schaden', { type: 'select', options: CLAIM_TYPES })}${fld('Geschätzte Kosten (€)', 'cost', 0, { type: 'number', min: 0, step: '0.01' })}${fld('Verantwortlich', 'resp', curUser().name, { type: 'select', options: DB.users.filter((u) => u.active).map((u) => u.name) })}
    ${fld('Beschreibung', 'text', '', { type: 'textarea', req: true, cls: 'wide' })}${fld('Fotos / Belege (optional)', 'files', '', { type: 'file', attrs: 'accept="image/*" multiple', cls: 'wide' })}</div>`;
}
act('claim.new', 'reklamation', (d) => openModal({ title: 'Neue Reklamation', wide: true, form: 'claim.create', body: claimForm(d.order), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Anlegen</button>` }));
onSubmit('claim.create', 'reklamation', async (f) => {
  const photos = []; for (const file of Array.from(f.files || []).slice(0, 4)) { const p = await shrinkImage(file); if (p) photos.push(p); }
  const c = newClaim({ ...f, photos }); closeModal(); commit(); toast(`${c.nr} angelegt.`, 'ok'); location.hash = `#/reklamation/${c.id}`;
});
function claimDetail(id) {
  const c = DB.claims.find((x) => x.id === id); if (!c) return notFound('Reklamation', '#/reklamation');
  const o = ord(c.orderId), w = canWrite('reklamation');
  return html`${pageHead(html`${c.nr} ${claimChip(c.status)}`, `${c.type} · ${custName(c.customerId)}`, w ? html`<button type="button" class="btn" data-act="claim.status" data-id="${c.id}">${ic('flag')} Status ändern</button>${c.cost > 0 && o && o.invoiceId ? html`<button type="button" class="btn" data-act="claim.credit" data-id="${c.id}">${ic('euro')} Gutschrift erstellen</button>` : ''}` : '', html`${backTo('#/reklamation', 'Reklamationen')} › ${c.nr}`)}
    <div class="grid g21"><div class="stack">
      <section class="card"><div class="card-h"><h2>Sachverhalt</h2></div><p>${c.text}</p>${c.photos.length ? html`<div class="thumbs mt-s">${c.photos.map((p) => html`<a href="${p}" target="_blank" rel="noopener"><img src="${p}" alt="Foto zur Reklamation"></a>`)}</div>` : ''}${w ? html`<div class="mt-s"><label class="btn sm" style="cursor:pointer">${ic('camera')} Foto hinzufügen<input type="file" accept="image/*" data-claim-photo="${c.id}" hidden></label></div>` : ''}</section>
      <section class="card"><div class="card-h"><h2>Maßnahmen</h2>${w ? html`<button type="button" class="btn sm" data-act="claim.action" data-id="${c.id}">${ic('plus')} Maßnahme</button>` : ''}</div><ul class="list">${c.actions.length ? c.actions.map((a, i) => html`<li><label class="chk"><input type="checkbox" data-act="claim.action.toggle" data-id="${c.id}" data-i="${i}" ${a.done ? raw('checked') : ''} ${w ? '' : raw('disabled')}><span style="${a.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${a.text}</span></label><span class="tiny muted" style="margin-left:auto">${a.by} · ${fDT(a.ts)}</span></li>`) : html`<li class="muted">Noch keine Maßnahmen.</li>`}</ul></section>
      <section class="card"><div class="card-h"><h2>Verlauf (Nachvollziehbarkeit)</h2></div><ol class="tl">${c.log.slice().reverse().map((l, i) => html`<li class="${i === 0 ? 'now' : 'on'}"><time>${fDT(l.ts)} · ${l.by}</time><b>${l.text}</b></li>`)}</ol></section></div>
    <aside class="stack"><section class="card"><dl>${kv('Auftrag', o ? html`<a href="#/auftraege/${o.id}">${o.nr}</a>` : c.orderId)}${kv('Strecke', o ? route(o) : '–')}${kv('Kunde', html`<a href="#/kunden/${c.customerId}">${custName(c.customerId)}</a>`)}${kv('Verantwortlich', c.resp || '–')}${kv('Kosten (geschätzt)', eur(c.cost))}${kv('Angelegt', fDT(c.created))}</dl></section></aside></div>`;
}
document.addEventListener('change', async (e) => {
  if (e.target.matches('[data-claim-photo]')) { const c = DB.claims.find((x) => x.id === e.target.dataset.claimPhoto); const p = await shrinkImage(e.target.files[0]); if (c && p) { c.photos.push(p); c.log.push({ ts: NOW(), text: 'Foto hinzugefügt', by: curUserName() }); commit(); } }
});
act('claim.status', 'reklamation', (d) => { const c = DB.claims.find((x) => x.id === d.id); openModal({ title: `${c.nr}: Status ändern`, form: 'claim.status', cls: 'small', body: html`<input type="hidden" name="id" value="${c.id}"><div class="stack">${fld('Status', 'status', c.status, { type: 'select', options: Object.entries(CLAIM_STATUS).map(([k, v]) => [k, v[0]]) })}${fld('Verantwortlich', 'resp', c.resp || curUser().name, { type: 'select', options: DB.users.filter((u) => u.active).map((u) => u.name) })}${fld('Kosten (€)', 'cost', c.cost, { type: 'number', min: 0, step: '0.01' })}${fld('Notiz', 'note', '')}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Speichern</button>` }); });
onSubmit('claim.status', 'reklamation', (f) => { const c = DB.claims.find((x) => x.id === f.id); const was = c.status; c.status = f.status; c.resp = f.resp; c.cost = +f.cost || 0; c.log.push({ ts: NOW(), text: `Status: ${CLAIM_STATUS[was][0]} → ${CLAIM_STATUS[f.status][0]}${f.note ? ' (' + f.note + ')' : ''}; verantwortlich: ${f.resp}`, by: curUserName() }); audit('Reklamation', c.nr, 'Status', CLAIM_STATUS[f.status][0]); closeModal(); commit(); toast('Reklamation aktualisiert.', 'ok'); });
act('claim.action', 'reklamation', (d) => inputBox('Maßnahme hinzufügen', 'Maßnahme', '', (t) => { const c = DB.claims.find((x) => x.id === d.id); c.actions.push({ ts: NOW(), text: t, by: curUserName(), done: false }); c.log.push({ ts: NOW(), text: `Maßnahme geplant: ${t}`, by: curUserName() }); if (c.status === 'neu' || c.status === 'pruefung') c.status = 'massnahme'; commit(); }, 'Hinzufügen'));
act('claim.action.toggle', 'reklamation', (d, el) => { const c = DB.claims.find((x) => x.id === d.id); const a = c.actions[+d.i]; a.done = el.checked; c.log.push({ ts: NOW(), text: `Maßnahme ${a.done ? 'erledigt' : 'wieder geöffnet'}: ${a.text}`, by: curUserName() }); commit(); });
