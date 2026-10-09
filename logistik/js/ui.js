'use strict';
/* JWG.logistik – gemeinsame Oberflächenbausteine: Seitenkopf, Tabellen mit Sortierung/Export, Tabs, Filter, Diagramme, Karte */

const VIEWS = {};
const view = (name, def) => { VIEWS[name] = def; };
const UI = { f: {}, sort: {}, lim: {}, tab: {}, pop: null };
const fv = (k, d = '') => (UI.f[k] == null ? d : UI.f[k]);

const pageHead = (title, sub, actions, crumbs) => html`<div class="page-h"><div>${crumbs ? html`<div class="crumbs">${crumbs}</div>` : ''}<h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${actions ? html`<div class="row">${actions}</div>` : ''}</div>`;
const link = (href, text) => html`<a href="${href}">${text}</a>`;
const demoNote = (text) => html`<p class="note-demo"><b>Demo:</b> ${text}</p>`;
const notice = (tone, text, icon = 'alert') => html`<div class="notice tone-${tone}">${ic(icon)}<div>${text}</div></div>`;

/* ---------- Filter-Felder (werden über data-bind in UI.f geschrieben) ---------- */
const bindInp = (label, key, ph = '', o = {}) => html`<label class="fld ${o.cls || ''}"><span>${label}</span><input type="${o.type || 'search'}" data-bind="${key}" value="${fv(key)}" placeholder="${ph}" autocomplete="off"></label>`;
const bindSel = (label, key, options, o = {}) => html`<label class="fld"><span>${label}</span><select data-bind="${key}">${optList(options, fv(key))}</select></label>`;
const bindSw = (label, key, on) => html`<label class="switch"><input type="checkbox" data-bind="${key}" ${(UI.f[key] == null ? on : UI.f[key]) ? raw('checked') : ''}><i></i><span>${label}</span></label>`;

function tabs(key, list, def) {
  const cur = UI.tab[key] || def || list[0][0];
  return html`<div class="tabs" role="tablist">${list.map(([id, label]) => html`<button type="button" role="tab" aria-selected="${cur === id}" data-act="tab" data-key="${key}" data-id="${id}">${label}</button>`)}</div>`;
}
const curTab = (key, list) => UI.tab[key] || list[0][0];
act('tab', null, (d) => { UI.tab[d.key] = d.id; render(); });

