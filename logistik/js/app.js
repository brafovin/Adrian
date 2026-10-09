'use strict';
/* JWG.logistik – Anwendungsrahmen: Routing, Navigation, Kopfleiste, Suche, Meldungen, Start */

const NAV = [
  ['Übersicht', [['dashboard', 'Dashboard', 'dashboard']]],
  ['Betrieb', [['auftraege', 'Aufträge', 'orders'], ['dispo', 'Disposition', 'route'], ['tracking', 'Sendungsverfolgung', 'pin'], ['komm', 'Kommunikation', 'chat'], ['reklamation', 'Reklamationen', 'alert']]],
  ['Stammdaten', [['kunden', 'Kunden', 'users'], ['fahrer', 'Fahrer', 'wheel'], ['fuhrpark', 'Fuhrpark', 'truck'], ['partner', 'Frachtführer', 'link']]],
  ['Vertrieb & Finanzen', [['angebote', 'Angebote', 'file'], ['abrechnung', 'Abrechnung', 'euro'], ['dokumente', 'Dokumente', 'folder'], ['lager', 'Lager', 'box']]],
  ['Auswertung', [['reporting', 'Reporting', 'chart'], ['roadmap', 'PRD-Abdeckung', 'spark']]],
  ['Apps', [['fahrer-app', 'Fahrer-App', 'phone'], ['portal', 'Kundenportal', 'globe'], ['track', 'Öffentliche Sendungssuche', 'search']]],
  ['System', [['benutzer', 'Benutzer & Rechte', 'shield'], ['einstellungen', 'Einstellungen', 'sliders'], ['schnittstellen', 'Schnittstellen', 'plug'], ['sicherheit', 'Sicherheit & Datenschutz', 'lock']]],
];
const NAV_ITEMS = NAV.flatMap((g) => g[1]);
const APP_ROUTES = ['fahrer-app', 'portal', 'track'];

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const seg = path.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
  return { name: seg[0] || 'dashboard', seg: seg.slice(1), q: new URLSearchParams(q || ''), raw: h };
}
const go = (href) => { if (location.hash === href) render(); else location.hash = href; };
act('go', null, (d) => go(d.href));
act('nav.toggle', null, () => document.body.classList.toggle('nav-open'));
act('nav.close', null, () => document.body.classList.remove('nav-open'));

/* ---------- Live-Hinweise für Glocke und Dashboard ---------- */
function liveAlerts() {
  const out = [];
  problems().filter((p) => p.kind !== 'Reklamation').forEach((p) => out.push({ tone: p.tone, text: `${p.order.nr}: ${p.kind} – ${p.text}`, link: `#/auftraege/${p.order.id}` }));
  DB.invoices.filter((i) => invoiceState(i).id === 'ueberfaellig').forEach((i) => out.push({ tone: 'red', text: `Rechnung ${i.nr} (${(cust(i.customerId) || {}).name}) ist überfällig`, link: '#/abrechnung' }));
  DB.vehicles.forEach((v) => { const d = dueState(v.tuev, 30); if (d.tone !== 'green') out.push({ tone: d.tone, text: `${v.plate}: Hauptuntersuchung ${d.label}`, link: `#/fuhrpark/${v.id}` }); });
  DB.drivers.forEach((dr) => dr.quals.forEach((q) => { if (q.exp) { const d = dueState(q.exp, 30); if (d.tone !== 'green') out.push({ tone: d.tone, text: `${dr.name}: ${q.name} ${d.label}`, link: `#/fahrer/${dr.id}` }); } }));
  const open = DB.claims.filter((c) => c.status === 'neu').length;
  if (open) out.push({ tone: 'amber', text: `${open} neue Reklamation${open > 1 ? 'en' : ''} ohne Bearbeiter`, link: '#/reklamation' });
  const shop = readShopOrders().filter((s) => s && s.no && !DB.shopSeen.includes(s.no)).length;
  if (shop) out.push({ tone: 'blue', text: `${shop} Bestellung${shop > 1 ? 'en' : ''} aus dem Shop warten auf Übernahme`, link: '#/schnittstellen' });
  return out;
}
const unreadCount = () => DB.notifs.filter((n) => !n.read).length;

