'use strict';
/* JWG.logistik – Speicher (localStorage), Sitzung, Rechte und Nachschlage-Helfer */

let DB = null;
let SESS = {};
const LS_DB = 'jwg-logistik-v1';
const LS_SESS = 'jwg-logistik-session';
const SHOP_KEY = 'jwg-shop-orders';
let persistOK = true;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { persistOK = false; return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { persistOK = false; return false; } };

function loadDB() {
  let db = null;
  try { const r = lsGet(LS_DB); db = r ? JSON.parse(r) : null; } catch (e) { db = null; }
  // Unveränderte Beispieldaten werden an jedem neuen Tag neu erzeugt, damit "heute" stimmt.
  if (!db || db.v !== 1 || (!db.dirty && db.seedDay !== today())) db = seedDB();
  DB = db;
  (DB.settings.extraBranches || []).forEach((b) => { if (!BRANCHES.find((x) => x.id === b.id)) { BRANCHES.push(b); BRANCH_GEO[b.id] = { lat: b.lat, lon: b.lon }; } });
}
function save() {
  if (!lsSet(LS_DB, JSON.stringify(DB)) && !save.warned) { save.warned = true; toast('Der Browser-Speicher ist voll oder gesperrt. Änderungen bleiben nur bis zum Neuladen erhalten.', 'bad'); }
}
function commit() { DB.dirty = true; save(); if (typeof render === 'function') render(); }
function resetDemo() { DB = seedDB(); save(); toast('Demo-Daten wurden zurückgesetzt.', 'ok'); render(); }

function loadSess() {
  try { SESS = JSON.parse(lsGet(LS_SESS) || '{}') || {}; } catch (e) { SESS = {}; }
  SESS.userId ||= 'u1'; SESS.branch ||= 'all'; SESS.app ||= {}; SESS.portalCustomer ||= null;
}
function saveSess() { lsSet(LS_SESS, JSON.stringify(SESS)); }

/* ---------- Nachschlagen ---------- */
const ord = (id) => DB.orders.find((o) => o.id === id);
const cust = (id) => DB.customers.find((c) => c.id === id);
const drv = (id) => DB.drivers.find((d) => d.id === id);
const veh = (id) => DB.vehicles.find((v) => v.id === id);
const par = (id) => DB.partners.find((p) => p.id === id);
const tour = (id) => DB.tours.find((t) => t.id === id);
const usr = (id) => DB.users.find((u) => u.id === id);
const branchName = (id) => (BRANCHES.find((b) => b.id === id) || {}).name || '–';
const stat = (id) => DB.settings.statuses.find((s) => s.id === id) || { id, name: id, tone: 'gray' };
const prioOf = (id) => DB.settings.priorities.find((s) => s.id === id) || { id, name: id, tone: 'gray' };
const ttype = (id) => DB.settings.transportTypes.find((t) => t.id === id) || { id, name: id };
const vtype = (id) => DB.settings.vehicleTypes.find((t) => t.id === id) || { id, name: id, payload: 0, volume: 0, req: [] };
const statusChip = (id) => chip(stat(id).name, stat(id).tone);
const prioChip = (id) => chip(prioOf(id).name, prioOf(id).tone);
const extraName = (id) => (DB.settings.extras.find((e) => e.id === id) || { name: id }).name;

/* ---------- Benutzer, Rollen, Rechte ---------- */
const curUser = () => usr(SESS.userId) || DB.users[0];
const curRole = () => DB.roles.find((r) => r.id === curUser().role) || DB.roles[0];
let ACTOR = null; // gesetzt, wenn eine Aktion aus Fahrer-App oder Kundenportal kommt
const curUserName = () => ACTOR || curUser().name;
window.roleName = () => curRole().name;
const perm = (mod) => curRole().perm[mod] || '';
const can = (mod) => !!perm(mod);
canWrite = (mod) => perm(mod) === 'w';
const allowedBranches = () => { const u = curUser(); return u.branches && u.branches.length ? u.branches : BRANCHES.map((b) => b.id); };
const inScope = (branch) => { const a = allowedBranches(); return SESS.branch === 'all' ? a.includes(branch) : branch === SESS.branch && a.includes(branch); };

/* ---------- Protokolle, Meldungen ---------- */
function audit(entity, ref, action, text) {
  DB.audit.unshift({ id: uid('au'), ts: NOW(), user: curUserName(), entity, ref, action, text });
  if (DB.audit.length > 900) DB.audit.length = 900;
}
function pushNotif(text, kind = 'info', link = '') {
  DB.notifs.unshift({ id: uid('n'), ts: NOW(), text, kind, link, read: false });
  if (DB.notifs.length > 80) DB.notifs.length = 80;
}
function secLog(event, detail, ok = true) {
  DB.seclog.unshift({ id: uid('s'), ts: NOW(), user: curUserName(), event, detail, ok, ip: '192.0.2.' + (10 + (hash(curUserName()) % 80)) });
  if (DB.seclog.length > 300) DB.seclog.length = 300;
}