/* ---------- Tabellen ---------- */
const TBL = {};
function table(key, cols, rows, o = {}) {
  const sort = UI.sort[key] || o.sort || null;
  let data = rows.slice();
  if (sort) { const c = cols.find((x) => x.k === sort.k); if (c && c.s) data.sort(by(c.s, sort.dir)); }
  TBL[key] = { cols, data, name: o.name || key };
  const lim = UI.lim[key] || o.page || 15;
  const shown = data.slice(0, lim);
  if (!data.length) return html`<div class="tbl-wrap">${empty(o.empty || 'Keine Einträge gefunden', o.emptySub || 'Passe die Filter an oder lege einen neuen Eintrag an.')}</div>`;
  const head = cols.map((c) => {
    const on = sort && sort.k === c.k;
    return html`<th class="${c.cls || ''}" ${c.s ? raw(`aria-sort="${on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"`) : ''}>${c.s ? html`<button type="button" data-act="sort" data-key="${key}" data-col="${c.k}" title="Sortieren">${c.t}${on ? ic(sort.dir > 0 ? 'up' : 'down') : ''}</button>` : c.t}</th>`;
  });
  const body = shown.map((r) => html`<tr>${cols.map((c, i) => html`<td data-l="${c.t}" class="${c.cls || ''} ${i === 0 ? 'first' : ''} ${c.nolabel ? 'nolabel' : ''}">${c.f(r)}</td>`)}</tr>`);
  const foot = o.foot ? html`<tfoot><tr>${o.foot}</tr></tfoot>` : '';
  return html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
    <div class="tbl-foot"><span>${shown.length} von ${data.length} ${o.noun || 'Einträgen'}</span><span class="row">${data.length > lim ? html`<button type="button" class="btn sm" data-act="more" data-key="${key}">Mehr anzeigen</button>` : ''}${o.noExport ? '' : html`<button type="button" class="btn sm" data-act="tbl.export" data-key="${key}">${ic('download')} CSV / Excel</button>`}</span></div></div>`;
}
act('sort', null, (d) => { const cur = UI.sort[d.key]; UI.sort[d.key] = cur && cur.k === d.col ? { k: d.col, dir: -cur.dir } : { k: d.col, dir: 1 }; render(); });
act('more', null, (d) => { UI.lim[d.key] = (UI.lim[d.key] || 15) + 20; render(); });
act('tbl.export', null, (d) => {
  const t = TBL[d.key]; if (!t) return;
  const cols = t.cols.filter((c) => c.x || c.s);
  downloadCSV(`jwg-logistik-${t.name}-${today()}.csv`, cols.map((c) => c.t), t.data.map((r) => cols.map((c) => (c.x ? c.x(r) : c.s(r)))));
});

/* ---------- Diagramme ---------- */
const PAL = ['#4F6BFF', '#27D3A2', '#FFB020', '#FF5A47', '#9B83FF', '#FF7DBB', '#6B7699'];
function barChart(data, o = {}) {
  const W = 560, H = o.h || 210, L = 44, B = 30, T = 18, R = 8;
  const max = Math.max(1, ...data.map((d) => d.v)) * 1.1;
  const nice = (m) => { const p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p) * p; };
  const top = nice(max), bw = (W - L - R) / data.length;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => html`<line class="gl" x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}"/><text x="${L - 6}" y="${y(top * f) + 4}" text-anchor="end">${o.fmt ? o.fmt(top * f) : nf(top * f)}</text>`);
  const bars = data.map((d, i) => html`<g><title>${d.label}: ${o.fmt ? o.fmt(d.v) : nf(d.v)}</title><rect x="${L + i * bw + bw * 0.18}" y="${y(d.v)}" width="${bw * 0.64}" height="${Math.max(0, H - B - y(d.v))}" rx="4" style="fill:${d.color || PAL[0]}"/><text x="${L + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${d.label}</text></g>`);
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label || 'Balkendiagramm'}">${grid}${bars}</svg>`;
}
function lineChart(series, labels, o = {}) {
  const W = 560, H = o.h || 210, L = 44, B = 30, T = 16, R = 12;
  const max = Math.max(1, ...series.flatMap((s) => s.data)) * 1.12;
  const p = 10 ** Math.floor(Math.log10(max)), top = Math.ceil(max / p) * p;
  const x = (i) => L + ((W - L - R) * i) / Math.max(1, labels.length - 1), y = (v) => T + (H - T - B) * (1 - v / top);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => html`<line class="gl" x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}"/><text x="${L - 6}" y="${y(top * f) + 4}" text-anchor="end">${o.fmt ? o.fmt(top * f) : nf(top * f)}</text>`);
  const step = Math.ceil(labels.length / 8);
  const xl = labels.map((l, i) => (i % step === 0 ? html`<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${l}</text>` : ''));
  const lines = series.map((s, k) => {
    const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
    const area = o.area && k === 0 ? html`<path d="${d} L${x(s.data.length - 1)} ${H - B} L${x(0)} ${H - B}Z" style="fill:${s.color || PAL[k]};opacity:.12"/>` : '';
    return html`${area}<path d="${d}" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="stroke:${s.color || PAL[k]}"/>${s.data.map((v, i) => html`<circle cx="${x(i)}" cy="${y(v)}" r="3.4" style="fill:${s.color || PAL[k]}"><title>${labels[i]}: ${o.fmt ? o.fmt(v) : nf(v)}</title></circle>`)}`;
  });
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label || 'Liniendiagramm'}">${grid}${xl}${lines}</svg>${series.length > 1 ? html`<div class="legend">${series.map((s, k) => html`<span><i style="background:${s.color || PAL[k]}"></i>${s.name}</span>`)}</div>` : ''}`;
}
function donut(data, o = {}) {
  const total = sum(data, (d) => d.v) || 1, r = 52, c = 2 * Math.PI * r;
  let off = 0;
  const segs = data.filter((d) => d.v > 0).map((d, i) => {
    const len = (d.v / total) * c;
    const s = html`<circle r="${r}" cx="70" cy="70" fill="none" stroke-width="22" style="stroke:${d.color || PAL[i % PAL.length]}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${d.label}: ${nf(d.v)}</title></circle>`;
    off += len; return s;
  });
  return html`<div class="donut-wrap"><svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="${o.label || 'Kreisdiagramm'}"><circle r="${r}" cx="70" cy="70" fill="none" stroke-width="22" style="stroke:var(--line)"/>${segs}<text x="70" y="68" text-anchor="middle" style="font:800 22px var(--font-display);fill:var(--ink)">${o.center != null ? o.center : nf(total)}</text><text x="70" y="84" text-anchor="middle" style="font-size:9px;fill:var(--muted)">${o.centerLabel || 'gesamt'}</text></svg>
  <div class="legend" style="flex-direction:column;margin:0">${data.map((d, i) => html`<span><i style="background:${d.color || PAL[i % PAL.length]}"></i>${d.label}: <b style="color:var(--ink)">${nf(d.v)}</b></span>`)}</div></div>`;
}
function hbars(data, o = {}) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return html`<div class="hbars">${data.map((d, i) => html`<div class="hbar"><span>${d.label}</span><div class="t"><i style="width:${(d.v / max) * 100}%;--c:${d.color || PAL[i % PAL.length]}"></i></div><b>${d.text != null ? d.text : nf(d.v)}</b></div>`)}</div>`;
}

