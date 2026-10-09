// Vercel Serverless Function: KI-Assistent für JWG.logistik. Antwortet mit Claude anhand eines Datenauszugs,
// den die App mitschickt (nur, was Rolle und Standortfilter des Benutzers sehen dürfen).
// Benötigt die Umgebungsvariable ANTHROPIC_API_KEY. Optional:
//   LOGISTIK_CHAT_MODEL   Modell, sonst CHAT_MODEL, sonst claude-opus-5-5 (günstiger: claude-haiku-5-5)
//   LOGISTIK_CHAT_RATE_LIMIT  erlaubte Fragen pro IP und 10 Minuten, Standard 30
// GET liefert nur {available: true|false} ohne Daten, damit die App weiß, ob sie die KI anbieten kann.
const { buildSystemPrompt, buildSnapshotBlock, buildPageNote } = require('./_logistik-prompt.js');

const MODEL = process.env.LOGISTIK_CHAT_MODEL || process.env.CHAT_MODEL || 'claude-opus-5-5';
const MAX_MESSAGES = 12;
const MAX_CHARS = 1500;
const MAX_TOTAL_CHARS = 14000;
const MAX_SNAPSHOT = 70000;
const WINDOW_MS = 10 * 60 * 1000;
const SYSTEM = buildSystemPrompt();

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const mod = require('@anthropic-ai/sdk');
  const Anthropic = mod.default || mod.Anthropic || mod;
  client = new Anthropic();
  return client;
}

// Einfache Begrenzung pro IP. Auf Vercel gilt sie je laufender Instanz, sie bremst also nur grob.
const hits = new Map();
function limited(ip) {
  const max = Number(process.env.LOGISTIK_CHAT_RATE_LIMIT) || 30;
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > max;
}

function parseBody(body) {
  const raw = Array.isArray(body && body.messages) ? body.messages : null;
  if (!raw || !raw.length || raw.length > 100) throw Object.assign(new Error('Ungültige Nachrichten.'), { status: 400 });
  const msgs = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    const role = m && (m.role === 'user' || m.role === 'assistant') ? m.role : null;
    const content = typeof (m && m.content) === 'string' ? m.content.trim().slice(0, MAX_CHARS) : '';
    if (!role || !content) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += '\n' + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw Object.assign(new Error('Die letzte Nachricht muss vom Benutzer sein.'), { status: 400 });
  if (msgs.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL_CHARS) throw Object.assign(new Error('Das Gespräch ist zu lang.'), { status: 400 });
  const snapshot = body.snapshot == null ? '' : body.snapshot;
  if (typeof snapshot !== 'string') throw Object.assign(new Error('Ungültiger Datenauszug.'), { status: 400 });
  if (snapshot.length > MAX_SNAPSHOT) throw Object.assign(new Error('Der Datenauszug ist zu groß.'), { status: 413 });
  return { msgs, snapshot };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Die serverseitige Weiche auf ein Ausweichmodell gibt es nur für diese Modelle.
const supportsFallback = (model) => /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/.test(model);

async function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, { available: !!process.env.ANTHROPIC_API_KEY || !!client });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }
  // Nur Aufrufe von der eigenen Seite zulassen (Browser senden den Origin mit).
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { /* ungültiger Origin */ }
    if (host !== req.headers.host) return json(res, 403, { error: 'forbidden' });
  }
  const api = getClient();
  if (!api) return json(res, 503, { error: 'not_configured' });

  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
  if (limited(ip)) return json(res, 429, { error: 'rate_limited', reply: 'Gerade sind viele Fragen eingegangen. Bitte versuch es in ein paar Minuten noch einmal.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return json(res, 400, { error: 'bad_request' }); }
  }
  let parsed;
  try { parsed = parseBody(body || {}); } catch (e) { return json(res, e.status || 400, { error: e.status === 413 ? 'too_large' : 'bad_request', message: e.message }); }
  const { msgs, snapshot } = parsed;

  // Der Seitenhinweis hängt an der letzten Frage, damit der feste Systemteil im Cache bleibt.
  const note = buildPageNote(body.page);
  if (note) msgs[msgs.length - 1].content += `\n\n[Hinweis der App, nicht vom Benutzer: ${note}]`;

  const params = {
    model: MODEL,
    max_tokens: 2500,
    output_config: { effort: 'medium' },
    // Der feste Teil (Regeln und Hilfewissen) wird gecacht, der Datenauszug ändert sich bei jeder Frage.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: buildSnapshotBlock(snapshot) }],
    messages: msgs,
  };

  try {
    let resp;
    if (supportsFallback(MODEL)) {
      // Fällt eine Antwort in eine Sicherheitsprüfung, übernimmt serverseitig ein Ausweichmodell.
      resp = await api.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } else {
      resp = await api.messages.create(params);
    }
    if (resp.stop_reason === 'refusal') {
      return json(res, 200, { reply: 'Dazu kann ich leider nichts sagen. Frag mich gern etwas zu Aufträgen, Touren, Fahrern, Rechnungen oder zur Bedienung der App.' });
    }
    const reply = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!reply) return json(res, 502, { error: 'empty_reply' });
    return json(res, 200, { reply });
  } catch (err) {
    console.error('logistik-chat error', err && err.status, err && err.message);
    return json(res, 502, { error: 'upstream_error' });
  }
}

module.exports = handler;
module.exports.setClient = (c) => { client = c; };
module.exports._internal = { parseBody, limited, hits, supportsFallback };
