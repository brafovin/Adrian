'use strict';
/* JWG.logistik – Stammdaten: Kunden (CRM), Fahrer, Fuhrpark, Frachtführer */

const CUST_TYPES = ['Onlineshop', 'Handel', 'Verein', 'Lieferant', 'Gastronomie', 'Dienstleister', 'Schule', 'Sonstige'];
const PRICE_LISTS = ['Standard', 'Schule', 'Partner', 'Shop'];
const backTo = (href, label) => html`<a href="${href}">${label}</a>`;
const notFound = (what, href) => html`${pageHead(`${what} nicht gefunden`)}${empty(`Diesen Eintrag gibt es nicht`, html`<a href="${href}">Zurück zur Liste</a>`)}`;

/* ---------- Kunden ---------- */
view('kunden', {
  mod: 'kunden', title: 'Kunden',
  render(seg) {
    if (seg[0]) return customerDetail(seg[0]);
    const q = fv('k.q').trim().toLowerCase(), showArch = fv('k.arch', false) === true;
    const rows = DB.customers.filter((c) => (showArch || !c.archived) && (!fv('k.type') || c.type === fv('k.type')) && (!q || [c.name, c.nr, c.city, c.contacts.map((x) => x.name).join(' ')].join(' ').toLowerCase().includes(q)));
    const stats = (c) => { const os = customerOrders(c.id).filter((o) => o.status !== 'storniert'); return { n: os.length, rev: sum(os, (o) => o.price) }; };
    const cols = [
      { k: 'nr', t: 'Nr.', cls: 'nw', f: (c) => html`<a href="#/kunden/${c.id}">${c.nr}</a>`, s: (c) => c.nr },
      { k: 'name', t: 'Kunde', f: (c) => html`<b>${c.name}</b>${c.archived ? html` ${chip('archiviert', 'gray')}` : ''}`, s: (c) => c.name },
      { k: 'type', t: 'Typ', f: (c) => c.type, s: (c) => c.type },
      { k: 'city', t: 'Ort', f: (c) => c.city, s: (c) => c.city },
      { k: 'contact', t: 'Ansprechpartner', f: (c) => (c.contacts[0] || {}).name || '–', s: (c) => (c.contacts[0] || {}).name || '' },
      { k: 'terms', t: 'Konditionen', f: (c) => `${c.discount ? c.discount + ' % · ' : ''}${c.terms ? c.terms + ' Tage' : 'sofort'}`, x: (c) => `${c.discount} % Rabatt, ${c.terms} Tage`, s: (c) => c.discount },
      { k: 'n', t: 'Aufträge', cls: 'num', f: (c) => stats(c).n, s: (c) => stats(c).n },
      { k: 'rev', t: 'Umsatz netto', cls: 'num nw', f: (c) => eur(stats(c).rev), s: (c) => stats(c).rev },
    ];
    return html`${pageHead('Kunden', 'Kundenstamm mit Ansprechpartnern, Adressen und individuellen Konditionen.', canWrite('kunden') ? html`<button type="button" class="btn primary" data-act="cust.new">${ic('plus')} Neuer Kunde</button>` : '')}
      <div class="toolbar">${bindInp('Suche', 'k.q', 'Name, Nummer, Ort, Ansprechpartner …', { cls: 'search' })}${bindSel('Typ', 'k.type', [['', 'Alle Typen'], ...CUST_TYPES])}<div class="fld"><span>&nbsp;</span>${bindSw('Archivierte zeigen', 'k.arch', false)}</div></div>
      ${table('cust', cols, rows, { sort: { k: 'nr', dir: 1 }, name: 'kunden', noun: 'Kunden' })}`;
  },
});
function custForm(c) {
  const f = c || { name: '', type: 'Handel', street: '', zip: '', city: 'Frankfurt am Main', terms: 14, discount: 0, priceList: 'Standard', vatId: '', notes: '' };
  return html`<input type="hidden" name="id" value="${c ? c.id : ''}"><div class="fgrid">
    ${fld('Firma / Name', 'name', f.name, { req: true, cls: 'wide' })}${fld('Typ', 'type', f.type, { type: 'select', options: CUST_TYPES })}${fld('USt-IdNr.', 'vatId', f.vatId || '')}
    ${fld('Straße', 'street', f.street, { req: true })}${fld('Stadt', 'city', f.city, { type: 'select', options: CITIES.map((x) => x.name) })}${fld('PLZ', 'zip', f.zip || '60311', { req: true, pattern: '[0-9]{5}', maxlength: 5 })}
    ${fld('Preisliste', 'priceList', f.priceList, { type: 'select', options: PRICE_LISTS })}${fld('Rabatt auf Fracht (%)', 'discount', f.discount, { type: 'number', min: 0, max: 40, step: '0.5' })}${fld('Zahlungsziel (Tage)', 'terms', f.terms, { type: 'number', min: 0, max: 90 })}
    ${c ? '' : html`${fld('Ansprechpartner', 'cName', '', { req: true })}${fld('Funktion', 'cRole', '')}${fld('E-Mail', 'cMail', '', { type: 'email', req: true })}${fld('Telefon', 'cPhone', '', { type: 'tel' })}`}
    ${fld('Notizen', 'notes', f.notes || '', { type: 'textarea', cls: 'wide' })}</div>`;
}
act('cust.new', 'kunden', () => openModal({ title: 'Neuer Kunde', wide: true, form: 'cust.save', body: custForm(null), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Kunde anlegen</button>` }));
act('cust.edit', 'kunden', (d) => openModal({ title: 'Kunde bearbeiten', wide: true, form: 'cust.save', body: custForm(cust(d.id)), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Speichern</button>` }));
onSubmit('cust.save', 'kunden', (f) => {
  let c = f.id ? cust(f.id) : null;
  if (!c) {
    const nr = nextNo('customer');
    c = { id: uid('c'), nr, billing: {}, addresses: [], contacts: [{ name: f.cName, role: f.cRole, email: f.cMail, phone: f.cPhone }], archived: false, created: NOW(), docs: [] };
    DB.customers.push(c); audit('Kunde', nr, 'erstellt', f.name);
  } else audit('Kunde', c.nr, 'bearbeitet', 'Stammdaten geändert');
  Object.assign(c, { name: f.name, type: f.type, street: f.street, zip: f.zip, city: f.city, vatId: f.vatId, priceList: f.priceList, discount: +f.discount || 0, terms: +f.terms || 0, notes: f.notes });
  c.billing = { name: f.name, street: f.street, zip: f.zip, city: f.city };
  if (!c.addresses.length) c.addresses.push({ id: uid('ad'), label: 'Hauptadresse', name: f.name, street: f.street, zip: f.zip, city: f.city });
  closeModal(); commit(); toast(`${c.name} gespeichert.`, 'ok');
  if (!f.id) location.hash = `#/kunden/${c.id}`;
});
act('cust.archive', 'kunden', (d) => { const c = cust(d.id); c.archived = !c.archived; audit('Kunde', c.nr, c.archived ? 'archiviert' : 'reaktiviert', c.name); commit(); toast(c.archived ? 'Kunde archiviert. Er erscheint nicht mehr in Auswahllisten.' : 'Kunde reaktiviert.', 'ok'); });
function customerDetail(id) {
  const c = cust(id); if (!c) return notFound('Kunde', '#/kunden');
  const tl = [['s', 'Stammdaten'], ['p', 'Ansprechpartner'], ['a', 'Adressen'], ['o', 'Aufträge'], ['d', 'Dokumente'], ['h', 'Änderungen']];
  const cur = UI.tab['cd-' + id] || 's';
  const os = customerOrders(id).filter((o) => o.status !== 'storniert');
  const w = canWrite('kunden');
  const body = {
    s: html`<div class="grid g2"><section class="card flat"><div class="card-h"><h2>Firmendaten</h2></div><dl>${kv('Kundennummer', html`<span class="mono">${c.nr}</span>`)}${kv('Typ', c.type)}${kv('Adresse', html`${c.street}<br>${c.zip} ${c.city}`)}${kv('USt-IdNr.', c.vatId || '–')}${kv('Kunde seit', fDate(c.created))}${kv('Notizen', c.notes || '–')}</dl></section>
      <section class="card flat"><div class="card-h"><h2>Preise und Konditionen</h2></div><dl>${kv('Preisliste', c.priceList)}${kv('Rabatt auf Fracht', c.discount ? `${c.discount} %` : 'kein Rabatt')}${kv('Zahlungsziel', c.terms ? `${c.terms} Tage netto` : 'sofort')}${kv('Umsatz (netto)', eur(sum(os, (o) => o.price)))}${kv('Aufträge', os.length)}${kv('Offene Rechnungen', eur(sum(DB.invoices.filter((i) => i.customerId === id && i.status === 'offen'), (i) => i.gross)))}</dl></section></div>`,
    p: html`<div class="card flat"><div class="card-h"><h2>Ansprechpartner</h2>${w ? html`<button type="button" class="btn sm" data-act="contact.add" data-id="${id}">${ic('plus')} Hinzufügen</button>` : ''}</div>
      <ul class="list">${c.contacts.map((p, i) => html`<li>${avatar(p.name)}<div class="grow"><b>${p.name}</b> <span class="muted">${p.role}</span><div class="tiny"><a href="mailto:${p.email}">${p.email}</a> · <a href="tel:${(p.phone || '').replace(/\s/g, '')}">${p.phone}</a></div></div>${w && c.contacts.length > 1 ? html`<button type="button" class="icon-btn" data-act="contact.del" data-id="${id}" data-i="${i}" aria-label="Ansprechpartner entfernen">${ic('trash')}</button>` : ''}</li>`)}</ul></div>`,
    a: html`<div class="grid g2"><section class="card flat"><div class="card-h"><h2>Rechnungsadresse</h2></div><p><b>${c.billing.name}</b><br>${c.billing.street}<br>${c.billing.zip} ${c.billing.city}</p></section>
      <section class="card flat"><div class="card-h"><h2>Lieferadressen</h2>${w ? html`<button type="button" class="btn sm" data-act="addr.add" data-id="${id}">${ic('plus')} Hinzufügen</button>` : ''}</div><ul class="list">${c.addresses.map((a) => html`<li>${ic('pin')}<div class="grow"><b>${a.label}</b><div class="tiny muted">${a.name}, ${a.street}, ${a.zip} ${a.city}</div></div>${w && c.addresses.length > 1 ? html`<button type="button" class="icon-btn" data-act="addr.del" data-id="${id}" data-a="${a.id}" aria-label="Adresse entfernen">${ic('trash')}</button>` : ''}</li>`)}</ul></section></div>`,
    o: table('cust-orders-' + id, [
      { k: 'nr', t: 'Auftrag', cls: 'nw', f: (o) => html`<a href="#/auftraege/${o.id}">${o.nr}</a>`, s: (o) => o.nr }, { k: 'r', t: 'Strecke', f: (o) => route(o), s: (o) => o.pickup.city }, { k: 'd', t: 'Abholung', cls: 'nw', f: (o) => fDate(o.pickup.date), s: (o) => o.pickup.date },
      { k: 's', t: 'Status', cls: 'nw', f: (o) => statusChip(o.status), s: (o) => o.status, x: (o) => stat(o.status).name }, { k: 'p', t: 'Preis netto', cls: 'num nw', f: (o) => eur(o.price), s: (o) => o.price },
    ], customerOrders(id), { sort: { k: 'd', dir: -1 }, name: 'kunde-' + c.nr, noun: 'Aufträgen', empty: 'Noch keine Aufträge' }),
    d: (() => { const inv = DB.invoices.filter((i) => i.customerId === id), qs = DB.quotes.filter((x) => x.customerId === id); return html`<div class="card flat"><ul class="list">${inv.map((i) => html`<li>${ic('euro')}<div class="grow"><b>Rechnung ${i.nr}</b><div class="tiny muted">${fDate(i.date)} · ${eur(i.gross)}</div></div>${chip(invoiceState(i).label, invoiceState(i).tone)}</li>`)}${qs.map((x) => html`<li>${ic('file')}<div class="grow"><b><a href="#/angebote/${x.id}">Angebot ${x.nr}</a></b><div class="tiny muted">${fDate(x.date)} · ${eur(x.net)} netto</div></div>${chip(x.status, 'gray')}</li>`)}</ul>${!inv.length && !qs.length ? empty('Keine Dokumente') : ''}</div>`; })(),
    h: (() => { const au = DB.audit.filter((a) => a.ref === c.nr); return au.length ? html`<ul class="list">${au.map((a) => html`<li><div class="grow"><b>${a.action}</b> · ${a.text}<div class="tiny muted">${a.user} · ${fDT(a.ts)}</div></div></li>`)}</ul>` : empty('Keine Änderungen protokolliert'); })(),
  }[cur];
  return html`${pageHead(html`${c.name}${c.archived ? html` ${chip('archiviert', 'gray')}` : ''}`, `${c.nr} · ${c.type} · ${c.city}`, html`${canWrite('auftraege') && !c.archived ? html`<a class="btn primary" href="#/auftraege/neu?cust=${c.id}">${ic('plus')} Neuer Auftrag</a>` : ''}${w ? html`<button type="button" class="btn" data-act="cust.edit" data-id="${id}">${ic('edit')} Bearbeiten</button><button type="button" class="btn ghost" data-act="cust.archive" data-id="${id}">${c.archived ? 'Reaktivieren' : 'Archivieren'}</button>` : ''}`, html`${backTo('#/kunden', 'Kunden')} › ${c.nr}`)}
    ${tabs('cd-' + id, tl, 's')}${body}`;
}
act('contact.add', 'kunden', (d) => openModal({ title: 'Ansprechpartner hinzufügen', form: 'contact.save', cls: 'small', body: html`<input type="hidden" name="id" value="${d.id}"><div class="stack">${fld('Name', 'name', '', { req: true })}${fld('Funktion', 'role', '')}${fld('E-Mail', 'email', '', { type: 'email', req: true })}${fld('Telefon', 'phone', '', { type: 'tel' })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Hinzufügen</button>` }));
onSubmit('contact.save', 'kunden', (f) => { const c = cust(f.id); c.contacts.push({ name: f.name, role: f.role, email: f.email, phone: f.phone }); audit('Kunde', c.nr, 'bearbeitet', `Ansprechpartner ${f.name} hinzugefügt`); closeModal(); commit(); });
act('contact.del', 'kunden', (d) => { const c = cust(d.id); const p = c.contacts.splice(+d.i, 1)[0]; audit('Kunde', c.nr, 'bearbeitet', `Ansprechpartner ${p.name} entfernt`); commit(); });
act('addr.add', 'kunden', (d) => openModal({ title: 'Lieferadresse hinzufügen', form: 'addr.save', cls: 'small', body: html`<input type="hidden" name="id" value="${d.id}"><div class="stack">${fld('Bezeichnung', 'label', '', { req: true, ph: 'z. B. Lager Nord' })}${fld('Name', 'name', cust(d.id).name, { req: true })}${fld('Straße', 'street', '', { req: true })}${fld('Stadt', 'city', 'Frankfurt am Main', { type: 'select', options: CITIES.map((x) => x.name) })}${fld('PLZ', 'zip', '', { req: true, pattern: '[0-9]{5}', maxlength: 5 })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Hinzufügen</button>` }));
onSubmit('addr.save', 'kunden', (f) => { const c = cust(f.id); c.addresses.push({ id: uid('ad'), label: f.label, name: f.name, street: f.street, zip: f.zip, city: f.city }); audit('Kunde', c.nr, 'bearbeitet', `Adresse ${f.label} hinzugefügt`); closeModal(); commit(); });
act('addr.del', 'kunden', (d) => { const c = cust(d.id); c.addresses = c.addresses.filter((a) => a.id !== d.a); audit('Kunde', c.nr, 'bearbeitet', 'Adresse entfernt'); commit(); });

