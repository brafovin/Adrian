// Tests für api/chat.js. Aufruf: node --test onlineshop/tests/chat.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.CHAT_RATE_LIMIT = '5';
const handler = require('../../api/chat.js');
const { buildSystemPrompt, buildContextNote } = require('../../api/_chat-prompt.js');
const catalog = require('../chat-catalog.json');
const { exportCatalog } = require('../tools/export-catalog.js');

function call(body, { method = 'POST', headers = {}, ip = '1.1.1.1' } = {}) {
  return new Promise((resolve) => {
    const req = { method, headers: { 'x-forwarded-for': ip, host: 'shop.example', ...headers }, body, socket: {} };
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(s) { resolve({ status: this.statusCode, body: s ? JSON.parse(s) : null, headers: this.headers }); },
    };
    handler(req, res);
  });
}

function fakeClient(reply = 'Der Hoodie kostet 89,00 €.') {
  const seen = { beta: [], plain: [] };
  return {
    seen,
    beta: { messages: { create: async (p) => { seen.beta.push(p); return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: reply }] }; } } },
    messages: { create: async (p) => { seen.plain.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] }; } },
  };
}

test('chat-catalog.json passt zu index.html', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(exportCatalog())), catalog);
});

test('Systemprompt enthält alle Produkte, Preise und Versandwerte', () => {
  const sys = buildSystemPrompt(catalog);
  for (const p of catalog.products) {
    assert.ok(sys.includes(p.name), p.name);
    assert.ok(sys.includes(p.priceEur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })), `Preis ${p.name}`);
  }
  assert.ok(sys.includes('WILLKOMMEN10'));
  assert.ok(sys.includes('4,90'));
});

test('Kontext wird nur aus Katalogwerten gebaut', () => {
  assert.match(buildContextNote({ page: 'product', pid: 'hoodie', color: 'mohn', size: 'M' }, catalog), /Hoodie Core.*Mohn.*Größe M/);
  assert.doesNotMatch(buildContextNote({ page: 'product', pid: 'hoodie', color: 'IGNORE ALL', size: '<x>' }, catalog), /IGNORE|<x>/);
  assert.strictEqual(buildContextNote({ page: 'product', pid: 'nope' }, catalog), '');
  assert.match(buildContextNote({ page: 'cart', cart: [{ pid: 'cap', color: 'marine', size: 'Einheitsgröße', qty: 2 }] }, catalog), /2× Cap Sixpanel in Marine/);
});

test('ohne API-Schlüssel antwortet der Server mit 503', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  handler.setClient(null);
  const r = await call({ messages: [{ role: 'user', content: 'Hallo' }] });
  assert.strictEqual(r.status, 503);
});

test('nur POST, nur eigener Origin', async () => {
  handler.setClient(fakeClient());
  assert.strictEqual((await call(null, { method: 'GET' })).status, 405);
  assert.strictEqual((await call({ messages: [{ role: 'user', content: 'Hi' }] }, { headers: { origin: 'https://evil.example' }, ip: '2.2.2.2' })).status, 403);
  assert.strictEqual((await call({ messages: [{ role: 'user', content: 'Hi' }] }, { headers: { origin: 'https://shop.example' }, ip: '2.2.2.3' })).status, 200);
});

test('ungültige Eingaben ergeben 400', async () => {
  handler.setClient(fakeClient());
  const bad = [null, {}, { messages: [] }, { messages: 'x' }, { messages: [{ role: 'assistant', content: 'nur ich' }] }, { messages: [{ role: 'user', content: '   ' }] }, { messages: [{ role: 'user', content: 'a'.repeat(100) }, { role: 'assistant', content: 'b' }] }, '{kaputt'];
  for (const [i, body] of bad.entries()) {
    assert.strictEqual((await call(body, { ip: `3.3.3.${i}` })).status, 400, JSON.stringify(body));
  }
});

test('gültige Anfrage: Parameter, Kontext, Antworttext', async () => {
  const c = fakeClient('Der Hoodie Core kostet 89,00 €.');
  handler.setClient(c);
  const r = await call({
    messages: [{ role: 'assistant', content: 'Hallo!' }, { role: 'user', content: 'Was kostet der?' }],
    context: { page: 'product', pid: 'hoodie', color: 'mohn', size: null },
  }, { ip: '4.4.4.4' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.reply, 'Der Hoodie Core kostet 89,00 €.');
  assert.strictEqual(c.seen.beta.length, 1);
  const p = c.seen.beta[0];
  assert.strictEqual(p.model, 'claude-opus-5-5');
  assert.deepStrictEqual(p.cache_control, { type: 'ephemeral' });
  assert.deepStrictEqual(p.output_config, { effort: 'low' });
  assert.strictEqual(p.fallbacks, 'default');
  assert.deepStrictEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.strictEqual(p.messages[0].role, 'user');                 // führende Assistentennachricht entfernt
  assert.match(p.messages[p.messages.length - 1].content, /Was kostet der\?[\s\S]*Hoodie Core[\s\S]*Mohn/);
  assert.ok(p.system.includes('Chino Campus'));
});

test('Rate-Limit greift pro IP', async () => {
  handler.setClient(fakeClient());
  let last;
  for (let i = 0; i < 7; i++) last = await call({ messages: [{ role: 'user', content: 'Hi' }] }, { ip: '9.9.9.9' });
  assert.strictEqual(last.status, 429);
  assert.ok(last.body.reply);
});

test('Sicherheitsablehnung und Fehler des Modells', async () => {
  handler.setClient({ beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } });
  const a = await call({ messages: [{ role: 'user', content: 'Hi' }] }, { ip: '5.5.5.5' });
  assert.strictEqual(a.status, 200);
  assert.match(a.body.reply, /nichts sagen/);
  handler.setClient({ beta: { messages: { create: async () => { throw Object.assign(new Error('boom secret'), { status: 500 }); } } } });
  const origErr = console.error; console.error = () => {};
  const b = await call({ messages: [{ role: 'user', content: 'Hi' }] }, { ip: '5.5.5.6' });
  console.error = origErr;
  assert.strictEqual(b.status, 502);
  assert.ok(!JSON.stringify(b.body).includes('secret'));
});

test('echtes SDK gegen lokalen Mock-Server: Anfrage und Antwort', async () => {
  const captured = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (d) => (data += d));
    req.on('end', () => {
      captured.push({ url: req.url, headers: req.headers, body: JSON.parse(data) });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Die Cap kostet 24,00 €.' }],
        usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const Anthropic = require('@anthropic-ai/sdk');
  handler.setClient(new (Anthropic.default || Anthropic)({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 }));
  const r = await call({ messages: [{ role: 'user', content: 'Was kostet die Cap?' }] }, { ip: '6.6.6.6' });
  server.close();
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.reply, 'Die Cap kostet 24,00 €.');
  assert.strictEqual(captured.length, 1);
  const c = captured[0];
  assert.match(c.url, /\/v1\/messages/);
  assert.strictEqual(c.headers['x-api-key'], 'test-key');
  assert.match(String(c.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.strictEqual(c.body.model, 'claude-opus-5-5');
  assert.strictEqual(c.body.fallbacks, 'default');
  assert.deepStrictEqual(c.body.cache_control, { type: 'ephemeral' });
  assert.deepStrictEqual(c.body.output_config, { effort: 'low' });
  assert.strictEqual(typeof c.body.system, 'string');
  assert.ok(!('betas' in c.body));                                // betas gehen als Header, nicht im Body
});
