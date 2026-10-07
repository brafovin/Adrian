/** Kleine, abhängigkeitsfreie Hilfsfunktionen. */

/** Erzeugt DOM-Elemente (ohne innerHTML, damit Nutzereingaben nie als HTML interpretiert werden). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Ersetzt den Inhalt eines Elements (ignoriert null/false, flacht Arrays ab). */
export function setChildren(parent, ...children) {
  parent.replaceChildren();
  return append(parent, children);
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function formatLong(sec) {
  const total = Math.round(sec / 60);
  if (total >= 60) return `${Math.floor(total / 60)} Std. ${total % 60} Min.`;
  return `${Math.max(1, total)} Min.`;
}

/** Kleinschreibung ohne Akzente – für die Suche ("Néon" findet "neon"). */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function uid(prefix = 'id') {
  const rnd = crypto?.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 14);
  return `${prefix}-${rnd}`;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, ms) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const wait = ms - (now - last);
    clearTimeout(timer);
    if (wait <= 0) {
      last = now;
      fn(...args);
    } else {
      timer = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, wait);
    }
  };
}

/** Fisher-Yates */
export function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function absoluteUrl(path) {
  return new URL(path, document.baseURI).href;
}

export function pluralize(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