/* ---------- Fahrer ---------- */
view('fahrer', {
  mod: 'fahrer', title: 'Fahrer', live: true,
  render(seg) {
    if (seg[0]) return driverDetail(seg[0]);
    const q = fv('d.q').trim().toLowerCase();
    const rows = scoped(DB.drivers).filter((d) => (!fv('d.st') || driverState(d).id === fv('d.st')) && (!q || [d.name, d.phone, (veh(d.vehicleId) || {}).plate].join(' ').toLowerCase().includes(q)));
    const worst = (d) => d.quals.map((x) => (x.exp ? dueState(x.exp, 30) : null)).filter((x) => x && x.tone !== 'green').sort((a, b) => a.n - b.n)[0];
    const cols = [
      { k: 'name', t: 'Fahrer', f: (d) => html`<span class="row gap-s" style="flex-wrap:nowrap">${avatar(d.name)}<a href="#/fahrer/${d.id}">${d.name}</a></span>`, s: (d) => d.name, x: (d) => d.name },
      { k: 'b', t: 'Standort', f: (d) => branchName(d.branch), s: (d) => d.branch, x: (d) => branchName(d.branch) },
      { k: 'v', t: 'Fahrzeug', cls: 'nw', f: (d) => (veh(d.vehicleId) || {}).plate || '–', s: (d) => (veh(d.vehicleId) || {}).plate || '' },
      { k: 'l', t: 'Klassen', f: (d) => d.licenses.join(', '), s: (d) => d.licenses.length },
      { k: 's', t: 'Status', cls: 'nw', f: (d) => { const s = driverState(d); return chip(s.label, s.tone); }, s: (d) => driverState(d).id, x: (d) => driverState(d).label },
      { k: 'q', t: 'Nachweise', f: (d) => { const w = worst(d); return w ? chip(w.n < 0 ? 'abgelaufen' : `läuft in ${w.n} Tg. ab`, w.tone) : chip('gültig', 'green'); }, x: (d) => (worst(d) ? worst(d).label : 'gültig') },
      { k: 'p', t: 'Telefon', cls: 'nw', f: (d) => html`<a href="tel:${d.phone.replace(/\s/g, '')}">${d.phone}</a>`, x: (d) => d.phone },
    ];
    return html`${pageHead('Fahrer', 'Profile, Verfügbarkeit, Qualifikationen und Einsatzzeiten.', canWrite('fahrer') ? html`<button type="button" class="btn primary" data-act="drv.new">${ic('plus')} Neuer Fahrer</button>` : '')}
      <div class="toolbar">${bindInp('Suche', 'd.q', 'Name, Telefon, Kennzeichen', { cls: 'search' })}${bindSel('Status', 'd.st', [['', 'Alle'], ['frei', 'Verfügbar'], ['tour', 'Auf Tour'], ['pause', 'Pause'], ['abwesend', 'Abwesend']])}</div>
      ${table('drivers', cols, rows, { sort: { k: 'name', dir: 1 }, name: 'fahrer', noun: 'Fahrern' })}`;
  },
});
const LICENSES = ['B', 'C1', 'C', 'CE'];
function drvForm(d) {
  const f = d || { name: '', branch: 'b1', phone: '', licenses: ['B'], vehicleId: '' };
  return html`<input type="hidden" name="id" value="${d ? d.id : ''}"><div class="fgrid">${fld('Name', 'name', f.name, { req: true })}${fld('Standort', 'branch', f.branch, { type: 'select', options: BRANCHES.map((b) => [b.id, b.name]) })}${fld('Telefon', 'phone', f.phone, { type: 'tel', req: true })}
    ${fld('Fahrzeug (Standard)', 'vehicleId', f.vehicleId || '', { type: 'select', options: [['', '– keins –'], ...DB.vehicles.map((v) => [v.id, `${v.plate} (${vtype(v.type).name})`])] })}
    <div class="wide"><div class="fld"><span>Fahrerlaubnisklassen</span></div>${checks('licenses', LICENSES, f.licenses)}</div></div>`;
}
act('drv.new', 'fahrer', () => openModal({ title: 'Neuer Fahrer', form: 'drv.save', body: drvForm(null), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Anlegen</button>` }));
act('drv.edit', 'fahrer', (d) => openModal({ title: 'Fahrer bearbeiten', form: 'drv.save', body: drvForm(drv(d.id)), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Speichern</button>` }));
onSubmit('drv.save', 'fahrer', (f) => {
  let d = f.id ? drv(f.id) : null;
  if (!f.licenses || !f.licenses.length) return toast('Mindestens eine Fahrerlaubnisklasse wählen.', 'bad');
  if (!d) { d = { id: uid('d'), absences: [], quals: [], hours: [0, 0, 0, 0, 0], status: 'verfuegbar', pin: '1234', consent: true, note: '' }; DB.drivers.push(d); audit('Fahrer', d.name || f.name, 'erstellt', f.name); }
  Object.assign(d, { name: f.name, branch: f.branch, phone: f.phone, vehicleId: f.vehicleId || null, licenses: f.licenses, email: `${f.name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ +/g, '.')}@jwg-logistik.example` });
  audit('Fahrer', d.name, 'bearbeitet', 'Profil gespeichert'); closeModal(); commit(); toast('Fahrer gespeichert.', 'ok');
});
function driverDetail(id) {
  const d = drv(id); if (!d) return notFound('Fahrer', '#/fahrer');
  const tl = [['p', 'Profil'], ['v', 'Verfügbarkeit'], ['q', 'Qualifikationen'], ['t', 'Touren'], ['z', 'Einsatzzeiten']];
  const cur = UI.tab['dd-' + id] || 'p';
  const st = driverState(d), w = canWrite('fahrer');
  const T = today(), days = Array.from({ length: 14 }, (_, i) => addDays(T, i));
  const body = {
    p: html`<div class="grid g2"><section class="card flat"><div class="card-h"><h2>Kontakt und Zuordnung</h2></div><dl>${kv('Telefon', html`<a href="tel:${d.phone.replace(/\s/g, '')}">${d.phone}</a>`)}${kv('E-Mail', html`<a href="mailto:${d.email}">${d.email}</a>`)}${kv('Standort', branchName(d.branch))}${kv('Standardfahrzeug', d.vehicleId ? html`<a href="#/fuhrpark/${d.vehicleId}">${veh(d.vehicleId).plate}</a> · ${vtype(veh(d.vehicleId).type).name}` : '–')}${kv('Fahrerlaubnis', d.licenses.join(', '))}${kv('Hinweis', d.note || '–')}</dl></section>
      <section class="card flat"><div class="card-h"><h2>Status und Datenschutz</h2></div><dl>${kv('Aktueller Status', chip(st.label, st.tone))}${kv('Pause', html`<label class="switch"><input type="checkbox" data-act="drv.pause" data-id="${d.id}" ${d.status === 'pause' ? raw('checked') : ''} ${w ? '' : raw('disabled')}><i></i><span>${d.status === 'pause' ? 'in Pause' : 'nicht in Pause'}</span></label>`)}${kv('Standort-Einwilligung', html`<label class="switch"><input type="checkbox" data-act="drv.consent" data-id="${d.id}" ${d.consent ? raw('checked') : ''} ${w ? '' : raw('disabled')}><i></i><span>${d.consent ? 'erteilt: Position während der Tour sichtbar' : 'nicht erteilt: keine Positionsdaten'}</span></label>`)}${kv('Fahrer-App PIN', html`<span class="mono">••••</span> <span class="muted tiny">(Demo-PIN 1234)</span>`)}</dl>
      <p class="note-demo mt-s">Standortdaten werden nur gezeigt, wenn der Fahrer eingewilligt hat und die Tour läuft.</p></section></div>`,
    v: html`<div class="card flat"><div class="card-h"><h2>Nächste 14 Tage</h2>${w ? html`<button type="button" class="btn sm" data-act="abs.add" data-id="${d.id}">${ic('plus')} Abwesenheit eintragen</button>` : ''}</div>
      <div class="cal" role="list" aria-label="Verfügbarkeit">${days.map((x) => { const ab = driverAbsent(d, x); const tr = DB.tours.find((t) => t.date === x && t.driverId === d.id); return html`<div role="listitem" class="${ab ? 'abs tone-red' : ''} ${x === T ? 'today' : ''} ${tr ? 'tourd' : ''}" title="${ab ? ab.kind : tr ? 'Tour ' + tr.id : 'verfügbar'}">${WD[parseISO(x).getDay()]}<br>${x.slice(8)}.<br><small>${ab ? ab.kind.slice(0, 3) : tr ? 'Tour' : '✓'}</small></div>`; })}</div>
      <ul class="list mt">${d.absences.length ? d.absences.map((a, i) => html`<li>${chip(a.kind, 'red')}<div class="grow">${fDate(a.from)} bis ${fDate(a.to)}</div>${w ? html`<button type="button" class="icon-btn" data-act="abs.del" data-id="${d.id}" data-i="${i}" aria-label="Abwesenheit löschen">${ic('trash')}</button>` : ''}</li>`) : html`<li class="muted">Keine Abwesenheiten eingetragen.</li>`}</ul></div>`,
    q: html`<div class="card flat"><div class="card-h"><h2>Qualifikationen und Nachweise</h2>${w ? html`<button type="button" class="btn sm" data-act="qual.add" data-id="${d.id}">${ic('plus')} Hinzufügen</button>` : ''}</div>
      <ul class="list">${d.quals.map((qq, i) => { const ds = qq.exp ? dueState(qq.exp, 30) : null; return html`<li>${ic('id')}<div class="grow"><b>${qq.name}</b><div class="tiny muted">${qq.exp ? 'gültig bis ' + fDate(qq.exp) : 'unbefristet'}</div></div>${ds ? chip(ds.n < 0 ? 'abgelaufen' : ds.tone === 'amber' ? `läuft in ${ds.n} Tg. ab` : 'gültig', ds.tone) : chip('gültig', 'green')}${w ? html`<button type="button" class="icon-btn" data-act="qual.del" data-id="${d.id}" data-i="${i}" aria-label="Nachweis löschen">${ic('trash')}</button>` : ''}</li>`; })}</ul></div>`,
    t: table('dtours-' + id, [{ k: 'id', t: 'Tour', cls: 'nw', f: (t) => html`<a href="#/dispo?date=${t.date}&tour=${t.id}">${t.id}</a>`, s: (t) => t.id }, { k: 'd', t: 'Datum', cls: 'nw', f: (t) => fDate(t.date), s: (t) => t.date }, { k: 'v', t: 'Fahrzeug', f: (t) => (veh(t.vehicleId) || {}).plate, s: (t) => t.vehicleId }, { k: 'n', t: 'Stopps', cls: 'num', f: (t) => t.seq.length, s: (t) => t.seq.length }, { k: 's', t: 'Status', f: (t) => chip(t.status, t.status === 'abgeschlossen' ? 'green' : t.status === 'unterwegs' ? 'violet' : 'blue'), s: (t) => t.status, x: (t) => t.status }], DB.tours.filter((t) => t.driverId === id), { sort: { k: 'd', dir: -1 }, name: 'touren-' + d.name, noun: 'Touren', empty: 'Noch keine Touren' }),
    z: (() => { const h = d.hours, tot = sum(h), max = Math.max(10, ...h); return html`<div class="card flat"><div class="card-h"><h2>Arbeitszeit der letzten 5 Arbeitstage</h2><span class="muted tiny">Richtwert 9 Std. pro Tag, 48 Std. pro Woche</span></div>
      <div class="week" role="img" aria-label="Arbeitsstunden pro Tag">${h.map((x, i) => html`<div class="${x > 9 ? 'warn' : ''}" style="height:${(x / max) * 100}%"><small>${nf(x, 1)}</small></div>`)}</div>
      <div class="legend">${h.map((x, i) => html`<span style="flex:1;text-align:center">Tag −${5 - i}</span>`)}</div>
      <dl class="mt">${kv('Summe', `${nf(tot, 1)} Std.`)}${kv('Durchschnitt', `${nf(tot / h.length, 1)} Std. pro Tag`)}</dl>
      ${h.some((x) => x > 9) ? notice('amber', 'An mindestens einem Tag lag die Einsatzzeit über 9 Stunden. Bitte Ruhezeiten prüfen.') : notice('green', 'Alle Tage liegen im Richtwert.', 'check')}
      <p class="note-demo mt-s">Die Zeiten sind Beispielwerte. Echte Lenk- und Ruhezeiten kommen aus dem digitalen Fahrtenschreiber (Telematik-Schnittstelle).</p></div>`; })(),
  }[cur];
  return html`${pageHead(html`${d.name} ${chip(st.label, st.tone)}`, `${branchName(d.branch)} · ${d.licenses.join(', ')}`, w ? html`<button type="button" class="btn" data-act="drv.edit" data-id="${d.id}">${ic('edit')} Bearbeiten</button>` : '', html`${backTo('#/fahrer', 'Fahrer')} › ${d.name}`)}${tabs('dd-' + id, tl, 'p')}${body}`;
}
act('drv.pause', 'fahrer', (d, el) => { const x = drv(d.id); x.status = el.checked ? 'pause' : 'verfuegbar'; audit('Fahrer', x.name, 'Status', x.status); commit(); });
act('drv.consent', 'fahrer', (d, el) => { const x = drv(d.id); x.consent = el.checked; audit('Fahrer', x.name, 'Datenschutz', `Standort-Einwilligung: ${x.consent ? 'erteilt' : 'widerrufen'}`); secLog('Standort-Einwilligung', `${x.name}: ${x.consent ? 'erteilt' : 'widerrufen'}`); commit(); });
act('abs.add', 'fahrer', (d) => openModal({ title: 'Abwesenheit eintragen', form: 'abs.save', cls: 'small', body: html`<input type="hidden" name="id" value="${d.id}"><div class="stack">${fld('Art', 'kind', 'Urlaub', { type: 'select', options: ['Urlaub', 'Krank', 'Schulung', 'Sonstiges'] })}${fld('Von', 'from', today(), { type: 'date', req: true })}${fld('Bis', 'to', today(), { type: 'date', req: true })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Eintragen</button>` }));
onSubmit('abs.save', 'fahrer', (f) => {
  if (f.to < f.from) return toast('Das Ende liegt vor dem Beginn.', 'bad');
  const d = drv(f.id); d.absences.push({ from: f.from, to: f.to, kind: f.kind });
  const hit = DB.tours.filter((t) => t.driverId === d.id && t.status === 'geplant' && t.date >= f.from && t.date <= f.to);
  audit('Fahrer', d.name, 'Abwesenheit', `${f.kind} ${fDate(f.from)}–${fDate(f.to)}`); closeModal(); commit();
  if (hit.length) toast(`Achtung: ${hit.length} geplante Tour${hit.length > 1 ? 'en' : ''} (${hit.map((t) => t.id).join(', ')}) liegen in diesem Zeitraum. Bitte neu disponieren.`, 'bad'); else toast('Abwesenheit eingetragen.', 'ok');
});
act('abs.del', 'fahrer', (d) => { const x = drv(d.id); x.absences.splice(+d.i, 1); commit(); });
act('qual.add', 'fahrer', (d) => openModal({ title: 'Nachweis hinzufügen', form: 'qual.save', cls: 'small', body: html`<input type="hidden" name="id" value="${d.id}"><div class="stack">${fld('Bezeichnung', 'name', '', { req: true, ph: 'z. B. Staplerschein' })}${fld('Gültig bis (leer = unbefristet)', 'exp', '', { type: 'date' })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Hinzufügen</button>` }));
onSubmit('qual.save', 'fahrer', (f) => { const x = drv(f.id); x.quals.push({ type: f.name, name: f.name, exp: f.exp || null }); audit('Fahrer', x.name, 'Qualifikation', f.name); closeModal(); commit(); });
act('qual.del', 'fahrer', (d) => { const x = drv(d.id); x.quals.splice(+d.i, 1); commit(); });

