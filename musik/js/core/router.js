/**
 * Hash-Router (#/home, #/artist/jul?x=1) mit Seitenübergängen und Scroll-Wiederherstellung.
 * Views sind async Funktionen: (ctx) => Node.
 */
import { bus } from './events.js';
import { h } from './util.js';

const scrollPositions = new Map();

export function createRouter({ routes, outlet, scroller }) {
  let current = null; // { hash, cleanups }
  let token = 0;
  let navigatedByApp = false;

  const compiled = routes.map((r) => ({
    ...r,
    keys: [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]),
    regex: new RegExp('^' + r.path.replace(/:\w+/g, '([^/]+)') + '/?$'),
  }));

  function parse() {
    const raw = location.hash.slice(1) || '/home';
    const [path, search = ''] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(search));
    for (const r of compiled) {
      const m = path.match(r.regex);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params, query, path, raw };
      }
    }
    return { route: compiled.find((r) => r.path === '/home'), params: {}, query, path: '/home', raw: '/home' };
  }

  async function render() {
    const my = ++token;
    const kind = navigatedByApp ? 'push' : 'pop';
    navigatedByApp = false;
    const { route, params, query, path, raw } = parse();

    if (current) {
      scrollPositions.set(current.raw, scroller.scrollTop);
      current.cleanups.forEach((fn) => fn());
    }
    const cleanups = [];
    current = { raw, cleanups };

    const page = h('div', { class: `page ${route.depth === 'detail' ? 'page-detail' : 'page-root'} enter-${kind}` });
    const ctx = {
      params,
      query,
      path,
      route,
      page,
      on: (event, fn) => cleanups.push(bus.on(event, fn)),
      onCleanup: (fn) => cleanups.push(fn),
      refresh: async () => {
        if (my !== token) return;
        const top = scroller.scrollTop;
        const next = await route.view(ctx);
        if (my !== token) return;
        page.replaceChildren(next);
        scroller.scrollTop = top;
      },
    };

    outlet.replaceChildren(page);
    const spinnerTimer = setTimeout(() => page.append(h('div', { class: 'page-spinner' }, h('span', { class: 'spinner' }))), 220);
    try {
      const content = await route.view(ctx);
      if (my !== token) return;
      clearTimeout(spinnerTimer);
      page.replaceChildren(content);
    } catch (err) {
      console.error('[router] View-Fehler', err);
      clearTimeout(spinnerTimer);
      if (my !== token) return;
      page.replaceChildren(
        h('div', { class: 'empty-state' },
          h('h2', null, 'Das hat nicht geklappt'),
          h('p', null, 'Die Seite konnte nicht geladen werden.'),
          h('button', { class: 'btn btn-primary', onclick: () => render() }, 'Erneut versuchen')),
      );
    }
    scroller.scrollTop = kind === 'pop' ? scrollPositions.get(raw) || 0 : 0;
    bus.emit('route:change', { name: route.name, tab: route.tab, path, params, query, depth: route.depth });
  }

  window.addEventListener('hashchange', render);
  // Klicks auf In-App-Links gelten als neue Navigation (kein Scroll-Restore).
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('a[href^="#/"]')) navigatedByApp = true;
  }, true);

  return {
    start: render,
    navigate(path) {
      const target = '#' + path;
      if (location.hash === target) return;
      navigatedByApp = true;
      location.hash = target;
    },
    /** Ändert die URL ohne Neuaufbau der Seite (z. B. Suchbegriff). */
    silentReplace(path) {
      history.replaceState(history.state, '', '#' + path);
      if (current) current.raw = path;
    },
    back() {
      // Gibt es keinen Verlauf (Direktaufruf), geht es zur Startseite.
      if (history.length > 1) history.back();
      else location.hash = '#/home';
    },
  };
}
