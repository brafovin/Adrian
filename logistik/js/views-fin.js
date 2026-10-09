'use strict';
/* JWG.logistik – Angebote, Abrechnung, Dokumente, Lager */

/* ---------- Dokumentvorlagen (druckbar) ---------- */
const docHead = (title, nr) => { const c = DB.settings.company; return html`<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><b style="font-size:17px">${c.name}</b><br>${c.street}, ${c.zip} ${c.city}<br>${c.phone} · ${c.email}</div><div style="text-align:right"><b style="font-size:17px">${title}</b><br>${nr}</div></div><hr>`; };
const docFoot = () => { const c = DB.settings.company; return html`<p style="font-size:11px;color:#555;margin-top:18px">${c.name} · ${c.legal} · USt-IdNr. ${c.vatId}<br>Bank: IBAN ${c.iban}, BIC ${c.bic}</p>`; };
const addrLines = (a) => html`<b>${a.name}</b><br>${a.street}<br>${a.zip} ${a.city}${a.contact ? html`<br>Ansprechpartner: ${a.contact}${a.phone ? ', ' + a.phone : ''}` : ''}`;
function sumTable(net, vat) { return html`<tr><td colspan="3" class="r">Summe netto</td><td class="r">${eur(net)}</td></tr><tr><td colspan="3" class="r">MwSt. ${DB.settings.vat} %</td><td class="r">${eur(vat)}</td></tr><tr class="tot"><td colspan="3" class="r">Gesamtbetrag brutto</td><td class="r">${eur(net + vat)}</td></tr>`; }
function docBody(kind, id) {
  const co = DB.settings.company;
  if (kind === 'invoice') {
    const i = DB.invoices.find((x) => x.id === id); if (!i) return null; const c = cust(i.customerId) || {}; const cr = i.kind === 'gutschrift';
    return { title: `${cr ? 'Gutschrift' : 'Rechnung'} ${i.nr}`, body: html`${docHead(cr ? 'Gutschrift' : 'Rechnung', i.nr)}<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div>${addrLines({ name: c.name, street: (c.billing || {}).street, zip: (c.billing || {}).zip, city: (c.billing || {}).city })}</div><div style="text-align:right">Datum: ${fDate(i.date)}<br>${cr ? `Bezug: ${i.refNr}` : `Zahlbar bis: ${fDate(i.due)}`}<br>Kundennummer: ${c.nr}</div></div>
      <h3>${cr ? 'Gutschrift' : 'Rechnung'} ${i.nr}</h3><table><thead><tr><th>Pos.</th><th colspan="2">Leistung</th><th class="r">Netto</th></tr></thead><tbody>${i.lines.map((l, n) => html`<tr><td>${n + 1}</td><td colspan="2">${l.text}</td><td class="r">${eur(l.net)}</td></tr>`)}${sumTable(i.net, i.vat)}</tbody></table>
      <p>${cr ? 'Der Betrag wird mit offenen Forderungen verrechnet oder erstattet.' : `Zahlungsbedingung: ${c.terms ? c.terms + ' Tage netto' : 'sofort fällig'}. Bitte überweisen Sie unter Angabe der Rechnungsnummer.`}</p>${docFoot()}` };
  }
  if (kind === 'quote') {
    const q = DB.quotes.find((x) => x.id === id); if (!q) return null; const c = cust(q.customerId) || {};
    return { title: `Angebot ${q.nr}`, body: html`${docHead('Angebot', q.nr)}<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div>${addrLines({ name: c.name, street: c.street, zip: c.zip, city: c.city })}</div><div style="text-align:right">Datum: ${fDate(q.date)}<br>Gültig bis: ${fDate(q.valid)}</div></div><h3>Angebot für Transport ${q.from} → ${q.to}</h3><p>${ttype(q.type).name}, ${nf(q.weight, 1)} kg${q.volume ? `, ${nf(q.volume, 2)} m³` : ''}${q.pallets ? `, ${q.pallets} Paletten` : ''}</p>
      <table><thead><tr><th colspan="3">Position</th><th class="r">Netto</th></tr></thead><tbody>${q.lines.map((l) => html`<tr><td colspan="3">${l.label}</td><td class="r">${eur(l.amount)}</td></tr>`)}${sumTable(q.net, Math.round(q.net * DB.settings.vat) / 100)}</tbody></table><p>Es gelten unsere Allgemeinen Geschäftsbedingungen (ADSp). Dieses Angebot ist freibleibend bis zum genannten Datum.</p>${docFoot()}` };
  }
  const o = ord(id); if (!o) return null; const c = cust(o.customerId) || {};
  if (kind === 'confirm') { const vat = Math.round(o.price * DB.settings.vat) / 100; return { title: `Auftragsbestätigung ${o.nr}`, body: html`${docHead('Auftragsbestätigung', o.nr)}<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div>${addrLines({ name: c.name, street: c.street, zip: c.zip, city: c.city })}</div><div style="text-align:right">Datum: ${fDate(NOW())}<br>Sendungsnummer: ${o.tracking}${o.ref ? html`<br>Ihre Referenz: ${o.ref}` : ''}</div></div>
    <h3>Wir bestätigen Ihren Transportauftrag ${o.nr}</h3><table><tbody><tr><th>Abholung</th><td>${addrLines(o.pickup)}<br>${fDay(o.pickup.date)}, ${o.pickup.from}–${o.pickup.to} Uhr</td></tr><tr><th>Lieferung</th><td>${addrLines(o.delivery)}<br>${fDay(o.delivery.date)}, ${o.delivery.from}–${o.delivery.to} Uhr</td></tr><tr><th>Ware</th><td>${o.goods.desc}<br>${o.goods.pieces} Packstücke${o.goods.pallets ? `, ${o.goods.pallets} Paletten` : ''}, ${nf(o.goods.weight, 1)} kg, ${nf(o.goods.volume, 2)} m³</td></tr><tr><th>Transportart</th><td>${ttype(o.type).name}, Priorität ${prioOf(o.prio).name}${o.extras.length ? '<br>Zusatzleistungen: ' + o.extras.map(extraName).join(', ') : ''}</td></tr></tbody></table>
    <table><tbody>${sumTable(o.price, vat)}</tbody></table><p>Sie können die Sendung jederzeit unter ${trackLink(o.tracking)} verfolgen.</p>${docFoot()}` }; }
  if (kind === 'delivnote') return { title: `Lieferschein ${o.nr}`, body: html`${docHead('Lieferschein', o.nr)}<div style="display:flex;gap:24px;flex-wrap:wrap"><div style="flex:1"><b>Absender</b><br>${addrLines(o.pickup)}</div><div style="flex:1"><b>Empfänger</b><br>${addrLines(o.delivery)}</div></div><p>${(DB.settings.templates.find((t) => t.id === 'delivnote') || {}).body}</p>
    <table><thead><tr><th>Beschreibung</th><th class="r">Packstücke</th><th class="r">Paletten</th><th class="r">Gewicht</th></tr></thead><tbody><tr><td>${o.goods.desc}</td><td class="r">${o.goods.pieces}</td><td class="r">${o.goods.pallets}</td><td class="r">${nf(o.goods.weight, 1)} kg</td></tr></tbody></table><p>Sendungsnummer ${o.tracking}${o.ref ? ' · Referenz ' + o.ref : ''}<br>Lieferdatum: ${fDate(o.delivery.date)}</p>
    <div style="display:flex;gap:40px;margin-top:40px"><div style="flex:1;border-top:1px solid #111;padding-top:4px">Datum, Unterschrift Empfänger</div><div style="flex:1;border-top:1px solid #111;padding-top:4px">Datum, Unterschrift Fahrer</div></div>${docFoot()}` };
  if (kind === 'cmr') return { title: `Frachtbrief ${o.nr}`, body: html`${docHead('Frachtbrief', o.nr)}<p style="font-size:11px;color:#555">Vereinfachter Frachtbrief für den Inlandsverkehr. Kein CMR-Original.</p><table><tbody>
    <tr><th>1 Absender</th><td>${addrLines(o.pickup)}</td></tr><tr><th>2 Empfänger</th><td>${addrLines(o.delivery)}</td></tr><tr><th>3 Beladestelle</th><td>${o.pickup.street}, ${o.pickup.zip} ${o.pickup.city}, ${fDate(o.pickup.date)}</td></tr><tr><th>4 Auslieferungsort</th><td>${o.delivery.street}, ${o.delivery.zip} ${o.delivery.city}</td></tr>
    <tr><th>5 Frachtführer</th><td>${o.carrier ? (par(o.carrier.partnerId) || {}).name : co.name}</td></tr><tr><th>6 Bezeichnung des Gutes</th><td>${o.goods.desc}, ${o.goods.pieces} Packstücke${o.goods.pallets ? `, ${o.goods.pallets} Paletten` : ''}</td></tr><tr><th>7 Gewicht / Volumen</th><td>${nf(o.goods.weight, 1)} kg / ${nf(o.goods.volume, 2)} m³</td></tr><tr><th>8 Besondere Vereinbarungen</th><td>${o.extras.length ? o.extras.map(extraName).join(', ') : '–'}${o.note ? '; ' + o.note : ''}</td></tr></tbody></table>
    <div style="display:flex;gap:30px;margin-top:40px"><div style="flex:1;border-top:1px solid #111;padding-top:4px">Absender</div><div style="flex:1;border-top:1px solid #111;padding-top:4px">Frachtführer</div><div style="flex:1;border-top:1px solid #111;padding-top:4px">Empfänger</div></div>${docFoot()}` };
  if (kind === 'pod') { if (!o.pod) return null; return { title: `Liefernachweis ${o.nr}`, body: html`${docHead('Liefernachweis (POD)', o.nr)}<table><tbody><tr><th>Sendung</th><td>${o.tracking} · ${o.goods.desc}</td></tr><tr><th>Zustellort</th><td>${addrLines(o.delivery)}</td></tr><tr><th>Zugestellt am</th><td>${fDT(o.pod.ts)} Uhr</td></tr><tr><th>Empfangen von</th><td>${o.pod.name}</td></tr><tr><th>Zusteller</th><td>${o.pod.by}</td></tr>${o.pod.note ? html`<tr><th>Notiz</th><td>${o.pod.note}</td></tr>` : ''}</tbody></table>
    <p>Unterschrift:</p>${o.pod.sig ? html`<img class="sig-img" alt="Unterschrift des Empfängers" src="${o.pod.sig}">` : html`<p style="color:#777">${o.pod.demo ? 'Beispieldaten: keine Unterschrift hinterlegt.' : 'Ohne digitale Unterschrift bestätigt.'}</p>`}${(o.pod.photos || []).length ? html`<p>Fotos:</p><div class="thumbs">${o.pod.photos.map((p) => html`<img src="${p}" alt="Foto">`)}</div>` : ''}${docFoot()}` }; }
  return null;
}
act('doc.open', null, (d) => {
  const doc = docBody(d.kind, d.id); if (!doc) return toast('Dieses Dokument ist noch nicht vorhanden.', 'bad');
  openModal({ title: doc.title, wide: true, body: html`<div class="docbox">${doc.body}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Schließen</button>${d.kind === 'confirm' && canWrite('auftraege') ? html`<button type="button" class="btn" data-act="doc.mail" data-id="${d.id}">${ic('mail')} Per E-Mail senden</button>` : ''}<button type="button" class="btn primary" data-act="doc.print">${ic('print')} Drucken / als PDF speichern</button>` });
});
act('doc.print', null, () => window.print());
act('doc.mail', 'auftraege', (d) => { const o = ord(d.id); const c = cust(o.customerId); o.notifyEmail = o.notifyEmail || ((c.contacts || [{}])[0] || {}).email; queueMail('confirm', o); addHistory(o, o.status, 'Auftragsbestätigung versendet'); commit(); toast('Auftragsbestätigung liegt im Versandprotokoll (keine echte E-Mail).', 'ok'); });