/* ---------- Rahmen zeichnen ---------- */
function badgeFor(id) {
  if (id === 'auftraege') { const n = DB.orders.filter((o) => o.status === 'offen' && inScope(o.branch)).length; return n ? n : 0; }
  if (id === 'komm') return DB.threads.reduce((s, t) => s + (t.unread || 0), 0);
  if (id === 'reklamation') return DB.claims.filter((c) => c.status === 'neu').length;
  return 0;
}
function renderNav(r) {
  const nav = $('#nav'); if (!nav) return;
  nav.innerHTML = String(html`${NAV.map(([g, items]) => {
    const vis = items.filter(([id]) => APP_ROUTES.includes(id) || can(VIEWS[id] && VIEWS[id].mod));
    return vis.length ? html`<div class="nav-h">${g}</div>${vis.map(([id, label, icon]) => { const b = badgeFor(id); return html`<a href="#/${id}" ${r.name === id ? raw('aria-current="page"') : ''}>${ic(icon)}<span>${label}</span>${b ? html`<span class="badge" aria-label="${b} offen">${b}</span>` : ''}</a>`; })}` : '';
  })}`);
  $('#sidefoot').innerHTML = String(html`<div>${ic('shield')} Demo-Modus: Alle Daten liegen nur in diesem Browser.</div><div class="mt-s"><a href="../onlineshop/">← Zum JWG.onlineshop</a></div>`);
}
function notifPopover() {
  const alerts = liveAlerts(), st = DB.notifs.slice(0, 12);
  return html`<div class="popover" role="dialog" aria-label="Benachrichtigungen"><div class="card-h"><b>Benachrichtigungen</b><button type="button" class="btn sm" data-act="notif.read">Alle gelesen</button></div>
    ${alerts.length ? html`<div class="res-g">Jetzt zu tun (${alerts.length})</div><ul class="list">${alerts.slice(0, 8).map((a) => html`<li><span class="chip tone-${a.tone}">!</span><div class="grow"><a href="${a.link}" data-act="pop.close">${a.text}</a></div></li>`)}</ul>` : ''}
    ${st.length ? html`<div class="res-g">Ereignisse</div><ul class="list">${st.map((n) => html`<li><span class="status-dot" style="--c:${n.read ? 'var(--line2)' : 'var(--accent)'};margin-top:7px"></span><div class="grow">${n.link ? html`<a href="${n.link}" data-act="pop.close">${n.text}</a>` : n.text}<div class="tiny muted">${rel(n.ts)}</div></div></li>`)}</ul>` : ''}
    ${!alerts.length && !st.length ? empty('Alles erledigt', 'Keine offenen Hinweise.') : ''}</div>`;
}
function userPopover() {
  const u = curUser();
  return html`<div class="popover" role="dialog" aria-label="Benutzer wechseln"><div class="res-g">Angemeldet als</div>
    <div class="row" style="padding:6px 8px">${avatar(u.name)}<div><b>${u.name}</b><div class="tiny muted">${curRole().name}</div></div></div>
    <div class="res-g">Rolle testen (Demo)</div>
    <ul class="list">${DB.users.filter((x) => x.active).map((x) => html`<li><button type="button" class="btn sm ghost" style="width:100%;justify-content:flex-start;border:0" data-act="user.switch" data-id="${x.id}" ${x.id === u.id ? raw('aria-current="true"') : ''}>${avatar(x.name)}<span style="text-align:left"><b>${x.name}</b><br><small class="muted">${(DB.roles.find((r) => r.id === x.role) || {}).name}</small></span>${x.id === u.id ? ic('check') : ''}</button></li>`)}</ul>
    <div class="note-demo mt-s">Die Menüs und Schaltflächen passen sich der Rolle an. Eine echte Anmeldung mit Passwort und MFA braucht einen Server.</div></div>`;
}
function renderChrome(r) {
  renderNav(r);
  const mb = $('.menu-btn'); if (mb && !mb.firstChild) mb.innerHTML = String(ic('menu'));
  const allowed = allowedBranches();
  const n = liveAlerts().length + unreadCount();
  const u = curUser();
  $('#topdyn').innerHTML = String(html`
    ${allowed.length > 1 ? html`<label class="sr" for="branchSel">Standort</label><select id="branchSel" data-branch aria-label="Standort wählen"><option value="all" ${SESS.branch === 'all' ? raw('selected') : ''}>Alle Standorte</option>${allowed.map((b) => html`<option value="${b}" ${SESS.branch === b ? raw('selected') : ''}>${branchName(b)}</option>`)}</select>` : ''}
    <div style="position:relative"><button type="button" class="icon-btn" data-act="pop.toggle" data-pop="notif" aria-label="Benachrichtigungen (${n})" aria-expanded="${UI.pop === 'notif'}">${ic('bell')}${n ? html`<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}</button>${UI.pop === 'notif' ? notifPopover() : ''}</div>
    <button type="button" class="icon-btn" data-act="theme" aria-label="Farbschema wechseln">${ic(isDark() ? 'sun' : 'moon')}</button>
    <div style="position:relative"><button type="button" class="btn ghost sm" data-act="pop.toggle" data-pop="user" aria-expanded="${UI.pop === 'user'}" style="padding:2px 8px 2px 4px;border-radius:99px">${avatar(u.name)}<span class="nowrap" style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${u.name.split(' ')[0]}</span></button>${UI.pop === 'user' ? userPopover() : ''}</div>`);
}
const isDark = () => (SESS.theme ? SESS.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme() { if (SESS.theme) document.documentElement.dataset.theme = SESS.theme; else delete document.documentElement.dataset.theme; }
act('theme', null, () => { SESS.theme = isDark() ? 'light' : 'dark'; saveSess(); applyTheme(); renderChrome(parseRoute()); });
act('pop.toggle', null, (d) => { UI.pop = UI.pop === d.pop ? null : d.pop; renderChrome(parseRoute()); });
act('pop.close', null, () => { UI.pop = null; renderChrome(parseRoute()); });
act('notif.read', null, () => { DB.notifs.forEach((n) => { n.read = true; }); save(); renderChrome(parseRoute()); });
act('user.switch', null, (d) => { SESS.userId = d.id; SESS.branch = 'all'; saveSess(); UI.pop = null; secLog('Rollenwechsel (Demo)', `Jetzt: ${curUser().name} (${curRole().name})`); save(); toast(`Angemeldet als ${curUser().name} (${curRole().name})`, 'ok'); render(); });
document.addEventListener('change', (e) => { if (e.target.matches('[data-branch]')) { SESS.branch = e.target.value; saveSess(); render(); } });

/* ---------- Zentrale Suche ---------- */
function searchAll(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const has = (...v) => v.some((x) => String(x == null ? '' : x).toLowerCase().includes(q));
  const g = [];
  const add = (title, items) => { if (items.length) g.push({ title, items: items.slice(0, 5) }); };
  add('Aufträge und Sendungen', DB.orders.filter((o) => has(o.nr, o.tracking, o.ref, o.shopNo, (cust(o.customerId) || {}).name, o.pickup.city, o.delivery.city, o.delivery.name, o.goods.desc)).map((o) => ({ href: `#/auftraege/${o.id}`, a: o.nr, b: `${(cust(o.customerId) || {}).name} · ${o.pickup.city} → ${o.delivery.city}`, chip: statusChip(o.status) })));
  add('Kunden', DB.customers.filter((c) => has(c.nr, c.name, c.city)).map((c) => ({ href: `#/kunden/${c.id}`, a: c.name, b: `${c.nr} · ${c.city}` })));
  add('Fahrer', DB.drivers.filter((d) => has(d.name, d.phone)).map((d) => ({ href: `#/fahrer/${d.id}`, a: d.name, b: branchName(d.branch) })));
  add('Fahrzeuge', DB.vehicles.filter((v) => has(v.plate, v.model, v.make)).map((v) => ({ href: `#/fuhrpark/${v.id}`, a: v.plate, b: `${vtype(v.type).name} · ${branchName(v.branch)}` })));
  add('Rechnungen und Angebote', [...DB.invoices.filter((i) => has(i.nr, (cust(i.customerId) || {}).name)).map((i) => ({ href: '#/abrechnung', a: i.nr, b: `${(cust(i.customerId) || {}).name} · ${eur(i.gross)}` })), ...DB.quotes.filter((x) => has(x.nr, (cust(x.customerId) || {}).name)).map((x) => ({ href: `#/angebote/${x.id}`, a: x.nr, b: `Angebot · ${(cust(x.customerId) || {}).name}` }))]);
  add('Frachtführer', DB.partners.filter((p) => has(p.name, p.city)).map((p) => ({ href: `#/partner/${p.id}`, a: p.name, b: p.city })));
  add('Reklamationen', DB.claims.filter((c) => has(c.nr, c.text, c.type)).map((c) => ({ href: `#/reklamation/${c.id}`, a: c.nr, b: `${c.type}: ${c.text}` })));
  return g;
}
function updateSearch() {
  const box = $('#sres'), inp = $('#gsearch');
  const q = inp.value;
  if (q.trim().length < 2) { box.hidden = true; return; }
  const g = searchAll(q);
  box.innerHTML = String(g.length ? html`<div class="res">${g.map((x) => html`<div class="res-g">${x.title}</div>${x.items.map((i) => html`<a href="${i.href}" data-act="search.pick"><div class="grow"><b>${i.a}</b><div class="tiny muted">${i.b}</div></div>${i.chip || ''}</a>`)}`)}</div>` : empty('Nichts gefunden', 'Versuche eine Auftragsnummer, Sendungsnummer oder einen Namen.'));
  box.hidden = false;
}
act('search.pick', null, () => { $('#sres').hidden = true; $('#gsearch').value = ''; });

