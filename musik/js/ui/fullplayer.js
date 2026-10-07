/** Großer Vollbild-Player. */
import { bus } from '../core/events.js';
import { navigateFromOverlay } from '../core/nav.js';
import { closeOverlay, openOverlay } from '../core/overlays.js';
import { formatTime, h } from '../core/util.js';
import { player } from '../services/player.js';
import { openTrackMenu } from './actions.js';
import { cover, heartButton, playButton, trackBadge } from './components.js';
import { icon } from './icons.js';
import { openQueue } from './queue.js';
import { createSlider } from './slider.js';

let overlay = null;

export const isPlayerOpen = () => !!overlay;

export function openFullPlayer() {
  if (overlay || !player.current) return;

  const unsub = [];
  const root = document.getElementById('overlays');

  // ---- Aufbau ----
  const bg = h('div', { class: 'player-bg', 'aria-hidden': 'true' });
  const coverSlot = h('div', { class: 'player-cover' });
  const titleEl = h('h2', { class: 'player-title' });
  const artistEl = h('a', { class: 'player-artist', href: '#/home' });
  const heartSlot = h('span', { class: 'player-heart' });
  const context = h('div', { class: 'player-context-name' });
  const elapsed = h('span', { class: 'time' }, '0:00');
  const remaining = h('span', { class: 'time' }, '-0:00');
  const badgeSlot = h('span', { class: 'badge-slot' });

  const progress = createSlider({
    label: 'Wiedergabeposition',
    className: 'slider-progress',
    step: 0.005,
    format: (v) => `${formatTime(v * player.state.duration)} von ${formatTime(player.state.duration)}`,
    onInput: (v) => paintTimes(v * player.state.duration),
    onChange: (v) => player.seek(v * player.state.duration),
  });
  const volume = createSlider({ label: 'Lautstärke', className: 'slider-volume', value: player.muted ? 0 : player.volume, onInput: (v) => player.setVolume(v) });

  const shuffleBtn = h('button', { class: 'icon-btn ctl ctl-shuffle', type: 'button', onclick: () => player.toggleShuffle() }, icon('shuffle', 26));
  const repeatBtn = h('button', { class: 'icon-btn ctl ctl-repeat', type: 'button', onclick: () => player.cycleRepeat() });
  const muteBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Stumm', onclick: () => player.toggleMute() });

  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Player schließen', onclick: () => closeOverlay(overlay) }, icon('chevron-down', 30));
  const moreBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Weitere Optionen', onclick: () => player.current && openTrackMenu(player.current, { context: player.state.context }) }, icon('more', 26));
  const top = h('header', { class: 'player-top' }, closeBtn, h('div', { class: 'player-context' }, h('span', null, 'Wiedergabe aus'), context), moreBtn);
  const stage = h('div', { class: 'player-stage' }, coverSlot);

  const volumeRow = player.volumeSupported
    ? h('div', { class: 'player-volume' }, muteBtn, volume.el)
    : h('div', { class: 'player-volume player-volume-na' }, h('span', null, 'Lautstärke über die Gerätetasten'));
  const el = h('section', { class: 'player', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Player' },
    bg, top, stage,
    h('div', { class: 'player-info' }, h('div', { class: 'player-titles' }, titleEl, h('div', { class: 'player-sub' }, badgeSlot, artistEl)), heartSlot),
    h('div', { class: 'player-progress' }, progress.el, h('div', { class: 'player-times' }, elapsed, remaining)),
    h('div', { class: 'player-controls' },
      shuffleBtn,
      h('button', { class: 'icon-btn ctl', type: 'button', 'aria-label': 'Zurück', onclick: () => player.prev() }, icon('prev', 36)),
      playButton({ cls: 'play-big', size: 38, onClick: () => player.toggle() }),
      h('button', { class: 'icon-btn ctl', type: 'button', 'aria-label': 'Weiter', onclick: () => player.next() }, icon('next', 36)),
      repeatBtn),
    h('div', { class: 'player-bottom' }, volumeRow, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Warteschlange', onclick: () => openQueue() }, icon('queue', 26))));

  // ---- Rendering ----
  function paintTimes(pos) {
    const dur = player.state.duration || 0;
    elapsed.textContent = formatTime(pos);
    remaining.textContent = `-${formatTime(Math.max(0, dur - pos))}`;
  }
  function paintTrack() {
    const t = player.current;
    if (!t) return closeOverlay(overlay);
    coverSlot.replaceChildren(cover(t.cover, { variant: 'large', cls: 'cover-hero' }));
    bg.style.backgroundImage = t.cover?.large ? `url("${t.cover.large}")` : '';
    titleEl.textContent = t.title;
    artistEl.textContent = t.artistName;
    artistEl.href = `#/artist/${t.artists?.[0]?.id || ''}`;
    badgeSlot.replaceChildren(...[trackBadge(t)].filter(Boolean));
    context.textContent = player.state.context || t.album?.title || 'Deine Musik';
    heartSlot.replaceChildren(heartButton(t.id, 'heart-lg'));
    coverSlot.classList.remove('swap');
    void coverSlot.offsetWidth;
    coverSlot.classList.add('swap');
    paintTimes(player.state.position);
  }
  function paintState() {
    el.classList.toggle('is-playing', player.state.playing);
    el.classList.toggle('is-loading', player.state.loading && player.state.playing);
  }
  function paintModes() {
    shuffleBtn.classList.toggle('on', player.shuffle);
    shuffleBtn.setAttribute('aria-label', player.shuffle ? 'Zufällige Wiedergabe: an' : 'Zufällige Wiedergabe: aus');
    shuffleBtn.setAttribute('aria-pressed', String(player.shuffle));
    const r = player.repeat;
    repeatBtn.replaceChildren(icon(r === 'one' ? 'repeat-one' : 'repeat', 26));
    repeatBtn.classList.toggle('on', r !== 'off');
    repeatBtn.setAttribute('aria-label', { off: 'Wiederholen: aus', all: 'Wiederholen: alle', one: 'Wiederholen: aktuellen Song' }[r]);
    const v = player.muted ? 0 : player.volume;
    muteBtn.replaceChildren(icon(v === 0 ? 'volume-mute' : v < 0.45 ? 'volume-low' : 'volume-high', 24));
    muteBtn.setAttribute('aria-label', player.muted ? 'Stumm aufheben' : 'Stumm');
    volume.set(v);
  }

  unsub.push(
    bus.on('player:track', paintTrack),
    bus.on('player:state', paintState),
    bus.on('player:modes', paintModes),
    bus.on('player:time', ({ position, duration }) => {
      if (progress.dragging) return;
      progress.set(duration ? position / duration : 0);
      paintTimes(position);
    }),
  );

  // Titel/Künstler-Link: erst Player schließen, dann navigieren
  artistEl.addEventListener('click', (e) => {
    e.preventDefault();
    navigateFromOverlay(new URL(artistEl.href).hash.slice(1));
  });

  // ---- Wischen nach unten zum Schließen ----
  let startY = 0;
  let dy = 0;
  let dragging = false;
  for (const zone of [top, stage]) {
    zone.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a')) return;
      dragging = true;
      startY = e.clientY;
      dy = 0;
      zone.setPointerCapture(e.pointerId);
      el.style.transition = 'none';
    });
    zone.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      el.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = '';
      el.style.transform = '';
      if (dy > 120) closeOverlay(overlay);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  root.append(el);
  paintTrack();
  paintState();
  paintModes();
  progress.set(player.state.duration ? player.state.position / player.state.duration : 0);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  document.body.classList.add('player-open');

  overlay = openOverlay(() => {
    unsub.forEach((fn) => fn());
    overlay = null;
    document.body.classList.remove('player-open');
    el.classList.remove('open');
    el.classList.add('closing');
    setTimeout(() => el.remove(), 380);
  });
}