/* ---------- Angebote ---------- */
const QUOTE_ST = { entwurf: ['Entwurf', 'gray'], versendet: ['Versendet', 'amber'], angenommen: ['Angenommen', 'green'], abgelehnt: ['Abgelehnt', 'red'], abgelaufen: ['Abgelaufen', 'gray'] };
const qChip = (s) => chip(...(QUOTE_ST[s] || [s, 'gray']));
function quoteCalc(f) {
  const o = { type: f.type, prio: f.prio, extras: f.extras || [], customerId: f.customerId, waitMin: +f.waitMin || 0, goods: { weight: +f.weight || 0, volume: +f.volume || 0, pallets: +f.pallets || 0 }, pickup: cityGeo(f.from), delivery: cityGeo(f.to) };
  const pr = calcPrice(o); const lines = pr.lines.slice();
  const adj = +f.adj || 0;
  if (adj) lines.push({ label: `${adj > 0 ? 'Aufschlag' : 'Nachlass'} ${nf(Math.abs(adj), 1)} %`, amount: Math.round(sum(pr.lines, (l) => l.amount) * adj) / 100 });
  const net = Math.round(sum(lines, (l) => l.amount) * 100) / 100;
  return { lines, net, km: pr.km };
}
view('angebote', {
  mod: 'angebote', title: 'Angebote',
  render(seg, qq) {
    if (seg[0] === 'neu' || seg[1] === 'edit') return quoteForm(seg[0] === 'neu' ? null : DB.quotes.find((x) => x.id === seg[0]), qq);
    if (seg[0]) return quoteDetail(seg[0]);
    const q = fv('q.q').trim().toLowerCase();
    const rows = DB.quotes.filter((x) => (!fv('q.st') || x.status === fv('q.st')) && (!q || [x.nr, custName(x.customerId), x.from, x.to].join(' ').toLowerCase().includes(q)));
    const sumNet = (st) => sum(DB.quotes.filter((x) => x.status === st), (x) => x.net);
    const cols = [{ k: 'n', t: 'Angebot', cls: 'nw', f: (x) => html`<a href="#/angebote/${x.id}">${x.nr}</a>`, s: (x) => x.nr }, { k: 'c', t: 'Kunde', f: (x) => custName(x.customerId), s: (x) => custName(x.customerId) }, { k: 'r', t: 'Strecke', f: (x) => html`${x.from} <span class="muted">→</span> ${x.to}`, s: (x) => x.from, x: (x) => `${x.from} -> ${x.to}` }, { k: 't', t: 'Art', f: (x) => ttype(x.type).name.split(' (')[0], s: (x) => x.type }, { k: 'd', t: 'Datum', cls: 'nw', f: (x) => fDate(x.date), s: (x) => x.date }, { k: 'v', t: 'Gültig bis', cls: 'nw', f: (x) => fDate(x.valid), s: (x) => x.valid }, { k: 'p', t: 'Netto', cls: 'num nw', f: (x) => eur(x.net), s: (x) => x.net }, { k: 's', t: 'Status', cls: 'nw', f: (x) => qChip(x.status), s: (x) => x.status, x: (x) => QUOTE_ST[x.status][0] }];
    return html`${pageHead('Angebote und Preise', 'Preise nach Strecke, Gewicht, Volumen und Transportart kalkulieren, versenden und in Aufträge umwandeln.', canWrite('angebote') ? html`<a class="btn primary" href="#/angebote/neu">${ic('plus')} Neues Angebot</a>` : '')}
      <div class="kpis"><div class="kpi" style="--k:var(--sun)"><small>Offen (versendet)</small><b>${eur(sumNet('versendet'))}</b><span>${DB.quotes.filter((x) => x.status === 'versendet').length} Angebote</span></div><div class="kpi" style="--k:var(--mint)"><small>Angenommen</small><b>${eur(sumNet('angenommen'))}</b><span>${DB.quotes.filter((x) => x.status === 'angenommen').length} Angebote</span></div><div class="kpi" style="--k:var(--coral)"><small>Annahmequote</small><b>${nf((DB.quotes.filter((x) => x.status === 'angenommen').length / Math.max(1, DB.quotes.filter((x) => ['angenommen', 'abgelehnt', 'abgelaufen'].includes(x.status)).length)) * 100)} %</b><span>der entschiedenen Angebote</span></div></div>
      <div class="toolbar">${bindInp('Suche', 'q.q', 'Nummer, Kunde, Ort', { cls: 'search' })}${bindSel('Status', 'q.st', [['', 'Alle'], ...Object.entries(QUOTE_ST).map(([k, v]) => [k, v[0]])])}</div>
      ${table('quotes', cols, rows, { sort: { k: 'n', dir: -1 }, name: 'angebote', noun: 'Angeboten' })}`;
  },
});
VIEWS.angebote.form = (seg) => seg[0] === 'neu' || seg[1] === 'edit';
VIEWS.angebote.after = (seg) => { if (seg[0] === 'neu' || seg[1] === 'edit') { const f = $('form[data-submit="quote.save"]'); if (f) { const u = () => quotePreview(f); f.addEventListener('input', u); f.addEventListener('change', u); u(); } } };
function quoteForm(q, qq) {
  const base = q || (qq && qq.get('copy') ? DB.quotes.find((x) => x.id === qq.get('copy')) : null);
  const f = base || { customerId: DB.customers.find((c) => !c.archived).id, from: 'Frankfurt am Main', to: 'Hamburg', type: 'palette', prio: 'normal', weight: 200, volume: 1.5, pallets: 1, extras: [], waitMin: 0, adj: 0 };
  return html`${pageHead(q ? `Angebot ${q.nr} bearbeiten` : 'Neues Angebot', 'Der Preis wird live aus Strecke, Gewicht, Zuschlägen und dem Kundentarif berechnet.', '', html`<a href="#/angebote">Angebote</a> › ${q ? q.nr : 'Neu'}`)}
    <form data-submit="quote.save" class="grid g21" novalidate><div><input type="hidden" name="id" value="${q ? q.id : ''}">
      <fieldset><legend>Kunde und Strecke</legend><div class="fgrid">${fld('Kunde', 'customerId', f.customerId, { type: 'select', options: DB.customers.filter((c) => !c.archived || c.id === f.customerId).map((c) => [c.id, `${c.name} (${c.nr})`]), req: true, cls: 'w2' })}${fld('Von', 'from', f.from, { type: 'select', options: CITIES.map((c) => c.name) })}${fld('Nach', 'to', f.to, { type: 'select', options: CITIES.map((c) => c.name) })}</div></fieldset>
      <fieldset><legend>Ware und Transport</legend><div class="fgrid">${fld('Transportart', 'type', f.type, { type: 'select', options: DB.settings.transportTypes.map((t) => [t.id, t.name]) })}${fld('Priorität', 'prio', f.prio, { type: 'select', options: DB.settings.priorities.map((t) => [t.id, t.name]) })}${fld('Gewicht (kg)', 'weight', f.weight, { type: 'number', min: 0.1, step: 'any', req: true })}${fld('Volumen (m³)', 'volume', f.volume, { type: 'number', min: 0, step: 'any' })}${fld('Paletten', 'pallets', f.pallets || 0, { type: 'number', min: 0 })}${fld('Wartezeit (Min.)', 'waitMin', f.waitMin || 0, { type: 'number', min: 0, step: '15', hint: `${DB.settings.surcharges.freeWaitMin} Min. sind frei` })}
        <div class="wide"><div class="fld"><span>Zusatzleistungen</span></div>${checks('extras', DB.settings.extras.map((e) => [e.id, `${e.name}${e.fix ? ' (+' + eur(e.fix) + ')' : ''}`]), f.extras || [])}</div></div></fieldset>
      <fieldset><legend>Preis und Gültigkeit</legend><div class="fgrid">${fld('Aufschlag (+) oder Nachlass (−) in %', 'adj', f.adj || 0, { type: 'number', min: -30, max: 50, step: '0.5' })}${fld('Gültig bis', 'valid', q ? q.valid : addDays(today(), 30), { type: 'date', req: true })}${fld('Hinweis an den Kunden', 'note', f.note || '', { type: 'textarea', cls: 'wide' })}</div></fieldset></div>
      <aside class="stack" style="position:sticky;top:76px;align-self:start"><section class="card"><div class="card-h"><h2>Kalkulation</h2></div><div id="qprev"></div></section><div class="card stack"><button class="btn primary block" data-save="versendet">${ic('mail')} Speichern und versenden</button><button class="btn block" data-save="entwurf">Als Entwurf speichern</button><a class="btn ghost block" href="#/angebote${q ? '/' + q.id : ''}">Abbrechen</a></div></aside></form>`;
}
function quotePreview(form) {
  const f = formObj(form); const box = $('#qprev'); if (!box) return; const r = quoteCalc(f);
  box.innerHTML = String(html`<table class="tbl"><tbody>${r.lines.map((l) => html`<tr><td class="nolabel tiny" data-l="">${l.label}</td><td class="num nolabel" data-l="">${eur(l.amount)}</td></tr>`)}</tbody><tfoot><tr><td data-l="">Netto</td><td class="num" data-l="">${eur(r.net)}</td></tr><tr><td data-l="">Brutto</td><td class="num" data-l="">${eur(r.net * (1 + DB.settings.vat / 100))}</td></tr></tfoot></table><p class="tiny muted mt-s">${nf(r.km)} km · CO₂ ca. ${nf(co2Of(r.km, +f.weight || 0, f.type), 1)} kg</p>`);
}
document.addEventListener('click', (e) => { const b = e.target.closest('form[data-submit="quote.save"] [data-save]'); if (b) b.form.dataset.mode = b.dataset.save; });
onSubmit('quote.save', 'angebote', (f, form) => {
  const mode = form.dataset.mode || 'entwurf'; const r = quoteCalc(f);
  let q = f.id ? DB.quotes.find((x) => x.id === f.id) : null;
  if (!q) { const nr = nextNo('quote'); q = { id: nr, nr, status: 'entwurf', date: today(), history: [{ ts: NOW(), text: 'Angebot erstellt', by: curUserName() }], orderId: null }; DB.quotes.unshift(q); audit('Angebot', nr, 'erstellt', custName(f.customerId)); } else q.history.push({ ts: NOW(), text: 'Angebot bearbeitet', by: curUserName() });
  Object.assign(q, { customerId: f.customerId, from: f.from, to: f.to, type: f.type, prio: f.prio, weight: +f.weight, volume: +f.volume || 0, pallets: +f.pallets || 0, waitMin: +f.waitMin || 0, extras: f.extras || [], adj: +f.adj || 0, valid: f.valid, note: f.note, net: r.net, lines: r.lines, km: r.km });
  if (mode === 'versendet' && q.status === 'entwurf') { q.status = 'versendet'; q.history.push({ ts: NOW(), text: 'An den Kunden versendet', by: curUserName() }); }
  commit(); toast(`${q.nr} gespeichert${q.status === 'versendet' ? ' und versendet' : ''}.`, 'ok'); location.hash = `#/angebote/${q.id}`;
});
function quoteDetail(id) {
  const q = DB.quotes.find((x) => x.id === id); if (!q) return notFound('Angebot', '#/angebote');
  const w = canWrite('angebote'); const c = cust(q.customerId) || {};
  return html`${pageHead(html`${q.nr} ${qChip(q.status)}`, `${c.name} · ${q.from} → ${q.to}`, html`
    <button type="button" class="btn" data-act="doc.open" data-kind="quote" data-id="${q.id}">${ic('print')} PDF / Druck</button>
    ${w ? html`${q.status === 'entwurf' ? html`<a class="btn" href="#/angebote/${q.id}/edit">${ic('edit')} Bearbeiten</a><button type="button" class="btn primary" data-act="quote.send" data-id="${q.id}">${ic('mail')} Versenden</button>` : ''}<a class="btn" href="#/angebote/neu?copy=${q.id}">${ic('copy')} Kopieren</a>
    ${q.status === 'versendet' ? html`<button type="button" class="btn primary" data-act="quote.accept" data-id="${q.id}">${ic('check')} Angenommen, Auftrag anlegen</button><button type="button" class="btn ghost" data-act="quote.reject" data-id="${q.id}">Abgelehnt</button>` : ''}` : ''}`, html`<a href="#/angebote">Angebote</a> › ${q.nr}`)}
    <div class="grid g21"><section class="card"><div class="card-h"><h2>Kalkulation</h2></div><table class="tbl"><tbody>${q.lines.map((l) => html`<tr><td class="nolabel" data-l="">${l.label}</td><td class="num nolabel" data-l="">${eur(l.amount)}</td></tr>`)}</tbody><tfoot><tr><td data-l="">Netto</td><td class="num" data-l="">${eur(q.net)}</td></tr><tr><td data-l="">Brutto</td><td class="num" data-l="">${eur(q.net * (1 + DB.settings.vat / 100))}</td></tr></tfoot></table>${q.note ? html`<p class="mt-s"><b>Hinweis:</b> ${q.note}</p>` : ''}</section>
      <aside class="stack"><section class="card"><dl>${kv('Kunde', html`<a href="#/kunden/${c.id}">${c.name}</a>`)}${kv('Transportart', ttype(q.type).name)}${kv('Ware', `${nf(q.weight, 1)} kg${q.volume ? ', ' + nf(q.volume, 2) + ' m³' : ''}`)}${kv('Datum', fDate(q.date))}${kv('Gültig bis', fDate(q.valid))}${kv('Auftrag', q.orderId ? html`<a href="#/auftraege/${q.orderId}">${q.orderId}</a>` : '–')}</dl></section>
      <section class="card"><div class="card-h"><h2>Verlauf</h2></div><ol class="tl">${q.history.slice().reverse().map((h, i) => html`<li class="${i === 0 ? 'now' : 'on'}"><time>${fDT(h.ts)} · ${h.by}</time><b>${h.text}</b></li>`)}</ol></section></aside></div>`;
}
act('quote.send', 'angebote', (d) => { const q = DB.quotes.find((x) => x.id === d.id); q.status = 'versendet'; q.history.push({ ts: NOW(), text: 'An den Kunden versendet', by: curUserName() }); audit('Angebot', q.nr, 'versendet', ''); commit(); toast('Angebot versendet (Demo: kein echter E-Mail-Versand).', 'ok'); });
act('quote.reject', null, (d) => { const q = DB.quotes.find((x) => x.id === d.id); q.status = 'abgelehnt'; const by = document.body.dataset.layout === 'portal' ? custName(q.customerId) + ' (Portal)' : curUser().name; q.history.push({ ts: NOW(), text: 'Vom Kunden abgelehnt', by }); ACTOR = by; audit('Angebot', q.nr, 'abgelehnt', ''); ACTOR = null; commit(); toast('Angebot als abgelehnt vermerkt.', 'ok'); });
act('quote.accept', null, (d) => {
  const q = DB.quotes.find((x) => x.id === d.id); const c = cust(q.customerId); const adr = c.addresses[0] || {};
  const home = q.from === c.city;
  openModal({ title: `${q.nr} in Auftrag umwandeln`, wide: true, form: 'quote.order', body: html`<input type="hidden" name="id" value="${q.id}"><p class="muted mb">${q.from} → ${q.to} · ${eur(q.net)} netto. Bitte noch die genauen Adressen und Termine angeben.</p>
    <div class="grid g2"><fieldset><legend>Abholung in ${q.from}</legend><div class="stack">${fld('Name', 'pName', home ? c.name : `JWG Logistikzentrum ${q.from}`, { req: true })}${fld('Straße', 'pStreet', home ? c.street : (BRANCHES.find((b) => b.city === q.from) || BRANCHES[0]).street, { req: true })}${fld('PLZ', 'pZip', (CITY[q.from] || {}).zip, { req: true, pattern: '[0-9]{5}', maxlength: 5 })}${fld('Datum', 'pDate', addDays(today(), 1), { type: 'date', req: true, min: today() })}</div></fieldset>
    <fieldset><legend>Lieferung in ${q.to}</legend><div class="stack">${fld('Name', 'dName', q.to === c.city ? c.name : '', { req: true })}${fld('Straße', 'dStreet', q.to === c.city ? c.street : '', { req: true })}${fld('PLZ', 'dZip', (CITY[q.to] || {}).zip, { req: true, pattern: '[0-9]{5}', maxlength: 5 })}${fld('Datum', 'dDate', addDays(today(), 2), { type: 'date', req: true, min: today() })}</div></fieldset></div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">${ic('check')} Auftrag anlegen</button>` });
  void adr;
});
onSubmit('quote.order', null, (f) => {
  const q = DB.quotes.find((x) => x.id === f.id); const portal = document.body.dataset.layout === 'portal'; const c = cust(q.customerId);
  ACTOR = portal ? c.name + ' (Portal)' : null;
  const o = newOrderFrom({ customerId: q.customerId, type: q.type, prio: q.prio || 'normal', branch: 'b1', ref: q.nr, source: portal ? 'portal' : 'manuell', by: portal ? c.name + ' (Portal)' : undefined, historyText: `Aus Angebot ${q.nr} angelegt`,
    pName: f.pName, pStreet: f.pStreet, pZip: f.pZip, pCity: q.from, pDate: f.pDate, pFrom: '08:00', pTo: '17:00', dName: f.dName, dStreet: f.dStreet, dZip: f.dZip, dCity: q.to, dDate: f.dDate, dFrom: '08:00', dTo: '17:00',
    desc: 'Transport laut Angebot ' + q.nr, weight: q.weight, volume: q.volume, pieces: Math.max(1, q.pallets || 1), pallets: q.pallets || 0, extras: q.extras || [] });
  o.price = q.net; q.status = 'angenommen'; q.orderId = o.id; q.history.push({ ts: NOW(), text: `Angenommen, Auftrag ${o.nr} angelegt`, by: portal ? c.name + ' (Portal)' : curUser().name });
  audit('Angebot', q.nr, 'angenommen', `Auftrag ${o.nr}`); pushNotif(`Angebot ${q.nr} angenommen, Auftrag ${o.nr} angelegt.`, 'ok', `#/auftraege/${o.id}`); ACTOR = null;
  closeModal(); commit(); toast(`Auftrag ${o.nr} wurde angelegt.`, 'ok');
});

