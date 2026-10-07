/** Warteschlange als Sheet. */
import { bus } from '../core/events.js';
import { h, pluralize, setChildren } from '../core/util.js';
import { player } from '../services/player.js';
import { cover, emptyState, equalizer } from './components.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';

export function openQueue() {
  const list = h('div', { class: 'queue' });
  const clear = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => player.clearUpcoming() }, 'Leeren');
  const sub = h('div', { class: 'sheet-sub' });
  const head = h('div', { class: 'sheet-head sheet-head-row' }, h('div', null, h('div', { class: 'sheet-title' }, 'Warteschlange'), sub), clear);

  const row = (e, i, state) =>
    h('div', { class: `queue-row${state === 'current' ? ' is-current' : ''}` },
      h('button', { class: 'queue-main', type: 'button', onclick: () => player.jumpTo(i), 'aria-label': `${e.track.title} abspielen` },
        h('span', { class: 'song-cover' }, cover(e.track.cover), state === 'current' ? h('span', { class: 'eq-overlay show' }, equalizer()) : null),
        h('span', { class: 'song-text' }, h('span', { class: 'song-title' }, e.track.title), h('span', { class: 'song-sub' }, e.track.artistName))),
      state === 'current' ? null : h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${e.track.title} entfernen`, onclick: () => player.removeFromQueue(i) }, icon('close', 22)));

  const render = () => {
    const { queue, index } = player.state;
    if (!queue.length) {
      list.replaceChildren(emptyState({ iconName: 'queue', title: 'Die Warteschlange ist leer', text: 'Füge Songs über das Menü „⋯“ hinzu.' }));
      sub.textContent = '';
      clear.hidden = true;
      return;
    }
    const upcoming = queue.slice(index + 1);
    sub.textContent = player.state.context ? `Aus: ${player.state.context}` : '';
    clear.hidden = !upcoming.length;
    setChildren(list,
      h('h3', { class: 'queue-label' }, 'Läuft gerade'),
      row(queue[index], index, 'current'),
      h('h3', { class: 'queue-label' }, upcoming.length ? `Als Nächstes · ${pluralize(upcoming.length, 'Song', 'Songs')}` : 'Als Nächstes'),
      upcoming.length ? upcoming.map((e, k) => row(e, index + 1 + k)) : h('p', { class: 'menu-hint' }, 'Danach folgen automatisch ähnliche Songs, wenn Autoplay aktiv ist.'),
    );
  };

  let unsub = [];
  const sheet = openSheet({ head, className: 'sheet-tall', content: list, onClose: () => unsub.forEach((fn) => fn()) });
  unsub = [bus.on('player:queue', render), bus.on('player:track', render)];
  render();
  return sheet;
}
