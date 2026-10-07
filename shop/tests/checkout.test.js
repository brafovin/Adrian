// Ausführen: node --test shop/tests/checkout.test.js
const test = require('node:test');
const assert = require('node:assert');
const handler = require('../../api/checkout.js');

const base = { name: 'Max Muster', email: 'max@example.com', delivery: 'shipping', items: [{ id: 'jwg-hoodie', size: 'M', qty: 2 }] };

function call(body, { method = 'POST', key } = {}) {
  if (key) process.env.STRIPE_SECRET_KEY = key; else delete process.env.STRIPE_SECRET_KEY;
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    handler({ method, body, headers: { host: 'shop.test', 'x-forwarded-proto': 'https' } }, res);
  });
}

test('Preis kommt vom Server: 2 × 39,90 € + 4,90 € Versand', () => {
  const o = handler.buildOrder(base);
  assert.equal(o.subtotal, 7980);
  assert.equal(o.shippingCents, 490);
});

test('Gratisversand ab Schwelle, Abholung kostenlos', () => {
  assert.equal(handler.buildOrder({ ...base, items: [{ id: 'jwg-hoodie', size: 'L', qty: 3 }] }).shippingCents, 0);
  assert.equal(handler.buildOrder({ ...base, delivery: 'pickup' }).shippingCents, 0);
});

test('Ungültige Eingaben werden abgelehnt', () => {
  for (const bad of [
    { ...base, items: [] },
    { ...base, items: [{ id: 'x', size: 'M', qty: 1 }] },
    { ...base, items: [{ id: 'jwg-hoodie', size: 'XS', qty: 1 }] },
    { ...base, items: [{ id: 'jwg-hoodie', size: 'M', qty: 0 }] },
    { ...base, items: [{ id: 'jwg-hoodie', size: 'M', qty: 99 }] },
    { ...base, items: [{ id: 'jwg-hoodie', size: 'M', qty: 1.5 }] },
    { ...base, email: 'kein-email' },
    { ...base, name: '' },
  ]) assert.throws(() => handler.buildOrder(bad));
});

test('Preis im Request wird ignoriert', () => {
  const o = handler.buildOrder({ ...base, items: [{ id: 'jwg-hoodie', size: 'M', qty: 1, priceCents: 1 }] });
  assert.equal(o.subtotal, 3990);
});

test('Stripe-Parameter', () => {
  const p = handler.stripeParams(handler.buildOrder(base), 'https://shop.test');
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '3990');
  assert.equal(p.get('line_items[0][quantity]'), '2');
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '490');
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), 'DE');
  assert.equal(p.get('success_url'), 'https://shop.test/shop/?status=success');
  const pick = handler.stripeParams(handler.buildOrder({ ...base, delivery: 'pickup' }), 'https://shop.test');
  assert.equal(pick.get('shipping_address_collection[allowed_countries][0]'), null);
});

test('HTTP: GET 405, ohne Key 501, ungültig 400', async () => {
  assert.equal((await call(base, { method: 'GET' })).code, 405);
  const r = await call(base);
  assert.equal(r.code, 501);
  assert.equal(r.body.code, 'not_configured');
  assert.equal((await call({ ...base, items: [] })).code, 400);
});

test('HTTP: mit Key wird Stripe aufgerufen und URL zurückgegeben', async () => {
  const orig = global.fetch;
  let seen;
  global.fetch = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/x' }) }; };
  try {
    const r = await call(base, { key: 'sk_test_x' });
    assert.equal(r.code, 200);
    assert.equal(r.body.url, 'https://checkout.stripe.com/c/pay/x');
    assert.equal(seen.url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(seen.init.headers.Authorization, 'Bearer sk_test_x');
  } finally { global.fetch = orig; delete process.env.STRIPE_SECRET_KEY; }
});

test('HTTP: Stripe-Fehler → 502 ohne Details nach außen', async () => {
  const orig = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key sk_test_geheim' } }) });
  const log = console.error; console.error = () => {};
  try {
    const r = await call(base, { key: 'sk_test_x' });
    assert.equal(r.code, 502);
    assert.ok(!JSON.stringify(r.body).includes('geheim'));
  } finally { global.fetch = orig; console.error = log; delete process.env.STRIPE_SECRET_KEY; }
});
