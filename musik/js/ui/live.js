/**
 * Hält verteilte UI-Zustände synchron, ohne Seiten neu zu rendern:
 *  - Herz-Buttons (Favoriten) überall in der App,
 *  - "läuft gerade"-Markierung in Songlisten,
 *  - Play/Pause-Buttons.
 */
import { bus } from '../core/events.js';
import { favorites } from '../services/favorites.js';
import { player } from '../services/player.js';
import { toast } from './toast.js';

function syncHearts({ id, value, all } = {}) {
  const sel = id ? `[data-fav-id="${CSS.escape(id)}"]` : '[data-fav-id]';
  document.querySelectorAll(sel).forEach((btn) => {
    const fav = favorites.has(btn.dataset.favId);
    const changed = btn.classList.contains('is-fav') !== fav;
    btn.classList.toggle('is-fav', fav);
    btn.setAttribute('aria-pressed', String(fav));
    btn.setAttribute('aria-label', fav ? 'Aus Favoriten entfernen' : 'Favorisieren');
    if (changed && fav && !all) {
      btn.classList.remove('pop');
      void btn.offsetWidth; // Animation neu starten
      btn.classList.add('pop');
    }
  });
}

function syncPlaying() {
  const cur = player.current?.id;
  document.querySelectorAll('[data-track-id]').forEach((row) => row.classList.toggle('is-current', row.dataset.trackId === cur));
  document.body.classList.toggle('is-playing', player.state.playing);
  document.body.classList.toggle('has-track', !!cur);
  document.querySelectorAll('.play-btn[data-sync="player"]').forEach((b) => {
    b.classList.toggle('is-playing', player.state.playing);
    b.setAttribute('aria-label', player.state.playing ? 'Pause' : 'Wiedergabe');
  });
}

export function initLive() {
  bus.on('favorites:change', (e) => {
    syncHearts(e);
    if (e.id) toast(e.value ? 'Favorisiert' : 'Aus Favoriten entfernt', { iconName: e.value ? 'heart-fill' : 'heart' });
  });
  bus.on('player:track', syncPlaying);
  bus.on('player:state', syncPlaying);
}
