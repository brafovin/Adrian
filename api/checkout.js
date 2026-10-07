// Vercel Serverless Function: erstellt eine Stripe-Checkout-Sitzung.
// Preise kommen ausschließlich aus shop/catalog.json – nie vom Browser.
// Benötigt die Umgebungsvariable STRIPE_SECRET_KEY (optional: SITE_URL, z. B. https://mein-shop.de).
const catalog = require('../shop/catalog.json');

const MAX_ITEMS = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Prüft den Warenkorb und berechnet alles serverseitig.
function buildOrder(body) {
  const items = Array.isArray(body && body.items) ? body.items : null;
  if (!items || !items.length || items.length > MAX_ITEMS) throw new Error('Warenkorb ist leer oder ungültig.');

  const lines = items.map((it) => {
    const product = catalog.products.find((p) => p.id === it.id);
    const qty = Number(it.qty);
    if (!product || !product.sizes.includes(it.size)) throw new Error('Ungültiger Artikel.');
    if (!Number.isInteger(qty) || qty < 1 || qty > catalog.maxQtyPerItem) throw new Error('Ungültige Menge.');
    return { product, size: it.size, qty };
  });

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  if (name.length < 2 || name.length > 100) throw new Error('Bitte gib deinen Namen an.');
  if (!EMAIL_RE.test(email) || email.length > 200) throw new Error('Bitte gib eine gültige E-Mail-Adresse an.');

  const method = body.delivery === 'pickup' ? 'pickup' : 'shipping';
  if (method === 'pickup' && !catalog.delivery.pickup.enabled) throw new Error('Abholung ist nicht verfügbar.');

  const subtotal = lines.reduce((s, l) => s + l.product.priceCents * l.qty, 0);
  const d = catalog.delivery[method];
  const shippingCents = method === 'shipping' && subtotal >= d.freeFromCents ? 0 : d.priceCents;
  return { lines, name, email, method, subtotal, shippingCents };
}

function stripeParams(order, origin) {
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('locale', 'de');
  p.set('customer_email', order.email);
  p.set('success_url', `${origin}/shop/?status=success`);
  p.set('cancel_url', `${origin}/shop/?status=cancel`);
  p.set('phone_number_collection[enabled]', 'true');
  order.lines.forEach((l, i) => {
    const k = `line_items[${i}]`;
    p.set(`${k}[quantity]`, String(l.qty));
    p.set(`${k}[price_data][currency]`, catalog.currency);
    p.set(`${k}[price_data][unit_amount]`, String(l.product.priceCents));
    p.set(`${k}[price_data][product_data][name]`, `${l.product.name} – ${l.product.color}, Größe ${l.size}`);
    p.set(`${k}[price_data][product_data][images][0]`, `${origin}/shop/${l.product.image}`);
  });
  const so = 'shipping_options[0][shipping_rate_data]';
  p.set(`${so}[type]`, 'fixed_amount');
  p.set(`${so}[fixed_amount][amount]`, String(order.shippingCents));
  p.set(`${so}[fixed_amount][currency]`, catalog.currency);
  p.set(`${so}[display_name]`, catalog.delivery[order.method].label);
  if (order.method === 'shipping') {
    catalog.delivery.shipping.countries.forEach((c, i) => p.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  }
  p.set('metadata[kunde]', order.name);
  p.set('metadata[lieferart]', order.method === 'pickup' ? 'Abholung' : 'Versand');
  p.set('metadata[artikel]', order.lines.map((l) => `${l.qty}x ${l.product.name} ${l.size}`).join(', ').slice(0, 480));
  return p;
}

function originOf(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  return `${proto}://${req.headers.host}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt.' });

  let order;
  try {
    order = buildOrder(await readBody(req));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(501).json({ error: 'Zahlung nicht eingerichtet.', code: 'not_configured' });

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: stripeParams(order, originOf(req)).toString(),
    });
    const data = await r.json();
    if (!r.ok || !data.url) {
      console.error('Stripe-Fehler', r.status, data && data.error && data.error.message);
      return res.status(502).json({ error: 'Der Zahlungsanbieter hat die Anfrage abgelehnt. Bitte versuche es später erneut.' });
    }
    return res.status(200).json({ url: data.url });
  } catch (e) {
    console.error('Stripe nicht erreichbar', e);
    return res.status(502).json({ error: 'Zahlungsanbieter nicht erreichbar.' });
  }
};

module.exports.buildOrder = buildOrder;
module.exports.stripeParams = stripeParams;