/* ---------- Ereignisse ---------- */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'gsearch') { updateSearch(); return; }
  if (el.dataset && el.dataset.bind) { UI.f[el.dataset.bind] = el.type === 'checkbox' ? el.checked : el.value; UI.lim = {}; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !modals.length) { e.preventDefault(); const s = $('#gsearch'); if (s) s.focus(); }
  if (e.key === 'Escape') { const b = $('#sres'); if (b && !b.hidden) { b.hidden = true; } if (UI.pop) { UI.pop = null; renderChrome(parseRoute()); } }
  if (e.target.id === 'gsearch' && e.key === 'Enter') { const a = $('#sres a'); if (a) { a.click(); location.hash = a.getAttribute('href'); } }
  if (e.target.id === 'gsearch' && e.key === 'ArrowDown') { const a = $('#sres a'); if (a) { e.preventDefault(); a.focus(); } }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) { const b = $('#sres'); if (b) b.hidden = true; }
  if (UI.pop && !e.target.closest('.popover') && !e.target.closest('[data-pop]')) { UI.pop = null; renderChrome(parseRoute()); }
  if (e.target.closest('.nav a')) document.body.classList.remove('nav-open');
});

/* ---------- Rendern ---------- */
let lastRoute = '';
function forbidden(V) {
  return html`${pageHead('Kein Zugriff', 'Für diese Seite fehlt deiner Rolle die Berechtigung.')}<div class="card">${notice('amber', html`Deine Rolle <b>${curRole().name}</b> darf „${(NAV_ITEMS.find((n) => n[0] === (V && V.name)) || [0, V && V.title || 'diese Seite'])[1]}“ nicht öffnen. Wechsle oben rechts die Rolle oder passe die Rechte unter <a href="#/benutzer">Benutzer &amp; Rechte</a> an.`)}</div>`;
}
function render() {
  if (!DB) return;
  const r = parseRoute();
  const V = VIEWS[r.name] || VIEWS.dashboard;
  const main = $('#main');
  const layout = V.layout || 'admin';
  document.body.dataset.layout = layout;
  const a = document.activeElement;
  const fkey = a && a.dataset && a.dataset.bind, fpos = a && a.selectionStart, fend = a && a.selectionEnd;
  let out;
  if (layout === 'admin' && V.mod && !can(V.mod)) out = forbidden({ ...V, name: r.name });
  else { try { out = V.render(r.seg, r.q, r); } catch (err) { console.error(err); out = html`<div class="card">${notice('red', html`Diese Seite konnte nicht aufgebaut werden: ${err.message}`)}</div>`; } }
  main.innerHTML = String(out);
  if (V.after) { try { V.after(r.seg, r.q, main); } catch (err) { console.error(err); } }
  if (r.raw !== lastRoute) {
    const sameBase = lastRoute.split('?')[0] === r.raw.split('?')[0];
    if (!sameBase) { window.scrollTo(0, 0); if (lastRoute) main.focus({ preventScroll: true }); }
    lastRoute = r.raw; document.body.classList.remove('nav-open'); UI.pop = null;
  }
  if (fkey) { const el = $(`[data-bind="${CSS.escape(fkey)}"]`, main); if (el) { el.focus({ preventScroll: true }); try { if (fpos != null) el.setSelectionRange(fpos, fend); } catch (e) { /* kein Textfeld */ } } }
  renderChrome(r);
  document.title = `${V.title || 'Dashboard'} · JWG.logistik`;
  document.documentElement.lang = 'de';
}

window.addEventListener('hashchange', render);
window.addEventListener('storage', (e) => {
  if (e.key === LS_DB && e.newValue) {
    try { const db = JSON.parse(e.newValue); if (db && db.v === 1) { DB = db; const r = parseRoute(), V = VIEWS[r.name]; if (!(V && V.form && V.form(r.seg))) render(); } } catch (err) { /* ignorieren */ }
  }
  if (e.key === SHOP_KEY && DB.settings.autoImportShop && importShopOrders(true)) render();
});
setInterval(() => {
  const r = parseRoute(), V = VIEWS[r.name];
  if (!V || !V.live || modals.length || (V.form && V.form(r.seg))) return;
  if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
  render();
}, 20000);

function boot() {
  loadSess(); loadDB(); applyTheme();
  if (DB.settings.autoImportShop) importShopOrders(true);
  if (!location.hash) location.replace('#/dashboard');
  render();
}
boot();
