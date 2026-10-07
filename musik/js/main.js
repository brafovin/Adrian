/**
 * Einstiegspunkt: startet Speicher, Katalog, Benutzerverwaltung, Router und UI.
 *
 * Module (jeweils getrennt):
 *   core/      Speicher, Router, Overlays, Events, Hilfsfunktionen
 *   data/      Katalog (austauschbarer Anbieter)
 *   services/  Auth, Player, Favoriten, Playlists, Bibliothek, Einstellungen, MediaSession
 *   ui/        Komponenten, Sheets, Mini-/Vollbild-Player, Tab-Leiste
 *   views/     Seiten (Start, Künstler, Album, Playlist, Suche, Favoriten, Bibliothek, Einstellungen, Anmeldung)
 */
import { APP } from './config.js';
import { bus } from './core/events.js';
import { setRouter } from './core/nav.js';
import { closeAll, closeTop, hasOverlay } from './core/overlays.js';
import { createRouter } from './core/router.js';
import { initStorage } from './core/storage.js';
import { catalog } from './data/catalog.js';
import { ItunesCatalogProvider } from './data/itunes-provider.js';
import { StaticCatalogProvider } from './data/provider.js';
import { auth } from './services/auth.js';
import { favorites } from './services/favorites.js';
import { library } from './services/library.js';
import { initMediaSession } from './services/mediasession.js';
import { player } from './services/player.js';
import { playlists } from './services/playlists.js';
import { settings } from './services/settings.js';
import { initLive } from './ui/live.js';
import { initMiniPlayer } from './ui/miniplayer.js';
import { initTabbar } from './ui/tabbar.js';
import { albumView } from './views/album.js';
import { artistView } from './views/artist.js';
import { buildAuthScreen } from './views/auth.js';
import { favoritesView } from './views/favorites.js';
import { homeView } from './views/home.js';
import { libraryView } from './views/library.js';
import { playlistView } from './views/playlist.js';
import { searchView } from './views/search.js';
import { settingsView } from './views/settings.js';

const $ = (id) => document.getElementById(id);

const ROUTES = [
  { name: 'home', path: '/home', view: homeView, tab: 'home', depth: 'root' },
  { name: 'search', path: '/search', view: searchView, tab: 'search', depth: 'root' },
  { name: 'favorites', path: '/favorites', view: favoritesView, tab: 'favorites', depth: 'root' },
  { name: 'library', path: '/library', view: libraryView, tab: 'library', depth: 'root' },
  { name: 'artist', path: '/artist/:id', view: artistView, tab: null, depth: 'detail' },
  { name: 'album', path: '/album/:id', view: albumView, tab: null, depth: 'detail' },
  { name: 'playlist', path: '/playlist/:id', view: playlistView, tab: null, depth: 'detail' },
  { name: 'settings', path: '/settings', view: settingsView, tab: null, depth: 'detail' },
];

let router;
let started = false;

function showSplashError(message) {
  const box = $('splash-error');
  box.hidden = false;
  box.replaceChildren(
    Object.assign(document.createElement('p'), { textContent: message }),
    Object.assign(document.createElement('button'), { className: 'btn btn-primary btn-sm', textContent: 'Erneut versuchen', onclick: () => location.reload() }),
  );
  document.querySelector('.splash-bar').hidden = true;
}

async function enterApp() {
  await closeAll();
  settings.load();
  favorites.load();
  playlists.load();
  library.load();
  await player.restore();
  const layer = $('auth');
  layer.hidden = true;
  layer.replaceChildren();
  history.replaceState(null, '', '#/home');
  router.start();
  started = true;
}

async function leaveApp() {
  await closeAll();
  player.reset();
  $('view').replaceChildren();
  showAuth();
}

function showAuth() {
  const layer = $('auth');
  layer.replaceChildren(buildAuthScreen());
  layer.scrollTop = 0;
  layer.hidden = false;
}

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hasOverlay()) return closeTop();
    const tag = e.target.tagName;
    if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON|A|SELECT/.test(tag) && e.target.getAttribute('role') !== 'slider' && auth.user && !hasOverlay()) {
      e.preventDefault();
      player.toggle();
    }
  });
}

/** Bevorzugt die iTunes-Hörproben; ohne Verbindung fällt die App auf den lokalen Demo-Katalog zurück. */
async function initCatalog() {
  try {
    await catalog.init(new ItunesCatalogProvider({ artists: APP.artists }));
  } catch (err) {
    console.warn('[catalog] iTunes nicht erreichbar, nutze Demo-Katalog', err);
    await catalog.init(new StaticCatalogProvider(APP.catalogUrl));
  }
}

async function boot() {
  const started0 = performance.now();
  try {
    await initStorage();
    auth.init();
    await initCatalog();
  } catch (err) {
    console.error('[boot]', err);
    showSplashError('Die App konnte nicht gestartet werden. Bitte prüfe deine Verbindung.');
    return;
  }

  const view = $('view');
  router = createRouter({ routes: ROUTES, outlet: view, scroller: view });
  setRouter(router);
  initLive();
  initMediaSession();
  initMiniPlayer($('mini-host'));
  initTabbar($('tab-host'), view);
  initKeyboard();

  bus.on('session:change', ({ user, profileOnly }) => {
    if (profileOnly) return;
    user ? enterApp() : leaveApp();
  });

  if (auth.user) await enterApp();
  else showAuth();

  const wait = APP.minSplashMs - (performance.now() - started0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const splash = $('splash');
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 700);
  window.__rougeBooted = true;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw]', err));
  }
}

window.__rougeBooted = false;
boot();