/* ---------- Abrechnung ---------- */
function createInvoice(custId, orderIds) {
  const orders = orderIds.map(ord).filter((o) => o && isDone(o) && !o.invoiceId && o.status === 'zugestellt');
  if (!orders.length) return null;
  const c = cust(custId); const nr = nextNo('invoice');
  const lines = orders.map((o) => ({ orderId: o.id, text: `${o.nr}: ${o.pickup.city} → ${o.delivery.city} (${o.goods.desc})`, net: o.price }));
  const net = Math.round(sum(lines, (l) => l.net) * 100) / 100, vat = Math.round(net * DB.settings.vat) / 100;
  const inv = { id: nr, nr, customerId: custId, date: today(), due: addDays(today(), c.terms), lines, net, vat, gross: Math.round((net + vat) * 100) / 100, status: 'offen', paidOn: null, dunning: 0, kind: 'rechnung', created: NOW() };
  DB.invoices.unshift(inv);
  orders.forEach((o) => { o.invoiceId = nr; setStatus(o, 'abgeschlossen', `Abgerechnet mit ${nr}`); });
  audit('Rechnung', nr, 'erstellt', `${c.name}, ${eur(inv.gross)}`);
  return inv;
}
const readyOrders = () => scoped(DB.orders).filter((o) => o.status === 'zugestellt' && !o.invoiceId);
act('inv.create.order', 'abrechnung', (d) => { const o = ord(d.id); const inv = createInvoice(o.customerId, [o.id]); if (inv) { commit(); toast(`Rechnung ${inv.nr} erstellt (${eur(inv.gross)}).`, 'ok'); } });
act('inv.create.cust', 'abrechnung', (d) => { const ids = readyOrders().filter((o) => o.customerId === d.id).map((o) => o.id); const inv = createInvoice(d.id, ids); if (inv) { commit(); toast(`Rechnung ${inv.nr} mit ${ids.length} Position${ids.length > 1 ? 'en' : ''} erstellt.`, 'ok'); } });
act('inv.pay', 'abrechnung', (d) => { const i = DB.invoices.find((x) => x.id === d.id); openModal({ title: `Zahlung buchen: ${i.nr}`, form: 'inv.pay', cls: 'small', body: html`<input type="hidden" name="id" value="${i.id}"><p class="mb">Offener Betrag: <b>${eur(i.gross)}</b></p>${fld('Zahlungseingang am', 'date', today(), { type: 'date', req: true, max: today() })}`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Als bezahlt buchen</button>` }); });
onSubmit('inv.pay', 'abrechnung', (f) => { const i = DB.invoices.find((x) => x.id === f.id); i.status = 'bezahlt'; i.paidOn = f.date; audit('Rechnung', i.nr, 'bezahlt', `Zahlung am ${fDate(f.date)}`); closeModal(); commit(); toast('Zahlung gebucht.', 'ok'); });
act('inv.dun', 'abrechnung', (d) => { const i = DB.invoices.find((x) => x.id === d.id); if (i.dunning >= 3) return toast('Höchste Mahnstufe erreicht. Bitte Inkasso oder Rechtsweg prüfen.', 'bad'); i.dunning++; const c = cust(i.customerId); const tpl = DB.settings.templates.find((t) => t.id === 'dunning'); const ctx = { rechnung: i.nr, betrag: eur(i.gross), faellig: fDate(i.due), firma: DB.settings.company.name }; DB.outbox.unshift({ id: uid('mail'), ts: NOW(), to: ((c.contacts || [{}])[0] || {}).email, subject: `${DUNNING[i.dunning]}: ${fillTpl(tpl.subject, ctx)}`, body: fillTpl(tpl.body, ctx), orderId: null, kind: 'dunning', channel: 'E-Mail (simuliert)' }); audit('Rechnung', i.nr, 'Mahnung', DUNNING[i.dunning]); commit(); toast(`${DUNNING[i.dunning]} erstellt (Versandprotokoll).`, 'ok'); });
act('inv.cancel', 'abrechnung', (d) => {
  const i = DB.invoices.find((x) => x.id === d.id);
  confirmBox(`Rechnung ${i.nr} stornieren? Es wird eine Gutschrift in gleicher Höhe erstellt. Die enthaltenen Aufträge werden wieder abrechenbar.`, 'Stornieren', () => {
    const nr = nextNo('credit'); const g = { id: nr, nr, customerId: i.customerId, date: today(), due: today(), lines: i.lines.map((l) => ({ ...l, net: -l.net })), net: -i.net, vat: -i.vat, gross: -i.gross, status: 'bezahlt', paidOn: today(), dunning: 0, kind: 'gutschrift', refId: i.id, refNr: i.nr, created: NOW() };
    DB.invoices.unshift(g); i.status = 'storniert'; i.creditId = nr;
    i.lines.forEach((l) => { const o = ord(l.orderId); if (o && o.invoiceId === i.id) { o.invoiceId = null; setStatus(o, 'zugestellt', `Rechnung ${i.nr} storniert, wieder abrechenbar`); } });
    audit('Rechnung', i.nr, 'storniert', `Gutschrift ${nr}`); commit(); toast(`Gutschrift ${nr} erstellt.`, 'ok');
  });
});
act('claim.credit', 'abrechnung', (d) => {
  const c = DB.claims.find((x) => x.id === d.id); const o = ord(c.orderId); const inv = DB.invoices.find((x) => x.id === o.invoiceId); if (!inv) return toast('Zu diesem Auftrag gibt es keine Rechnung.', 'bad');
  const nr = nextNo('credit'); const net = -Math.abs(c.cost); const vat = Math.round(net * DB.settings.vat) / 100;
  DB.invoices.unshift({ id: nr, nr, customerId: inv.customerId, date: today(), due: today(), lines: [{ orderId: o.id, text: `Gutschrift zu Reklamation ${c.nr} (${c.type}), Auftrag ${o.nr}`, net }], net, vat, gross: Math.round((net + vat) * 100) / 100, status: 'bezahlt', paidOn: today(), dunning: 0, kind: 'gutschrift', refId: inv.id, refNr: inv.nr, created: NOW() });
  c.log.push({ ts: NOW(), text: `Gutschrift ${nr} über ${eur(-net)} netto erstellt`, by: curUserName() }); audit('Rechnung', nr, 'erstellt', `Gutschrift zu ${c.nr}`); commit(); toast(`Gutschrift ${nr} erstellt.`, 'ok');
});
view('abrechnung', {
  mod: 'abrechnung', title: 'Abrechnung',
  render() {
    const tl = [['r', 'Ausgangsrechnungen'], ['b', 'Zur Abrechnung bereit'], ['e', 'Eingangsrechnungen'], ['m', 'Erlöse und Kosten']];
    const cur = UI.tab.abr || 'r'; const w = canWrite('abrechnung');
    const openInv = DB.invoices.filter((i) => i.kind === 'rechnung' && i.status === 'offen'), over = openInv.filter((i) => invoiceState(i).id === 'ueberfaellig');
    const inOpen = DB.inInvoices.filter((i) => i.status === 'offen');
    const done = scoped(DB.orders).filter((o) => isDone(o));
    const rev = sum(done, (o) => o.price), cost = sum(done, (o) => o.cost);
    const kpis = html`<div class="kpis"><div class="kpi" style="--k:var(--sun)"><small>Offene Forderungen</small><b>${eur(sum(openInv, (i) => i.gross))}</b><span>${openInv.length} Rechnungen</span></div><div class="kpi" style="--k:var(--coral)"><small>Überfällig</small><b>${eur(sum(over, (i) => i.gross))}</b><span>${over.length} Rechnungen</span></div><div class="kpi" style="--k:var(--cobalt)"><small>Offene Verbindlichkeiten</small><b>${eur(sum(inOpen, (i) => i.gross))}</b><span>${inOpen.length} Eingangsrechnungen</span></div><div class="kpi" style="--k:var(--mint)"><small>Marge (abgeschlossen)</small><b>${rev ? nf(((rev - cost) / rev) * 100) : 0} %</b><span>${eur(rev - cost)} Deckungsbeitrag</span></div></div>`;
    let body;
    if (cur === 'r') {
      const q = fv('i.q').trim().toLowerCase();
      const rows = DB.invoices.filter((i) => (!fv('i.st') || invoiceState(i).id === fv('i.st')) && (!q || [i.nr, custName(i.customerId)].join(' ').toLowerCase().includes(q)));
      body = html`<div class="toolbar">${bindInp('Suche', 'i.q', 'Rechnungsnummer, Kunde', { cls: 'search' })}${bindSel('Status', 'i.st', [['', 'Alle'], ['offen', 'Offen'], ['ueberfaellig', 'Überfällig'], ['bezahlt', 'Bezahlt'], ['storniert', 'Storniert'], ['gutschrift', 'Gutschriften']])}<button type="button" class="btn" data-act="inv.export">${ic('download')} Buchhaltungsexport (CSV)</button></div>
        ${table('invoices', [{ k: 'n', t: 'Beleg', cls: 'nw', f: (i) => html`<a href="#" data-act="doc.open" data-kind="invoice" data-id="${i.id}">${i.nr}</a>`, s: (i) => i.nr, x: (i) => i.nr }, { k: 'c', t: 'Kunde', f: (i) => custName(i.customerId), s: (i) => custName(i.customerId) }, { k: 'd', t: 'Datum', cls: 'nw', f: (i) => fDate(i.date), s: (i) => i.date }, { k: 'f', t: 'Fällig', cls: 'nw', f: (i) => (i.kind === 'gutschrift' ? '–' : fDate(i.due)), s: (i) => i.due, x: (i) => i.due }, { k: 'n2', t: 'Netto', cls: 'num nw', f: (i) => eur(i.net), s: (i) => i.net }, { k: 'g', t: 'Brutto', cls: 'num nw', f: (i) => eur(i.gross), s: (i) => i.gross }, { k: 's', t: 'Status', cls: 'nw', f: (i) => { const s = invoiceState(i); return chip(s.label, s.tone); }, s: (i) => invoiceState(i).id, x: (i) => invoiceState(i).label }, { k: 'm', t: 'Mahnung', cls: 'nw', f: (i) => (i.kind === 'rechnung' && i.status === 'offen' ? DUNNING[i.dunning] : '–'), s: (i) => i.dunning, x: (i) => DUNNING[i.dunning] },
          { k: 'a', t: 'Aktionen', cls: 'nw', f: (i) => (w && i.kind === 'rechnung' && i.status === 'offen' ? html`<span class="row gap-s"><button type="button" class="btn sm" data-act="inv.pay" data-id="${i.id}">Bezahlt</button>${invoiceState(i).id === 'ueberfaellig' ? html`<button type="button" class="btn sm" data-act="inv.dun" data-id="${i.id}">Mahnen</button>` : ''}<button type="button" class="btn sm ghost" data-act="inv.cancel" data-id="${i.id}">Storno</button></span>` : w && i.kind === 'rechnung' && i.status === 'bezahlt' ? html`<button type="button" class="btn sm ghost" data-act="inv.cancel" data-id="${i.id}">Storno</button>` : ''), noExport: true }], rows, { sort: { k: 'd', dir: -1 }, name: 'rechnungen', noun: 'Belegen', noExport: false })}`;
    } else if (cur === 'b') {
      const rd = readyOrders(); const groups = {}; rd.forEach((o) => { (groups[o.customerId] ||= []).push(o); });
      body = rd.length ? html`<div class="stack">${Object.entries(groups).map(([cid, os]) => html`<section class="card"><div class="card-h"><h2>${custName(cid)}</h2>${w ? html`<button type="button" class="btn primary" data-act="inv.create.cust" data-id="${cid}">${ic('euro')} Sammelrechnung erstellen (${eur(sum(os, (o) => o.price * 1.19))})</button>` : ''}</div><ul class="list">${os.map((o) => html`<li><div class="grow"><a href="#/auftraege/${o.id}">${o.nr}</a> · ${route(o)}<div class="tiny muted">zugestellt ${fDT(o.pod && o.pod.ts)}</div></div><b>${eur(o.price)}</b>${w ? html`<button type="button" class="btn sm" data-act="inv.create.order" data-id="${o.id}">Einzelrechnung</button>` : ''}</li>`)}</ul></section>`)}</div>` : html`<div class="card">${empty('Alles abgerechnet', 'Es gibt keine zugestellten Aufträge ohne Rechnung.')}</div>`;
    } else if (cur === 'e') {
      body = html`<div class="toolbar">${w ? html`<button type="button" class="btn primary" data-act="ein.new">${ic('plus')} Eingangsrechnung erfassen</button>` : ''}</div>${table('ein', [{ k: 'n', t: 'Beleg', cls: 'nw', f: (i) => i.nr, s: (i) => i.nr }, { k: 'l', t: 'Lieferant', f: (i) => i.supplier, s: (i) => i.supplier }, { k: 'k', t: 'Art', f: (i) => i.kind, s: (i) => i.kind }, { k: 't', t: 'Text', f: (i) => i.text, x: (i) => i.text }, { k: 'd', t: 'Datum', cls: 'nw', f: (i) => fDate(i.date), s: (i) => i.date }, { k: 'f', t: 'Fällig', cls: 'nw', f: (i) => fDate(i.due), s: (i) => i.due }, { k: 'g', t: 'Brutto', cls: 'num nw', f: (i) => eur(i.gross), s: (i) => i.gross }, { k: 's', t: 'Status', cls: 'nw', f: (i) => chip(i.status === 'bezahlt' ? 'Bezahlt' : diffDays(today(), i.due) > 0 ? 'Überfällig' : 'Offen', i.status === 'bezahlt' ? 'green' : diffDays(today(), i.due) > 0 ? 'red' : 'amber'), s: (i) => i.status, x: (i) => i.status }, { k: 'a', t: '', f: (i) => (w && i.status === 'offen' ? html`<button type="button" class="btn sm" data-act="ein.pay" data-id="${i.id}">Bezahlt</button>` : ''), noExport: true }], DB.inInvoices, { sort: { k: 'd', dir: -1 }, name: 'eingangsrechnungen', noun: 'Belegen' })}`;
    } else {
      const per = fv('ab.per', '30'); const list = done.filter((o) => per === 'all' || diffDays(today(), o.delivery.date) <= +per);
      const top = list.slice().sort((a, b) => (b.price - b.cost) - (a.price - a.cost));
      body = html`<div class="toolbar">${bindSel('Zeitraum', 'ab.per', [['30', 'Letzte 30 Tage'], ['90', 'Letzte 90 Tage'], ['all', 'Alle']], { def: '30' })}</div>
        <div class="grid g2 mb"><section class="card"><div class="card-h"><h2>Deckungsbeitrag je Transport (Top 8)</h2></div>${hbars(top.slice(0, 8).map((o) => ({ label: o.nr, v: Math.max(0, o.price - o.cost), text: eur(o.price - o.cost) })))}</section><section class="card"><dl>${kv('Aufträge im Zeitraum', list.length)}${kv('Erlös netto', eur(sum(list, (o) => o.price)))}${kv('Kosten', eur(sum(list, (o) => o.cost)))}${kv('Deckungsbeitrag', html`<b class="up">${eur(sum(list, (o) => o.price - o.cost))}</b>`)}${kv('Marge', `${sum(list, (o) => o.price) ? nf((sum(list, (o) => o.price - o.cost) / sum(list, (o) => o.price)) * 100) : 0} %`)}</dl></section></div>
        ${table('margin', [{ k: 'n', t: 'Auftrag', cls: 'nw', f: (o) => html`<a href="#/auftraege/${o.id}">${o.nr}</a>`, s: (o) => o.nr }, { k: 'c', t: 'Kunde', f: (o) => custName(o.customerId), s: (o) => custName(o.customerId) }, { k: 'r', t: 'Strecke', f: (o) => route(o), s: (o) => o.pickup.city }, { k: 'e', t: 'Erlös', cls: 'num nw', f: (o) => eur(o.price), s: (o) => o.price }, { k: 'k', t: 'Kosten', cls: 'num nw', f: (o) => eur(o.cost), s: (o) => o.cost }, { k: 'd', t: 'Deckungsbeitrag', cls: 'num nw', f: (o) => html`<b class="${o.price - o.cost >= 0 ? 'up' : 'down'}">${eur(o.price - o.cost)}</b>`, s: (o) => o.price - o.cost, x: (o) => (o.price - o.cost).toFixed(2) }, { k: 'p', t: 'Marge', cls: 'num nw', f: (o) => `${o.price ? nf(((o.price - o.cost) / o.price) * 100) : 0} %`, s: (o) => (o.price ? (o.price - o.cost) / o.price : 0) }], list, { sort: { k: 'd', dir: -1 }, name: 'erloese-kosten', noun: 'Transporten' })}`;
    }
    return html`${pageHead('Abrechnung', 'Rechnungen, Gutschriften, Mahnwesen und die Rentabilität jedes Transports.')}${kpis}${tabs('abr', tl, 'r')}${body}`;
  },
});
act('inv.export', 'abrechnung', () => downloadCSV(`jwg-logistik-buchungsexport-${today()}.csv`, ['Belegnummer', 'Belegart', 'Belegdatum', 'Kundennummer', 'Kunde', 'Netto', 'MwSt', 'Brutto', 'Fällig am', 'Status', 'Mahnstufe'], DB.invoices.map((i) => [i.nr, i.kind === 'gutschrift' ? 'Gutschrift' : 'Rechnung', i.date, (cust(i.customerId) || {}).nr, custName(i.customerId), i.net.toFixed(2).replace('.', ','), i.vat.toFixed(2).replace('.', ','), i.gross.toFixed(2).replace('.', ','), i.due, invoiceState(i).label, DUNNING[i.dunning]])));
act('ein.new', 'abrechnung', () => openModal({ title: 'Eingangsrechnung erfassen', form: 'ein.save', body: html`<div class="fgrid">${fld('Lieferant', 'supplier', '', { req: true })}${fld('Art', 'kind', 'Frachtführer', { type: 'select', options: ['Frachtführer', 'Kraftstoff', 'Werkstatt', 'Versicherung', 'Maut', 'Sonstiges'] })}${fld('Text', 'text', '', { req: true, cls: 'wide' })}${fld('Rechnungsdatum', 'date', today(), { type: 'date', req: true })}${fld('Fällig am', 'due', addDays(today(), 14), { type: 'date', req: true })}${fld('Brutto (€)', 'gross', '', { type: 'number', min: 0.01, step: '0.01', req: true })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Erfassen</button>` }));
onSubmit('ein.save', 'abrechnung', (f) => { const nr = nextNo('inbound'); const g = +f.gross; DB.inInvoices.unshift({ id: nr, nr, supplier: f.supplier, kind: f.kind, text: f.text, date: f.date, due: f.due, gross: g, net: +(g / 1.19).toFixed(2), vat: +(g - g / 1.19).toFixed(2), status: 'offen', ext: '' }); audit('Eingangsrechnung', nr, 'erfasst', f.supplier); closeModal(); commit(); toast('Eingangsrechnung erfasst.', 'ok'); });
act('ein.pay', 'abrechnung', (d) => { const i = DB.inInvoices.find((x) => x.id === d.id); i.status = 'bezahlt'; audit('Eingangsrechnung', i.nr, 'bezahlt', ''); commit(); });

/* ---------- Dokumente ---------- */
const DOC_TYPES = ['Auftragsbestätigung', 'Lieferschein', 'Frachtbrief', 'POD', 'Foto', 'Unterschrift', 'Rechnung', 'Gutschrift', 'Angebot', 'Sonstiges'];
const SENSITIVE = ['Rechnung', 'Gutschrift', 'Angebot'];
const docRoles = (type) => (SENSITIVE.includes(type) ? ['admin', 'buch', 'service', 'dispo'] : ['admin', 'buch', 'dispo', 'service', 'lager']);
const retYears = (type) => (DB.settings.retention.find((r) => r.type === type) || { years: 3 }).years;
function allDocs() {
  const out = [];
  const push = (d) => { d.keepUntil = dateOf(new Date(new Date(d.ts).setFullYear(new Date(d.ts).getFullYear() + retYears(d.type)))); out.push(d); };
  DB.orders.forEach((o) => {
    if (['entwurf', 'storniert'].includes(o.status)) return;
    const base = { orderId: o.id, customerId: o.customerId, src: 'automatisch', role: null };
    push({ ...base, id: 'c-' + o.id, type: 'Auftragsbestätigung', name: `Auftragsbestätigung_${o.nr}.pdf`, ts: o.created, kind: 'confirm', ref: o.id });
    if (o.status !== 'offen') { push({ ...base, id: 'l-' + o.id, type: 'Lieferschein', name: `Lieferschein_${o.nr}.pdf`, ts: o.created, kind: 'delivnote', ref: o.id }); push({ ...base, id: 'f-' + o.id, type: 'Frachtbrief', name: `Frachtbrief_${o.nr}.pdf`, ts: o.created, kind: 'cmr', ref: o.id }); }
    if (o.pod) { push({ ...base, id: 'p-' + o.id, type: 'POD', name: `Liefernachweis_${o.nr}.pdf`, ts: o.pod.ts, kind: 'pod', ref: o.id }); if (o.pod.sig) push({ ...base, id: 's-' + o.id, type: 'Unterschrift', name: `Unterschrift_${o.nr}.png`, ts: o.pod.ts, kind: 'pod', ref: o.id }); (o.pod.photos || []).forEach((p, i) => push({ ...base, id: `ph-${o.id}-${i}`, type: 'Foto', name: `Zustellfoto_${o.nr}_${i + 1}.jpg`, ts: o.pod.ts, data: p })); }
  });
  DB.invoices.forEach((i) => push({ id: 'i-' + i.id, type: i.kind === 'gutschrift' ? 'Gutschrift' : 'Rechnung', name: `${i.kind === 'gutschrift' ? 'Gutschrift' : 'Rechnung'}_${i.nr}.pdf`, orderId: (i.lines[0] || {}).orderId, customerId: i.customerId, ts: i.created || at(i.date, '10:00'), src: 'automatisch', kind: 'invoice', ref: i.id }));
  DB.quotes.forEach((q) => { if (q.status !== 'entwurf') push({ id: 'q-' + q.id, type: 'Angebot', name: `Angebot_${q.nr}.pdf`, orderId: q.orderId, customerId: q.customerId, ts: at(q.date, '11:00'), src: 'automatisch', kind: 'quote', ref: q.id }); });
  DB.docs.forEach((d) => push({ ...d, src: 'Upload', customerId: d.orderId ? (ord(d.orderId) || {}).customerId : null }));
  return out.sort((a, b) => b.ts - a.ts);
}
view('dokumente', {
  mod: 'dokumente', title: 'Dokumente',
  render() {
    const role = curRole().id; const all = allDocs();
    const visible = all.filter((d) => role === 'admin' || (d.role || docRoles(d.type)).includes(role));
    const q = fv('dk.q').trim().toLowerCase();
    const rows = visible.filter((d) => (!fv('dk.type') || d.type === fv('dk.type')) && (!q || [d.name, d.orderId, custName(d.customerId)].join(' ').toLowerCase().includes(q)) && (!fv('dk.cust') || d.customerId === fv('dk.cust')));
    const hidden = all.length - visible.length;
    const cols = [{ k: 'n', t: 'Dokument', f: (d) => html`${ic('file')} <b>${d.name}</b>`, s: (d) => d.name, x: (d) => d.name }, { k: 't', t: 'Typ', cls: 'nw', f: (d) => d.type, s: (d) => d.type }, { k: 'o', t: 'Auftrag', cls: 'nw', f: (d) => (d.orderId ? html`<a href="#/auftraege/${d.orderId}">${d.orderId}</a>` : '–'), s: (d) => d.orderId || '', x: (d) => d.orderId || '' }, { k: 'c', t: 'Kunde', f: (d) => (d.customerId ? custName(d.customerId) : '–'), s: (d) => (d.customerId ? custName(d.customerId) : '') }, { k: 'd', t: 'Datum', cls: 'nw', f: (d) => fDate(d.ts), s: (d) => d.ts }, { k: 'a', t: 'Aufbewahren bis', cls: 'nw', f: (d) => fDate(d.keepUntil), s: (d) => d.keepUntil }, { k: 'z', t: 'Zugriff', f: (d) => (d.role || docRoles(d.type)).map((r) => (DB.roles.find((x) => x.id === r) || { name: r }).name).join(', '), x: (d) => (d.role || docRoles(d.type)).join('/') },
      { k: 'x', t: '', cls: 'nw', f: (d) => html`<span class="row gap-s">${d.kind ? html`<button type="button" class="btn sm" data-act="doc.open" data-kind="${d.kind}" data-id="${d.ref}">Ansehen</button>` : d.data ? html`<a class="btn sm" href="${d.data}" download="${d.name}">Laden</a>` : html`<span class="tiny muted">${d.src === 'Upload' ? 'nur Name gespeichert' : ''}</span>`}${d.src === 'Upload' && canWrite('dokumente') ? html`<button type="button" class="icon-btn" data-act="doc.del" data-id="${d.id}" aria-label="Dokument löschen" title="${d.keepUntil > today() ? 'Aufbewahrungsfrist bis ' + fDate(d.keepUntil) : 'Löschen'}">${ic('trash')}</button>` : ''}</span>`, noExport: true }];
    return html`${pageHead('Dokumentenmanagement', 'Lieferscheine, Frachtbriefe, Liefernachweise, Rechnungen und Uploads. Erzeugte Dokumente werden dem Auftrag automatisch zugeordnet.', canWrite('dokumente') ? html`<button type="button" class="btn primary" data-act="doc.upload">${ic('upload')} Dokument hochladen</button>` : '')}
      <div class="toolbar">${bindInp('Suche', 'dk.q', 'Name, Auftrag, Kunde', { cls: 'search' })}${bindSel('Typ', 'dk.type', [['', 'Alle Typen'], ...DOC_TYPES])}${bindSel('Kunde', 'dk.cust', [['', 'Alle Kunden'], ...DB.customers.map((c) => [c.id, c.name])])}</div>
      ${hidden ? html`<p class="mb">${notice('blue', `${hidden} Dokumente sind für deine Rolle (${curRole().name}) nicht sichtbar. Rechnungen und Angebote sehen nur Administration, Buchhaltung, Disposition und Kundenservice.`, 'lock')}</p>` : ''}
      ${table('docs', cols, rows, { sort: { k: 'd', dir: -1 }, name: 'dokumente', noun: 'Dokumenten', page: 20 })}
      <p class="note-demo mt">Aufbewahrungsfristen (Einstellungen): ${DB.settings.retention.slice(0, 6).map((r) => `${r.type} ${r.years} Jahre`).join(', ')} … Hochgeladene Dateien bis 250 KB werden im Browser gespeichert, größere nur mit Namen.</p>`;
  },
});
act('doc.upload', 'dokumente', (d) => openModal({ title: 'Dokument hochladen', form: 'doc.save', body: html`<div class="stack">${fld('Datei', 'file', '', { type: 'file', req: true })}${fld('Typ', 'type', 'Lieferschein', { type: 'select', options: DOC_TYPES.filter((t) => !['Auftragsbestätigung', 'Rechnung', 'Gutschrift', 'Angebot'].includes(t)) })}${fld('Zuordnung zum Auftrag', 'orderId', d.order || '', { type: 'select', options: [['', 'automatisch erkennen (Nummer im Dateinamen)'], ...DB.orders.slice(0, 80).map((o) => [o.id, `${o.nr} · ${custName(o.customerId)}`])], hint: 'Steht im Dateinamen eine Auftragsnummer wie A-2026-0012 oder eine Sendungsnummer, wird sie erkannt.' })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Hochladen</button>` }));
onSubmit('doc.save', 'dokumente', async (f) => {
  const file = f.file && f.file[0]; if (!file) return;
  let orderId = f.orderId, auto = false;
  if (!orderId) { const m = /A-\d{4}-\d{4}/i.exec(file.name); const tr = /JWG-[A-Z0-9]{4,8}/i.exec(file.name); const o = (m && ord(m[0].toUpperCase())) || (tr && findOrderByNo(tr[0])); if (o) { orderId = o.id; auto = true; } }
  const data = /^image\//.test(file.type) ? { name: file.name, size: file.size, data: await shrinkImage(file) } : await readFileSmall(file);
  DB.docs.unshift({ id: uid('u'), type: f.type, name: file.name, size: file.size, data: data.data, orderId: orderId || null, ts: NOW(), by: curUser().name, role: docRoles(f.type) });
  if (orderId) addHistory(ord(orderId), ord(orderId).status, `Dokument hochgeladen: ${file.name}`);
  audit('Dokument', file.name, 'hochgeladen', orderId || 'ohne Zuordnung'); closeModal(); commit(); toast(auto ? `Automatisch dem Auftrag ${orderId} zugeordnet.` : orderId ? `Dem Auftrag ${orderId} zugeordnet.` : 'Hochgeladen (ohne Auftrag).', 'ok');
});
act('doc.del', 'dokumente', (d) => { const x = allDocs().find((y) => y.id === d.id); if (x.keepUntil > today()) return openModal({ title: 'Löschen nicht möglich', cls: 'small', body: html`<p>Für „${x.name}“ gilt eine Aufbewahrungsfrist bis <b>${fDate(x.keepUntil)}</b> (${retYears(x.type)} Jahre für ${x.type}). Vorher kann das Dokument nicht gelöscht werden.</p>`, foot: html`<button type="button" class="btn primary" data-act="modal.close" autofocus>Verstanden</button>` }); confirmBox(`„${x.name}“ endgültig löschen?`, 'Löschen', () => { DB.docs = DB.docs.filter((y) => y.id !== d.id); audit('Dokument', x.name, 'gelöscht', ''); commit(); }); });

/* ---------- Lager ---------- */
const whLoc = (id) => DB.wh.locations.find((l) => l.id === id) || { name: '–' };
const whArt = (sku) => DB.wh.articles.find((a) => a.sku === sku);
const stockOf = (a) => sum(DB.wh.locations, (l) => a.stock[l.id] || 0);
const slotsUsed = (l) => sum(DB.wh.articles, (a) => ((a.stock[l.id] || 0) > 0 ? Math.ceil((a.stock[l.id] || 0) / a.perPallet) : 0));
view('lager', {
  mod: 'lager', title: 'Lager',
  render() {
    const tl = [['b', 'Bestände'], ['m', 'Bewegungen'], ['s', 'Standorte'], ['i', 'Inventur']];
    const cur = UI.tab.lager || 'b'; const w = canWrite('lager');
    let body;
    if (cur === 'b') {
      const q = fv('wh.q').trim().toLowerCase(); const rows = DB.wh.articles.filter((a) => !q || (a.sku + a.name).toLowerCase().includes(q));
      body = html`<div class="toolbar">${bindInp('Suche', 'wh.q', 'Artikel oder SKU', { cls: 'search' })}${w ? html`<button type="button" class="btn primary" data-act="wh.move" data-kind="Wareneingang">${ic('download')} Wareneingang</button><button type="button" class="btn" data-act="wh.move" data-kind="Warenausgang">${ic('upload')} Warenausgang</button><button type="button" class="btn" data-act="wh.move" data-kind="Umlagerung">${ic('refresh')} Umlagerung</button><button type="button" class="btn ghost" data-act="wh.art">${ic('plus')} Artikel</button>` : ''}</div>
        ${table('wh', [{ k: 's', t: 'SKU', cls: 'nw', f: (a) => html`<span class="mono">${a.sku}</span>`, s: (a) => a.sku }, { k: 'n', t: 'Artikel', f: (a) => a.name, s: (a) => a.name }, ...DB.wh.locations.map((l) => ({ k: l.id, t: l.name.replace(/ (Frankfurt|Hamburg|München)/, ' $1'), cls: 'num', f: (a) => nf(a.stock[l.id] || 0), s: (a) => a.stock[l.id] || 0 })), { k: 'g', t: 'Gesamt', cls: 'num', f: (a) => html`<b>${nf(stockOf(a))}</b>`, s: (a) => stockOf(a), x: (a) => stockOf(a) }, { k: 'u', t: 'Ladeeinheiten', cls: 'nw', f: (a) => `${Math.ceil(stockOf(a) / a.perCarton)} Kartons · ${Math.ceil(stockOf(a) / a.perPallet)} Pal.`, x: (a) => `${Math.ceil(stockOf(a) / a.perCarton)} Kartons` }, { k: 'm', t: 'Bestand', cls: 'nw', f: (a) => (stockOf(a) < a.min ? chip('unter Mindestbestand', 'red') : stockOf(a) < a.min * 1.5 ? chip('knapp', 'amber') : chip('ok', 'green')), s: (a) => stockOf(a) / a.min, x: (a) => (stockOf(a) < a.min ? 'unter Mindestbestand' : 'ok') }], rows, { sort: { k: 's', dir: 1 }, name: 'lagerbestand', noun: 'Artikeln', page: 20 })}`;
    } else if (cur === 'm') {
      const rows = DB.wh.moves.filter((m) => !fv('wh.k') || m.kind === fv('wh.k'));
      body = html`<div class="toolbar">${bindSel('Art', 'wh.k', [['', 'Alle'], 'Wareneingang', 'Warenausgang', 'Einlagerung', 'Auslagerung', 'Umlagerung', 'Inventurdifferenz'])}</div>${table('moves', [{ k: 't', t: 'Zeit', cls: 'nw', f: (m) => fDT(m.ts), s: (m) => m.ts }, { k: 'k', t: 'Art', cls: 'nw', f: (m) => chip(m.kind, m.kind === 'Wareneingang' || m.kind === 'Einlagerung' ? 'green' : m.kind === 'Umlagerung' ? 'blue' : 'amber'), s: (m) => m.kind, x: (m) => m.kind }, { k: 's', t: 'Artikel', f: (m) => html`<span class="mono">${m.sku}</span> ${(whArt(m.sku) || {}).name || ''}`, s: (m) => m.sku, x: (m) => m.sku }, { k: 'q', t: 'Menge', cls: 'num', f: (m) => nf(m.qty), s: (m) => m.qty }, { k: 'l', t: 'Lager', f: (m) => `${whLoc(m.loc).name}${m.to ? ' → ' + whLoc(m.to).name : ''}`, x: (m) => `${whLoc(m.loc).name}${m.to ? ' -> ' + whLoc(m.to).name : ''}` }, { k: 'r', t: 'Auftrag / Bezug', cls: 'nw', f: (m) => (m.ref && ord(m.ref) ? html`<a href="#/auftraege/${m.ref}">${m.ref}</a>` : m.ref || '–'), x: (m) => m.ref || '' }, { k: 'u', t: 'Von', f: (m) => m.by, s: (m) => m.by }], rows, { sort: { k: 't', dir: -1 }, name: 'lagerbewegungen', noun: 'Bewegungen', page: 20 })}`;
    } else if (cur === 's') {
      body = html`<div class="grid g3">${DB.wh.locations.map((l) => { const u = slotsUsed(l); const low = DB.wh.articles.filter((a) => (a.stock[l.id] || 0) < 10); return html`<section class="card"><div class="card-h"><h2>${l.name}</h2>${chip(branchName(l.branch), 'gray')}</div><div class="row" style="justify-content:space-between"><span class="muted">Palettenplätze</span><b>${u} / ${l.slots}</b></div>${progress(u, l.slots)}<dl class="mt-s">${kv('Artikel mit Bestand', DB.wh.articles.filter((a) => (a.stock[l.id] || 0) > 0).length)}${kv('Stückzahl', nf(sum(DB.wh.articles, (a) => a.stock[l.id] || 0)))}${kv('Fast leer (<10)', low.length ? low.map((a) => a.sku).join(', ') : '–')}</dl></section>`; })}</div><p class="note-demo mt">Die Palettenplätze werden aus den Beständen berechnet (je Artikel ein Platz je angefangene ${DB.wh.articles[0].perPallet} Stück).</p>`;
    } else {
      const loc = fv('wh.loc', 'l1');
      const last = DB.wh.counts.filter((c) => c.loc === loc).slice(0, 3);
      body = html`<div class="toolbar">${bindSel('Lagerort', 'wh.loc', DB.wh.locations.map((l) => [l.id, l.name]), { def: 'l1' })}</div><form data-submit="wh.count" class="stack"><input type="hidden" name="loc" value="${loc}">${table('count-' + loc, [{ k: 's', t: 'SKU', cls: 'nw', f: (a) => html`<span class="mono">${a.sku}</span>`, s: (a) => a.sku }, { k: 'n', t: 'Artikel', f: (a) => a.name }, { k: 'soll', t: 'Soll', cls: 'num', f: (a) => nf(a.stock[loc] || 0) }, { k: 'ist', t: 'Ist (gezählt)', cls: 'num', f: (a) => html`<input type="number" name="c_${a.sku}" min="0" value="${a.stock[loc] || 0}" aria-label="Gezählt ${a.name}" style="width:110px;text-align:right">` }], DB.wh.articles, { noExport: true, page: 40, name: 'inventur' })}${w ? html`<div class="row"><button class="btn primary">${ic('check')} Inventur buchen</button><span class="muted tiny">Differenzen werden als Bewegung „Inventurdifferenz“ gebucht.</span></div>` : ''}</form>
        ${last.length ? html`<section class="card mt"><div class="card-h"><h2>Letzte Inventuren</h2></div><ul class="list">${last.map((c) => html`<li>${ic('check')}<div class="grow">${fDT(c.ts)} · ${c.by}<div class="tiny muted">${c.diffs.length ? c.diffs.map((x) => `${x.sku}: ${x.diff > 0 ? '+' : ''}${x.diff}`).join(', ') : 'keine Differenzen'}</div></div></li>`)}</ul></section>` : ''}`;
    }
    const low = DB.wh.articles.filter((a) => stockOf(a) < a.min);
    return html`${pageHead('Lager und Warenverwaltung', 'Optionales Modul: Bestände der Shop-Artikel, Wareneingang, Warenausgang, Umlagerung und Inventur.')}${low.length ? html`<div class="mb">${notice('amber', html`Unter Mindestbestand: ${low.map((a) => html`<b>${a.name}</b>`).reduce((acc, x, i) => (i ? [...acc, ', ', x] : [x]), [])}.`)}</div>` : ''}${tabs('lager', tl, 'b')}${body}`;
  },
});
act('wh.move', 'lager', (d) => {
  const kind = d.kind; const two = kind === 'Umlagerung';
  openModal({ title: kind, form: 'wh.move', cls: 'small', body: html`<input type="hidden" name="kind" value="${kind}"><div class="stack">${fld('Artikel', 'sku', DB.wh.articles[0].sku, { type: 'select', options: DB.wh.articles.map((a) => [a.sku, `${a.sku} · ${a.name}`]) })}${fld('Menge (Stück)', 'qty', '', { type: 'number', min: 1, step: '1', req: true })}${fld(two ? 'Von Lager' : 'Lager', 'loc', 'l1', { type: 'select', options: DB.wh.locations.map((l) => [l.id, l.name]) })}${two ? fld('Nach Lager', 'to', 'l2', { type: 'select', options: DB.wh.locations.map((l) => [l.id, l.name]) }) : ''}${fld('Auftrag / Bezug (optional)', 'ref', '', { type: 'select', options: [['', '– keiner –'], ...DB.orders.filter((o) => o.status !== 'storniert').slice(0, 60).map((o) => [o.id, `${o.nr} · ${o.pickup.city} → ${o.delivery.city}`])] })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Buchen</button>` });
});
onSubmit('wh.move', 'lager', (f) => {
  const a = whArt(f.sku); const q = +f.qty; const out = f.kind === 'Warenausgang' || f.kind === 'Auslagerung' || f.kind === 'Umlagerung';
  if (out && (a.stock[f.loc] || 0) < q) return toast(`Bestand reicht nicht: in ${whLoc(f.loc).name} liegen nur ${nf(a.stock[f.loc] || 0)} Stück.`, 'bad');
  if (f.kind === 'Umlagerung' && f.to === f.loc) return toast('Quell- und Ziellager sind gleich.', 'bad');
  if (out) a.stock[f.loc] = (a.stock[f.loc] || 0) - q; else a.stock[f.loc] = (a.stock[f.loc] || 0) + q;
  if (f.kind === 'Umlagerung') a.stock[f.to] = (a.stock[f.to] || 0) + q;
  DB.wh.moves.unshift({ id: uid('mv'), ts: NOW(), kind: f.kind, sku: f.sku, qty: q, loc: f.loc, to: f.kind === 'Umlagerung' ? f.to : null, ref: f.ref, by: curUser().name });
  audit('Lager', f.sku, f.kind, `${q} Stück, ${whLoc(f.loc).name}`); closeModal(); commit(); toast(`${f.kind}: ${nf(q)} × ${a.name} gebucht.`, 'ok');
});
act('wh.art', 'lager', () => openModal({ title: 'Artikel anlegen', form: 'wh.art', cls: 'small', body: html`<div class="stack">${fld('SKU', 'sku', '', { req: true, ph: 'HOOD-SUN-M' })}${fld('Bezeichnung', 'name', '', { req: true })}${fld('Mindestbestand', 'min', 40, { type: 'number', min: 0 })}${fld('Stück je Karton', 'perCarton', 20, { type: 'number', min: 1 })}${fld('Stück je Palette', 'perPallet', 400, { type: 'number', min: 1 })}</div>`, foot: html`<button type="button" class="btn ghost" data-act="modal.close">Abbrechen</button><button class="btn primary">Anlegen</button>` }));
onSubmit('wh.art', 'lager', (f) => { if (whArt(f.sku.trim())) return toast('Diese SKU gibt es schon.', 'bad'); DB.wh.articles.push({ sku: f.sku.trim(), name: f.name, stock: {}, min: +f.min, perCarton: +f.perCarton, perPallet: +f.perPallet }); audit('Lager', f.sku, 'Artikel angelegt', f.name); closeModal(); commit(); });
onSubmit('wh.count', 'lager', (f) => {
  const diffs = [];
  DB.wh.articles.forEach((a) => { const ist = +f['c_' + a.sku]; const soll = a.stock[f.loc] || 0; if (!isNaN(ist) && ist !== soll) { diffs.push({ sku: a.sku, diff: ist - soll }); a.stock[f.loc] = ist; DB.wh.moves.unshift({ id: uid('mv'), ts: NOW(), kind: 'Inventurdifferenz', sku: a.sku, qty: Math.abs(ist - soll), loc: f.loc, to: null, ref: ist > soll ? 'Mehrbestand' : 'Fehlbestand', by: curUser().name }); } });
  DB.wh.counts.unshift({ id: uid('inv'), ts: NOW(), loc: f.loc, by: curUser().name, diffs }); audit('Lager', whLoc(f.loc).name, 'Inventur', diffs.length ? `${diffs.length} Differenzen` : 'keine Differenzen'); commit(); toast(diffs.length ? `Inventur gebucht, ${diffs.length} Differenz${diffs.length > 1 ? 'en' : ''}.` : 'Inventur gebucht, keine Differenzen.', 'ok');
});