/* ---------- Fuhrpark ---------- */
const EQUIP = [['hebebuehne', 'Hebebühne / Ladebordwand'], ['kuehl', 'Kühlung'], ['gurte', 'Zurrgurte-Set'], ['rollwagen', 'Rollwagen'], ['telematik', 'Telematik-Box']];
view('fuhrpark', {
  mod: 'fuhrpark', title: 'Fuhrpark',
  render(seg) {
    if (seg[0]) return vehicleDetail(seg[0]);
    const q = fv('v.q').trim().toLowerCase();
    const rows = scoped(DB.vehicles).filter((v) => (!fv('v.st') || vehicleState(v).id === fv('v.st')) && (!q || [v.plate, v.model, v.make, vtype(v.type).name].join(' ').toLowerCase().includes(q)));
    const due = (iso) => { const d = dueState(iso, 30); return chip(`${fDate(iso)}`, d.tone, d.label); };
    const cols = [
      { k: 'p', t: 'Kennzeichen', cls: 'nw', f: (v) => html`<a href="#/fuhrpark/${v.id}">${v.plate}</a>`, s: (v) => v.plate },
      { k: 't', t: 'Typ', f: (v) => html`${vtype(v.type).name}<div class="tiny muted">${v.make} ${v.model}</div>`, s: (v) => v.type, x: (v) => `${vtype(v.type).name} ${v.make} ${v.model}` },
      { k: 'b', t: 'Standort', f: (v) => branchName(v.branch), s: (v) => v.branch },
      { k: 'l', t: 'Nutzlast / Volumen', cls: 'nw', f: (v) => `${nf(v.payload)} kg · ${nf(v.volume)} m³`, s: (v) => v.payload },
      { k: 'e', t: 'Ausstattung', f: (v) => v.equipment.length ? v.equipment.map((x) => (EQUIP.find((e) => e[0] === x) || [0, x])[1]).join(', ') : '–', x: (v) => v.equipment.join(', ') },
      { k: 's', t: 'Status', cls: 'nw', f: (v) => { const s = vehicleState(v); return chip(s.label, s.tone); }, s: (v) => vehicleState(v).id, x: (v) => vehicleState(v).label },
      { k: 'h', t: 'Hauptuntersuchung', cls: 'nw', f: (v) => due(v.tuev), s: (v) => v.tuev, x: (v) => v.tuev },
      { k: 'w', t: 'Service', cls: 'nw', f: (v) => due(v.service), s: (v) => v.service, x: (v) => v.service },
    ];
    return html`${pageHead('Fuhrpark', 'Fahrzeuge, Ausstattung, Termine, Kosten und Defekte.', canWrite('fuhrpark') ? html`<button type="button" class="btn primary" data-act="veh.new">${ic('plus')} Neues Fahrzeug</button>` : '')}
      <div class="toolbar">${bindInp('Suche', 'v.q', 'Kennzeichen, Typ, Hersteller', { cls: 'search' })}${bindSel('Status', 'v.st', [['', 'Alle'], ['frei', 'Verfügbar'], ['einsatz', 'Im Einsatz'], ['werkstatt', 'Werkstatt'], ['gesperrt', 'Gesperrt']])}</div>
      ${table('vehicles', cols, rows, { sort: { k: 'p', dir: 1 }, name: 'fuhrpark', noun: 'Fahrzeugen' })}`;
  },
});
function vehForm(v) {
  const f = v || { plate: '', type: 'trans', make: 'Mercedes-Benz', model: '', branch: 'b1', equipment: [], tuev: addDays(today(), 365), service: addDays(today(), 180), insurance: addDays(today(), 365), insurer: '', km: 0 };
  return html`<input type="hidden" name="id" value="${v ? v.id : ''}"><div class="fgrid">${fld('Kennzeichen', 'plate', f.plate, { req: true, ph: 'F-JW 501' })}${fld('Fahrzeugtyp', 'type', f.type, { type: 'select', options: DB.settings.vehicleTypes.map((t) => [t.id, `${t.name} (${nf(t.payload)} kg, ${t.volume} m³)`]) })}${fld('Standort', 'branch', f.branch, { type: 'select', options: BRANCHES.map((b) => [b.id, b.name]) })}
    ${fld('Hersteller', 'make', f.make)}${fld('Modell', 'model', f.model)}${fld('Kilometerstand', 'km', f.km, { type: 'number', min: 0 })}
    ${fld('Nächste Hauptuntersuchung', 'tuev', f.tuev, { type: 'date', req: true })}${fld('Nächster Service', 'service', f.service, { type: 'date', req: true })}${fld('Versicherung gültig bis', 'insurance', f.insurance, { type: 'date', req: true })}
    ${fld('Versicherer', 'insurer', f.insurer || '', { cls: 'wide' })}<div class="wide"><div class="fld"><span>Ausstattung</span></div>${checks('equipment', EQUIP, f.equipment)}</div></div>`;
}
act('veh.new', 'fuhrpark', () => openModal({ title: 'Neues Fahrzeug', wide: true, form: 'veh.save', body: vehForm(null), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Anlegen</button>` }));
act('veh.edit', 'fuhrpark', (d) => openModal({ title: 'Fahrzeug bearbeiten', wide: true, form: 'veh.save', body: vehForm(veh(d.id)), foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Speichern</button>` }));
onSubmit('veh.save', 'fuhrpark', (f) => {
  if (DB.vehicles.some((v) => v.id !== f.id && v.plate.toLowerCase() === f.plate.trim().toLowerCase())) return toast('Dieses Kennzeichen gibt es schon.', 'bad');
  let v = f.id ? veh(f.id) : null; const t = vtype(f.type);
  if (!v) { v = { id: uid('v'), status: 'verfuegbar', defects: [], docs: ['Fahrzeugschein'], costs: { fuel: 0, maint: 0, ins: 0 }, note: '' }; DB.vehicles.push(v); }
  Object.assign(v, { plate: f.plate.trim(), type: f.type, make: f.make, model: f.model, branch: f.branch, km: +f.km || 0, tuev: f.tuev, service: f.service, insurance: f.insurance, insurer: f.insurer, equipment: f.equipment || [], payload: t.payload, volume: t.volume });
  audit('Fahrzeug', v.plate, f.id ? 'bearbeitet' : 'erstellt', vtype(v.type).name); closeModal(); commit(); toast('Fahrzeug gespeichert.', 'ok');
});
function vehicleDetail(id) {
  const v = veh(id); if (!v) return notFound('Fahrzeug', '#/fuhrpark');
  const tl = [['s', 'Stammdaten'], ['t', 'Termine'], ['k', 'Kosten'], ['d', 'Defekte'], ['e', 'Einsätze']];
  const cur = UI.tab['vd-' + id] || 's';
  const st = vehicleState(v), w = canWrite('fuhrpark'), ty = vtype(v.type);
  const dd = (label, iso, key) => { const x = dueState(iso, 30); return html`<li>${ic('clock')}<div class="grow"><b>${label}</b><div class="tiny muted">${fDate(iso)}</div></div>${chip(x.label, x.tone)}${w ? html`<button type="button" class="btn sm" data-act="veh.date" data-id="${v.id}" data-key="${key}">Neu setzen</button>` : ''}</li>`; };
  const total = sum(Object.values(v.costs));
  const perDay = 62; const daysToService = diffDays(v.service, today());
  const body = {
    s: html`<div class="grid g2"><section class="card flat"><dl>${kv('Kennzeichen', html`<span class="mono">${v.plate}</span>`)}${kv('Typ', ty.name)}${kv('Fahrzeug', `${v.make} ${v.model}`)}${kv('Standort', branchName(v.branch))}${kv('Nutzlast', `${nf(v.payload)} kg`)}${kv('Ladevolumen', `${nf(v.volume)} m³`)}${kv('Ausstattung', v.equipment.length ? v.equipment.map((x) => (EQUIP.find((e) => e[0] === x) || [0, x])[1]).join(', ') : 'keine')}${kv('Erforderliche Fahrerlaubnis', ty.req.join(' oder '))}${kv('Kilometerstand', `${nf(v.km)} km`)}${kv('Standardfahrer', DB.drivers.filter((d) => d.vehicleId === v.id).map((d) => d.name).join(', ') || '–')}${kv('Hinweis', v.note || '–')}</dl></section>
      <section class="card flat"><div class="card-h"><h2>Status</h2></div><p>${chip(st.label, st.tone)}</p>${w ? html`<div class="row mt">${v.status === 'verfuegbar' ? html`<button type="button" class="btn danger" data-act="veh.lock" data-id="${v.id}">${ic('lock')} Sperren</button><button type="button" class="btn" data-act="veh.workshop" data-id="${v.id}">${ic('wrench')} In die Werkstatt</button>` : html`<button type="button" class="btn primary" data-act="veh.free" data-id="${v.id}">${ic('check')} Freigeben</button>`}</div>` : ''}
      ${v.status !== 'verfuegbar' ? html`<p class="mt-s muted">Gesperrte Fahrzeuge und Fahrzeuge in der Werkstatt können nicht in Touren disponiert werden.</p>` : ''}
      <div class="mt"><h3 style="font-size:.95rem">Wartungsprognose</h3><p class="muted tiny">${daysToService < 0 ? 'Service ist überfällig.' : `Service in ${daysToService} Tagen. Bei ca. ${perDay} km pro Betriebstag etwa ${nf(Math.max(0, daysToService) * perDay)} km bis dahin.`} Regelbasierte Schätzung, kein Telematik-Modell.</p></div></section></div>`,
    t: html`<div class="card flat"><div class="card-h"><h2>Prüf- und Wartungstermine</h2></div><ul class="list">${dd('Hauptuntersuchung (HU)', v.tuev, 'tuev')}${dd('Service / Inspektion', v.service, 'service')}${dd('Versicherung', v.insurance, 'insurance')}</ul><p class="tiny muted mt-s">Versicherer: ${v.insurer || '–'} · Dokumente: ${v.docs.join(', ')}</p></div>`,
    k: html`<div class="grid g2"><section class="card flat"><div class="card-h"><h2>Kosten pro Monat</h2></div>${barChart([{ label: 'Kraftstoff', v: v.costs.fuel, color: '#4F6BFF' }, { label: 'Wartung', v: v.costs.maint, color: '#FFB020' }, { label: 'Versicherung', v: v.costs.ins, color: '#27D3A2' }], { h: 200, fmt: (x) => eur(x), label: 'Kosten je Monat' })}</section>
      <section class="card flat"><dl>${kv('Summe pro Monat', eur(total))}${kv('Kosten je Kilometer (Plan)', eur(ty.perKm))}${kv('CO₂ je Kilometer (Plan)', `${nf(ty.co2 * 1000)} g`)}</dl></section></div>`,
    d: html`<div class="card flat"><div class="card-h"><h2>Defekte und Reparaturen</h2>${w ? html`<button type="button" class="btn sm" data-act="def.add" data-id="${v.id}">${ic('plus')} Defekt melden</button>` : ''}</div><ul class="list">${v.defects.length ? v.defects.slice().reverse().map((x) => html`<li>${chip(x.open ? 'offen' : 'behoben', x.open ? 'red' : 'green')}<div class="grow"><b>${x.text}</b><div class="tiny muted">${fDT(x.ts)} · ${x.by}</div></div>${w && x.open ? html`<button type="button" class="btn sm" data-act="def.fix" data-id="${v.id}" data-d="${x.id}">Als behoben markieren</button>` : ''}</li>`) : html`<li class="muted">Keine Defekte erfasst.</li>`}</ul></div>`,
    e: table('vtours-' + id, [{ k: 'id', t: 'Tour', cls: 'nw', f: (t) => html`<a href="#/dispo?date=${t.date}&tour=${t.id}">${t.id}</a>`, s: (t) => t.id }, { k: 'd', t: 'Datum', cls: 'nw', f: (t) => fDate(t.date), s: (t) => t.date }, { k: 'f', t: 'Fahrer', f: (t) => (drv(t.driverId) || {}).name, s: (t) => t.driverId }, { k: 's', t: 'Status', f: (t) => chip(t.status, t.status === 'abgeschlossen' ? 'green' : t.status === 'unterwegs' ? 'violet' : 'blue'), s: (t) => t.status, x: (t) => t.status }], DB.tours.filter((t) => t.vehicleId === id), { sort: { k: 'd', dir: -1 }, name: 'einsaetze-' + v.plate, noun: 'Einsätzen', empty: 'Noch keine Einsätze' }),
  }[cur];
  return html`${pageHead(html`${v.plate} ${chip(st.label, st.tone)}`, `${ty.name} · ${branchName(v.branch)}`, w ? html`<button type="button" class="btn" data-act="veh.edit" data-id="${v.id}">${ic('edit')} Bearbeiten</button>` : '', html`${backTo('#/fuhrpark', 'Fuhrpark')} › ${v.plate}`)}${tabs('vd-' + id, tl, 's')}${body}`;
}
act('veh.date', 'fuhrpark', (d) => { const v = veh(d.id); const label = { tuev: 'Hauptuntersuchung', service: 'Service', insurance: 'Versicherung' }[d.key]; openModal({ title: `${label} neu setzen`, form: 'veh.date', cls: 'small', body: html`<input type="hidden" name="id" value="${v.id}"><input type="hidden" name="key" value="${d.key}">${fld('Neuer Termin', 'date', addDays(today(), d.key === 'service' ? 180 : 365), { type: 'date', req: true })}`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Speichern</button>` }); });
onSubmit('veh.date', 'fuhrpark', (f) => { const v = veh(f.id); v[f.key] = f.date; audit('Fahrzeug', v.plate, 'Termin', `${f.key}: ${fDate(f.date)}`); closeModal(); commit(); });
act('veh.lock', 'fuhrpark', (d) => inputBox('Fahrzeug sperren', 'Grund', '', (r) => { const v = veh(d.id); v.status = 'gesperrt'; v.note = r; v.defects.push({ id: uid('d'), ts: NOW(), text: r, by: curUser().name, open: true }); audit('Fahrzeug', v.plate, 'gesperrt', r); pushNotif(`${v.plate} wurde gesperrt: ${r}`, 'warn', `#/fuhrpark/${v.id}`); commit(); toast(`${v.plate} gesperrt.`, 'ok'); }, 'Sperren'));
act('veh.workshop', 'fuhrpark', (d) => inputBox('In die Werkstatt', 'Grund / Auftrag', 'Inspektion', (r) => { const v = veh(d.id); v.status = 'werkstatt'; v.note = r; audit('Fahrzeug', v.plate, 'Werkstatt', r); commit(); toast(`${v.plate} ist in der Werkstatt.`, 'ok'); }, 'Speichern'));
act('veh.free', 'fuhrpark', (d) => { const v = veh(d.id); const open = v.defects.filter((x) => x.open).length; const doIt = () => { v.status = 'verfuegbar'; v.note = ''; v.defects.forEach((x) => { x.open = false; }); audit('Fahrzeug', v.plate, 'freigegeben', ''); commit(); toast(`${v.plate} ist wieder einsatzbereit.`, 'ok'); }; if (open) confirmBox(`${open} Defekt${open > 1 ? 'e sind' : ' ist'} noch offen. Fahrzeug trotzdem freigeben? Die Defekte werden als behoben markiert.`, 'Freigeben', doIt, 'primary'); else doIt(); });
act('def.add', 'fuhrpark', (d) => openModal({ title: 'Defekt melden', form: 'def.save', cls: 'small', body: html`<input type="hidden" name="id" value="${d.id}"><div class="stack">${fld('Beschreibung', 'text', '', { req: true, type: 'textarea' })}<label class="chk"><input type="checkbox" name="lock"><span>Fahrzeug sofort sperren</span></label></div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Melden</button>` }));
onSubmit('def.save', 'fuhrpark', (f) => { const v = veh(f.id); v.defects.push({ id: uid('d'), ts: NOW(), text: f.text.trim(), by: curUser().name, open: true }); if (f.lock) { v.status = 'gesperrt'; v.note = f.text.trim(); } audit('Fahrzeug', v.plate, 'Defekt', f.text.trim()); closeModal(); commit(); toast('Defekt erfasst.', 'ok'); });
act('def.fix', 'fuhrpark', (d) => { const v = veh(d.id); const x = v.defects.find((y) => y.id === d.d); x.open = false; audit('Fahrzeug', v.plate, 'Defekt behoben', x.text); commit(); });

/* ---------- Frachtführer ---------- */
const CARRIER_STATUS = { angefragt: ['Angefragt', 'amber'], angenommen: ['Angenommen', 'blue'], abgelehnt: ['Abgelehnt', 'red'], unterwegs: ['Unterwegs', 'violet'], geliefert: ['Geliefert', 'green'] };
const carrierChip = (s) => chip(...(CARRIER_STATUS[s] || [s, 'gray']));
view('partner', {
  mod: 'partner', title: 'Frachtführer',
  render(seg) {
    if (seg[0]) return partnerDetail(seg[0]);
    const q = fv('p.q').trim().toLowerCase();
    const act_ = (p) => DB.orders.filter((o) => o.carrier && o.carrier.partnerId === p.id && !['geliefert'].includes(o.carrier.status) && o.status !== 'storniert').length;
    const rows = DB.partners.filter((p) => !q || [p.name, p.city, p.areas, p.capacity].join(' ').toLowerCase().includes(q));
    const cols = [
      { k: 'n', t: 'Frachtführer', f: (p) => html`<a href="#/partner/${p.id}">${p.name}</a>`, s: (p) => p.name, x: (p) => p.name },
      { k: 'c', t: 'Sitz', f: (p) => p.city, s: (p) => p.city }, { k: 'a', t: 'Gebiet', f: (p) => p.areas, s: (p) => p.areas },
      { k: 'f', t: 'Flotte / Kapazität', f: (p) => html`${p.fleet}<div class="tiny muted">${p.capacity}</div>`, x: (p) => `${p.fleet}; ${p.capacity}` },
      { k: 'k', t: 'Frachtpreis', cls: 'nw', f: (p) => `${eur(p.perKm)}/km, mind. ${eur(p.min)}`, s: (p) => p.perKm },
      { k: 'r', t: 'Bewertung', cls: 'nw', f: (p) => html`${ic('star')} ${nf(p.rating, 1)} · ${p.onTime} % pünktlich`, s: (p) => p.rating, x: (p) => `${p.rating}; ${p.onTime} %` },
      { k: 'o', t: 'Offene Aufträge', cls: 'num', f: (p) => act_(p), s: (p) => act_(p) },
    ];
    return html`${pageHead('Frachtführer und Partner', 'Externe Speditionen für Fahrten, die die eigene Flotte nicht übernehmen kann.', canWrite('partner') ? html`<button type="button" class="btn primary" data-act="par.new">${ic('plus')} Neuer Frachtführer</button>` : '')}
      <div class="toolbar">${bindInp('Suche', 'p.q', 'Name, Ort, Gebiet', { cls: 'search' })}</div>
      ${table('partners', cols, rows, { sort: { k: 'n', dir: 1 }, name: 'frachtfuehrer', noun: 'Frachtführern' })}`;
  },
});
act('par.new', 'partner', () => openModal({ title: 'Neuer Frachtführer', wide: true, form: 'par.save', body: html`<div class="fgrid">${fld('Name', 'name', '', { req: true, cls: 'wide' })}${fld('Sitz', 'city', 'Frankfurt am Main', { type: 'select', options: CITIES.map((c) => c.name) })}${fld('Ansprechpartner', 'contact', '', { req: true })}${fld('E-Mail', 'email', '', { type: 'email', req: true })}${fld('Telefon', 'phone', '', { type: 'tel' })}${fld('Flotte', 'fleet', '')}${fld('Kapazität', 'capacity', '')}${fld('Liefergebiet', 'areas', '')}${fld('Preis je km (€)', 'perKm', '0.95', { type: 'number', min: 0, step: '0.01', req: true })}${fld('Mindestpreis (€)', 'min', '120', { type: 'number', min: 0, step: '1', req: true })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Anlegen</button>` }));
onSubmit('par.save', 'partner', (f) => { const p = { id: uid('p'), name: f.name, city: f.city, contact: f.contact, phone: f.phone, email: f.email, fleet: f.fleet, capacity: f.capacity, areas: f.areas, perKm: +f.perKm, min: +f.min, rating: 0, onTime: 0, docs: [], active: true }; DB.partners.push(p); audit('Frachtführer', p.name, 'erstellt', ''); closeModal(); commit(); toast('Frachtführer angelegt.', 'ok'); location.hash = `#/partner/${p.id}`; });
function partnerDetail(id) {
  const p = par(id); if (!p) return notFound('Frachtführer', '#/partner');
  const tl = [['p', 'Profil'], ['o', 'Aufträge'], ['r', 'Preise'], ['n', 'Nachweise'], ['h', 'Historie']];
  const cur = UI.tab['pd-' + id] || 'p', w = canWrite('partner') || canWrite('dispo');
  const os = DB.orders.filter((o) => o.carrier && o.carrier.partnerId === id && o.status !== 'storniert');
  const active = os.filter((o) => o.carrier.status !== 'geliefert');
  const ex = DB.orders.find((o) => o.status === 'offen' && !o.carrier);
  const body = {
    p: html`<div class="grid g2"><section class="card flat"><dl>${kv('Ansprechpartner', p.contact)}${kv('E-Mail', html`<a href="mailto:${p.email}">${p.email}</a>`)}${kv('Telefon', html`<a href="tel:${(p.phone || '').replace(/\s/g, '')}">${p.phone}</a>`)}${kv('Sitz', p.city)}${kv('Liefergebiet', p.areas)}${kv('Flotte', p.fleet)}${kv('Kapazität', p.capacity)}</dl></section>
      <section class="card flat"><div class="card-h"><h2>Auslastung durch uns</h2></div>${progress(active.length, 6)}<p class="tiny muted mt-s">${active.length} laufende Aufträge (Richtwert: 6 gleichzeitig)</p><dl class="mt">${kv('Bewertung', html`${ic('star')} ${nf(p.rating, 1)} von 5`)}${kv('Pünktlichkeit', `${p.onTime} %`)}${kv('Aufträge gesamt', os.length)}</dl></section></div>`,
    o: html`${os.length ? table('pd-orders-' + id, [
      { k: 'nr', t: 'Auftrag', cls: 'nw', f: (o) => html`<a href="#/auftraege/${o.id}">${o.nr}</a>`, s: (o) => o.nr }, { k: 'r', t: 'Strecke', f: (o) => route(o), s: (o) => o.pickup.city }, { k: 'd', t: 'Abholung', cls: 'nw', f: (o) => fDate(o.pickup.date), s: (o) => o.pickup.date },
      { k: 'p', t: 'Frachtpreis', cls: 'num nw', f: (o) => eur(o.carrier.price), s: (o) => o.carrier.price }, { k: 's', t: 'Vergabe', cls: 'nw', f: (o) => carrierChip(o.carrier.status), s: (o) => o.carrier.status, x: (o) => o.carrier.status },
      { k: 'a', t: 'Antwort (Demo)', f: (o) => w ? partnerButtons(o) : '', noExport: true },
    ], os, { sort: { k: 'd', dir: -1 }, name: 'partner-auftraege', noun: 'Aufträgen', noExport: true }) : empty('Noch keine Aufträge an diesen Frachtführer vergeben')}
      <p class="note-demo mt">Frachtführer antworten normalerweise über ihr Portal oder per E-Mail. Hier simulierst du ihre Antworten mit den Schaltflächen.</p>`,
    r: html`<div class="grid g2"><section class="card flat"><dl>${kv('Preis je Kilometer', eur(p.perKm))}${kv('Mindestpreis', eur(p.min))}</dl></section>${ex ? html`<section class="card flat"><div class="card-h"><h2>Beispiel</h2></div><p class="tiny muted">${ex.nr}: ${route(ex)}, ${nf(ex.km || 0)} km</p><p><b>${eur(carrierPrice(ex, p))}</b> netto Frachtpreis</p></section>` : ''}</div>`,
    n: html`<div class="card flat"><ul class="list">${p.docs.length ? p.docs.map((x) => { const ds = dueState(x.exp, 30); return html`<li>${ic('file')}<div class="grow"><b>${x.name}</b><div class="tiny muted">gültig bis ${fDate(x.exp)}</div></div>${chip(ds.n < 0 ? 'abgelaufen' : ds.tone === 'amber' ? `läuft in ${ds.n} Tg. ab` : 'gültig', ds.tone)}</li>`; }) : html`<li class="muted">Keine Nachweise hinterlegt.</li>`}</ul></div>`,
    h: html`<ul class="list">${DB.audit.filter((a) => a.text.includes(p.name) || a.ref === p.name).map((a) => html`<li><div class="grow"><b>${a.action}</b> · ${a.text}<div class="tiny muted">${a.user} · ${fDT(a.ts)}</div></div></li>`)}${os.filter((o) => o.carrier.status === 'geliefert').map((o) => html`<li>${chip('geliefert', 'green')}<div class="grow"><a href="#/auftraege/${o.id}">${o.nr}</a> ${route(o)}<div class="tiny muted">${fDate(o.delivery.date)} · ${eur(o.carrier.price)}</div></div></li>`)}</ul>`,
  }[cur];
  return html`${pageHead(p.name, `${p.city} · ${p.areas}`, '', html`${backTo('#/partner', 'Frachtführer')} › ${p.name}`)}${tabs('pd-' + id, tl, 'p')}${body}`;
}
function partnerButtons(o) {
  const s = o.carrier.status;
  const b = (a, l, cls = '') => html`<button type="button" class="btn sm ${cls}" data-act="carrier.respond" data-id="${o.id}" data-r="${a}">${l}</button>`;
  return html`<span class="row gap-s">${s === 'angefragt' ? html`${b('angenommen', 'Annehmen', 'primary')}${b('abgelehnt', 'Ablehnen')}` : s === 'angenommen' ? b('unterwegs', 'Abgeholt melden') : s === 'unterwegs' ? b('geliefert', 'Zustellung melden', 'primary') : s === 'abgelehnt' ? html`<span class="muted tiny">neu vergeben</span>` : html`<span class="muted tiny">erledigt</span>`}</span>`;
}
act('carrier.respond', null, (d) => {
  if (!canWrite('partner') && !canWrite('dispo')) return toast('Dafür fehlt dir die Berechtigung.', 'bad');
  const o = ord(d.id), p = par(o.carrier.partnerId);
  o.carrier.status = d.r; o.rev++;
  if (d.r === 'angenommen') { setStatus(o, 'geplant', `${p.name} hat den Auftrag angenommen`, p.name); pushNotif(`${p.name} hat ${o.nr} angenommen.`, 'ok', `#/auftraege/${o.id}`); }
  if (d.r === 'abgelehnt') { addHistory(o, o.status, `${p.name} hat den Auftrag abgelehnt`, p.name); pushNotif(`${p.name} hat ${o.nr} abgelehnt. Bitte neu vergeben.`, 'warn', `#/auftraege/${o.id}`); }
  if (d.r === 'unterwegs') setStatus(o, 'abgeholt', `Abgeholt durch ${p.name}`, p.name);
  if (d.r === 'geliefert') { setStatus(o, 'zugestellt', `Zugestellt durch ${p.name}`, p.name); o.pod = { name: o.delivery.contact || 'Empfänger', ts: NOW(), sig: null, photos: [], by: p.name, partner: true }; }
  audit('Auftrag', o.nr, 'Frachtführer', `${p.name}: ${CARRIER_STATUS[d.r][0]}`);
  commit(); toast(`${p.name}: ${CARRIER_STATUS[d.r][0]}`, 'ok');
});
