(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CART_KEY = 'jwg-cart-v1';
  let catalog = null;
  let product = null; // aktuell angezeigtes Produkt
  let cart = [];
  let size = null;
  let qty = 1;
  let lastFocus = null;

  const eur = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => n.append(k));
    return n;
  };

  // ---------- Warenkorb (localStorage, wird gegen den Katalog geprüft) ----------
  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      cart = (Array.isArray(raw) ? raw : []).filter((i) => i && productOf(i.id) && productOf(i.id).sizes.includes(i.size))
        .map((i) => ({ id: i.id, size: i.size, qty: Math.min(catalog.maxQtyPerItem, Math.max(1, parseInt(i.qty, 10) || 1)) }));
    } catch { cart = []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* privater Modus */ }
    renderCart();
  }
  const productOf = (id) => catalog.products.find((p) => p.id === id);
  const subtotal = () => cart.reduce((s, i) => s + productOf(i.id).priceCents * i.qty, 0);
  const count = () => cart.reduce((s, i) => s + i.qty, 0);

  function addToCart() {
    if (!size) { $('size-hint').hidden = false; return; }
    const ex = cart.find((i) => i.id === product.id && i.size === size);
    if (ex) ex.qty = Math.min(catalog.maxQtyPerItem, ex.qty + qty);
    else cart.push({ id: product.id, size, qty });
    saveCart();
    openDrawer();
  }

  function renderCart() {
    const n = count();
    $('cart-count').hidden = n === 0;
    $('cart-count').textContent = n;
    const body = $('cart-items');
    body.replaceChildren();
    $('cart-foot').hidden = cart.length === 0;
    if (!cart.length) { body.append(el('p', { className: 'empty', textContent: 'Dein Warenkorb ist leer.' })); return; }
    cart.forEach((item) => {
      const p = productOf(item.id);
      const step = (d) => { item.qty = Math.min(catalog.maxQtyPerItem, Math.max(1, item.qty + d)); saveCart(); };
      body.append(el('div', { className: 'line' },
        el('img', { src: p.images[0].src, alt: '', width: 72, height: 84 }),
        el('div', {},
          el('div', { className: 'line-title', textContent: p.name }),
          el('div', { className: 'line-meta', textContent: `${p.color}${p.sizes.length > 1 ? ` · Größe ${item.size}` : ''} · ${eur(p.priceCents)}` }),
          el('div', { className: 'line-actions' },
            el('div', { className: 'qty-sm' },
              el('button', { type: 'button', textContent: '−', ariaLabel: 'Weniger', onclick: () => step(-1) }),
              el('output', { textContent: item.qty }),
              el('button', { type: 'button', textContent: '+', ariaLabel: 'Mehr', onclick: () => step(1) })),
            el('button', { type: 'button', className: 'link-btn', textContent: 'Entfernen', onclick: () => { cart = cart.filter((c) => c !== item); saveCart(); } })))));
    });
    $('cart-subtotal').textContent = eur(subtotal());
  }

  // ---------- Drawer & Modal ----------
  function openDrawer() {
    lastFocus = document.activeElement;
    $('overlay').hidden = false;
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('close-cart').focus();
  }
  function closeDrawer(restore = true) {
    $('overlay').hidden = true;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    if (restore && lastFocus) lastFocus.focus();
  }
  function openCheckout() {
    closeDrawer(false);
    $('co-demo').hidden = true;
    $('co-form').hidden = false;
    $('co-error').hidden = true;
    $('co-submit').disabled = false;
    $('co-submit').textContent = 'Zahlungspflichtig bestellen';
    renderSummary();
    $('checkout').classList.add('open');
    $('checkout').setAttribute('aria-hidden', 'false');
    $('co-form').elements.name.focus();
  }
  function closeCheckout() {
    $('checkout').classList.remove('open');
    $('checkout').setAttribute('aria-hidden', 'true');
    if (lastFocus) lastFocus.focus();
  }

  function shippingCents(method) {
    const d = catalog.delivery[method];
    return method === 'shipping' && subtotal() >= d.freeFromCents ? 0 : d.priceCents;
  }
  function renderSummary() {
    const method = $('co-form').elements.delivery.value;
    const lines = $('co-lines');
    lines.replaceChildren(...cart.map((i) => {
      const p = productOf(i.id);
      return el('div', { className: 'co-line' },
        el('span', { textContent: `${i.qty}× ${p.name}${p.sizes.length > 1 ? ` (${i.size})` : ''}` }),
        el('span', { textContent: eur(p.priceCents * i.qty) }));
    }));
    const ship = shippingCents(method);
    $('co-sub').textContent = eur(subtotal());
    $('co-ship').textContent = ship === 0 ? 'kostenlos' : eur(ship);
    $('co-total').textContent = eur(subtotal() + ship);
  }

  // ---------- Bestellung abschicken ----------
  async function submitOrder(e) {
    e.preventDefault();
    const f = $('co-form');
    const err = $('co-error');
    err.hidden = true;
    const name = f.elements.name.value.trim();
    const email = f.elements.email.value.trim();
    f.elements.name.classList.toggle('invalid', name.length < 2);
    f.elements.email.classList.toggle('invalid', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email));
    const problem = name.length < 2 ? 'Bitte gib deinen Namen an.'
      : f.elements.email.classList.contains('invalid') ? 'Bitte gib eine gültige E-Mail-Adresse an.'
      : !f.elements.agree.checked ? 'Bitte bestätige AGB, Widerruf und Datenschutz.' : '';
    if (problem) { err.textContent = problem; err.hidden = false; return; }

    const btn = $('co-submit');
    btn.disabled = true;
    btn.textContent = 'Einen Moment …';
    try {
      if (window.SHOP_DEMO) { f.hidden = true; $('co-demo').hidden = false; return; }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, delivery: f.elements.delivery.value, items: cart }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { location.assign(data.url); return; }
      // Kein Bezahl-Backend (statisches Hosting) oder Stripe-Key fehlt → Demo-Modus
      if (res.status === 501 || res.status === 404 || res.status === 405) { f.hidden = true; $('co-demo').hidden = false; return; }
      throw new Error(data.error || 'Bestellung fehlgeschlagen.');
    } catch (ex) {
      err.textContent = ex instanceof TypeError ? 'Keine Verbindung. Bitte prüfe dein Internet und versuche es erneut.' : ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Zahlungspflichtig bestellen';
    }
  }

  // ---------- Produktseite ----------
  function renderGrid() {
    const grid = $('product-grid');
    grid.replaceChildren(...catalog.products.map((p) => el('button', {
      type: 'button', className: 'card', id: `card-${p.id}`, onclick: () => selectProduct(p.id, true),
    },
      el('img', { src: p.images[0].src, alt: '', loading: 'lazy', width: 615, height: 715 }),
      el('span', { className: 'card-name', textContent: p.name }),
      el('span', { className: 'card-price', textContent: eur(p.priceCents) }))));
  }

  function selectProduct(id, scroll) {
    product = productOf(id) || catalog.products[0];
    size = product.sizes.length === 1 ? product.sizes[0] : null;
    qty = 1;
    $('qty-val').textContent = qty;
    $('size-hint').hidden = true;
    $('p-name').textContent = product.name;
    $('p-sub').textContent = product.subtitle;
    $('p-price').textContent = eur(product.priceCents);
    $('p-color').textContent = product.color;
    document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-current', String(c.id === `card-${product.id}`)));

    const list = $('size-list');
    list.replaceChildren(...product.sizes.map((s) => el('label', {},
      el('input', { type: 'radio', name: 'size', value: s, checked: product.sizes.length === 1, onchange: () => { size = s; $('size-hint').hidden = true; } }),
      el('span', { textContent: s }))));
    list.closest('fieldset').querySelector('legend').textContent = product.sizes.length === 1 ? 'Größe (nur eine)' : 'Größe';

    $('p-facts').replaceChildren(...product.facts.map((f) => el('li', { textContent: f })));

    const thumbs = $('thumbs');
    const show = (i) => {
      const im = product.images[i];
      $('main-img').src = im.src;
      $('main-img').alt = `${product.name} – ${im.alt}`;
      [...thumbs.children].forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    };
    thumbs.replaceChildren(...product.images.map((im, i) => el('button', {
      type: 'button', role: 'tab', ariaSelected: String(i === 0), ariaLabel: im.alt, onclick: () => show(i),
    }, el('img', { src: im.src, alt: '', loading: 'lazy' }))));
    show(0);
    if (scroll) $('produkt').scrollIntoView({ behavior: 'smooth' });
  }

  function renderInfo() {
    const d = catalog.delivery;
    $('info-shipping').textContent = `Versand ${eur(d.shipping.priceCents)} (ab ${eur(d.shipping.freeFromCents)} kostenlos) nach DE, AT und CH.`
      + (d.pickup.enabled ? ' Alternativ kannst du deine Bestellung kostenlos in der Schule abholen.' : '');
    $('lbl-shipping').textContent = `Versand – ${eur(d.shipping.priceCents)} (ab ${eur(d.shipping.freeFromCents)} kostenlos)`;
    $('lbl-pickup').textContent = d.pickup.label;
    $('pickup-wrap').hidden = !d.pickup.enabled;
  }

  function showBanner() {
    const status = new URLSearchParams(location.search).get('status');
    if (!status) return;
    const b = $('banner');
    if (status === 'success') {
      cart = []; saveCart();
      b.className = 'banner ok';
      b.textContent = 'Danke für deine Bestellung! Du bekommst eine Bestätigung per E-Mail.';
    } else if (status === 'cancel') {
      b.className = 'banner warn';
      b.textContent = 'Die Zahlung wurde abgebrochen. Dein Warenkorb ist noch da.';
    } else return;
    b.hidden = false;
    history.replaceState(null, '', location.pathname);
  }

  async function init() {
    try {
      catalog = await (await fetch('catalog.json')).json();
    } catch {
      $('product-grid').textContent = 'Shop konnte nicht geladen werden – bitte über einen Webserver öffnen.';
      return;
    }
    renderGrid();
    renderInfo();
    selectProduct(catalog.products[0].id, false);
    loadCart();
    renderCart();
    showBanner();

    $('open-cart').onclick = openDrawer;
    $('close-cart').onclick = () => closeDrawer();
    $('overlay').onclick = () => closeDrawer();
    $('to-checkout').onclick = openCheckout;
    $('close-checkout').onclick = closeCheckout;
    $('demo-close').onclick = closeCheckout;
    $('checkout').addEventListener('mousedown', (e) => { if (e.target === $('checkout')) closeCheckout(); });
    $('co-form').addEventListener('submit', submitOrder);
    $('co-form').addEventListener('change', (e) => { if (e.target.name === 'delivery') renderSummary(); });
    $('add-btn').onclick = addToCart;
    $('qty-minus').onclick = () => { qty = Math.max(1, qty - 1); $('qty-val').textContent = qty; };
    $('qty-plus').onclick = () => { qty = Math.min(catalog.maxQtyPerItem, qty + 1); $('qty-val').textContent = qty; };
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('checkout').classList.contains('open')) closeCheckout(); else closeDrawer();
    });
  }
  init();
})();