/* ---------- Karte (schematisch, Deutschland) ---------- */
const MAPW = 570, MAPH = 740;
const mproj = (lat, lon) => [(lon - 5.6) * 58.9, (55.25 - lat) * 92];
const TOUR_COLORS = ['#4F6BFF', '#FF5A47', '#27D3A2', '#FFB020', '#9B83FF', '#FF7DBB'];
const MAJOR = ['Hamburg', 'Berlin', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Leipzig', 'Dresden', 'Hannover', 'Nürnberg', 'Bremen', 'Düsseldorf', 'Kassel', 'Rostock', 'Erfurt', 'Karlsruhe', 'Kiel', 'Magdeburg', 'Würzburg', 'Mainz', 'Darmstadt', 'Wiesbaden', 'Lübeck', 'Dortmund', 'Münster', 'Bielefeld', 'Augsburg', 'Regensburg', 'Freiburg', 'Saarbrücken', 'Essen', 'Offenbach am Main'];
/* o.tours: [{tour, sch, idx, pos}], o.points: [{lat,lon,label,kind,color}], o.fit */
function mapSVG(o = {}) {
  const pts = [];
  (o.tours || []).forEach((t) => { pts.push(t.sch.depot, ...t.sch.stops.map((s) => s.pos)); if (t.pos) pts.push(t.pos); });
  (o.points || []).forEach((p) => pts.push(p));
  let vb = [0, 0, MAPW, MAPH];
  if (o.fit && pts.length) {
    const xy = pts.map((p) => mproj(p.lat, p.lon));
    const minx = Math.min(...xy.map((p) => p[0])), maxx = Math.max(...xy.map((p) => p[0])), miny = Math.min(...xy.map((p) => p[1])), maxy = Math.max(...xy.map((p) => p[1]));
    let hw = Math.max((maxx - minx) / 2 * 1.3, 55), hh = Math.max((maxy - miny) / 2 * 1.3, 44);
    const ar = o.ratio || 1.3;
    if (hw / hh > ar) hh = hw / ar; else hw = hh * ar;
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    vb = [cx - hw, cy - hh, hw * 2, hh * 2];
  } else if (!o.fit) vb = [20, 10, 520, 700];
  const k = vb[2] / (o.px || 400);
  const land = 'M' + DE_OUTLINE.map(([la, lo]) => mproj(la, lo).map((v) => v.toFixed(1)).join(' ')).join('L') + 'Z';
  const inView = (x, y) => x > vb[0] - 10 && x < vb[0] + vb[2] + 10 && y > vb[1] - 10 && y < vb[1] + vb[3] + 10;
  const cities = CITIES.filter((c) => MAJOR.includes(c.name)).map((c) => {
    const [x, y] = mproj(c.lat, c.lon);
    if (!inView(x, y)) return '';
    return html`<circle class="cdot" cx="${x}" cy="${y}" r="${2.4 * k}"/><text class="clab" x="${x + 4 * k}" y="${y + 3 * k}" style="font-size:${9 * k}px">${c.name.replace(' am Main', '')}</text>`;
  });
  const depots = BRANCHES.map((b) => { const g = BRANCH_GEO[b.id]; const [x, y] = mproj(g.lat, g.lon); if (!inView(x, y)) return ''; return html`<g><title>Niederlassung ${b.name}</title><rect x="${x - 6 * k}" y="${y - 6 * k}" width="${12 * k}" height="${12 * k}" rx="${2 * k}" style="fill:var(--navy);stroke:#fff;stroke-width:${1.5 * k}"/></g>`; });
  const routes = (o.tours || []).map((t) => {
    const col = TOUR_COLORS[t.idx % TOUR_COLORS.length];
    const path = [t.sch.depot, ...t.sch.stops.map((s) => s.pos), t.sch.depot].map((p) => mproj(p.lat, p.lon).map((v) => v.toFixed(1)).join(' '));
    const dim = o.focus && o.focus !== t.tour.id;
    const pins = t.sch.stops.map((s, i) => {
      const [x, y] = mproj(s.pos.lat, s.pos.lon);
      const shape = s.kind === 'P' ? html`<circle cx="${x}" cy="${y}" r="${7.5 * k}" style="fill:${col};stroke:#fff;stroke-width:${1.5 * k};${s.done ? 'opacity:.45' : ''}"/>` : html`<rect x="${x - 7 * k}" y="${y - 7 * k}" width="${14 * k}" height="${14 * k}" rx="${3 * k}" style="fill:${col};stroke:#fff;stroke-width:${1.5 * k};${s.done ? 'opacity:.45' : ''}"/>`;
      return html`<g class="pin"><title>${i + 1}. ${s.kind === 'P' ? 'Abholung' : 'Zustellung'} ${s.addr.city}${s.late ? ' (verspätet)' : ''}</title>${shape}<text x="${x}" y="${y + 3 * k}" style="font-size:${9 * k}px">${i + 1}</text></g>`;
    });
    const vehicle = t.pos && t.tour.status === 'unterwegs' ? (() => { const [x, y] = mproj(t.pos.lat, t.pos.lon); return html`<g class="veh"><title>${(veh(t.tour.vehicleId) || {}).plate || 'Fahrzeug'}</title><circle class="pulse" cx="${x}" cy="${y}" r="${9 * k}" style="fill:${col}"/><circle cx="${x}" cy="${y}" r="${8 * k}" style="fill:#0D1233;stroke:${col};stroke-width:${3 * k}"/><path d="M${x - 4 * k} ${y + 2 * k}h${8 * k}M${x - 3 * k} ${y - 2 * k}h${5 * k}v${4 * k}" fill="none" stroke="#fff" stroke-width="${1.4 * k}"/></g>`; })() : '';
    return html`<g style="${dim ? 'opacity:.3' : ''}"><path class="route" d="M${path.join('L')}" style="stroke:${col};stroke-width:${3.2 * k}" stroke-dasharray="${t.tour.status === 'geplant' ? `${7 * k} ${6 * k}` : 'none'}"/>${pins}${vehicle}</g>`;
  });
  const points = (o.points || []).map((p) => { const [x, y] = mproj(p.lat, p.lon); return html`<g class="pin"><title>${p.label}</title><circle cx="${x}" cy="${y}" r="${8 * k}" style="fill:${p.color || '#4F6BFF'};stroke:#fff;stroke-width:${1.5 * k}"/><text x="${x}" y="${y + 3 * k}" style="font-size:${9 * k}px">${p.mark || ''}</text></g>`; });
  const lines = (o.lines || []).map((l) => html`<path d="M${mproj(l[0].lat, l[0].lon).join(' ')}L${mproj(l[1].lat, l[1].lon).join(' ')}" fill="none" style="stroke:${l[2] || '#6B7699'}" stroke-width="${2.6 * k}" stroke-dasharray="${6 * k} ${5 * k}" stroke-linecap="round"/>`);
  const vehs = (o.vehicles || []).map((v) => { const [x, y] = mproj(v.lat, v.lon); return html`<g class="veh"><title>${v.label}</title><circle class="pulse" cx="${x}" cy="${y}" r="${9 * k}" style="fill:${v.color || '#FF5A47'}"/><circle cx="${x}" cy="${y}" r="${8 * k}" style="fill:#0D1233;stroke:${v.color || '#FF5A47'};stroke-width:${3 * k}"/></g>`; });
  return html`<svg class="map" viewBox="${vb.map((v) => v.toFixed(1)).join(' ')}" role="img" aria-label="${o.label || 'Schematische Karte'}" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:${(vb[2] / vb[3]).toFixed(3)}"><rect x="${vb[0] - 500}" y="${vb[1] - 500}" width="${vb[2] + 1000}" height="${vb[3] + 1000}" style="fill:var(--sea)"/><path class="land" d="${land}" style="stroke-width:${1.2 * k}"/>${cities}${depots}${lines}${routes}${points}${vehs}</svg>`;
}
