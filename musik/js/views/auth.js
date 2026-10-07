import { APP } from '../config.js';
import { h } from '../core/util.js';
import { auth, AuthError } from '../services/auth.js';
import { icon, logoMark } from '../ui/icons.js';

/** Anmelde-/Registrierungsbildschirm (Vollbild, vor der eigentlichen App). */
export function buildAuthScreen() {
  let mode = 'login';
  let busy = false;
  const error = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'form auth-form', novalidate: true });
  const tabs = h('div', { class: 'auth-tabs', role: 'tablist' });
  const root = h('div', { class: 'auth-screen' },
    h('div', { class: 'auth-brand' }, logoMark(64), h('h1', null, APP.name), h('p', null, APP.tagline)),
    tabs, form,
    h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => auth.loginAsGuest() }, 'Als Gast fortfahren'),
    h('p', { class: 'auth-note' }, 'Konten und Daten werden lokal auf diesem Gerät gespeichert.'));

  function field({ name, label, type = 'text', autocomplete, placeholder }) {
    const input = h('input', { class: 'input', name, type, autocomplete, placeholder: placeholder || '', autocapitalize: 'off', spellcheck: 'false' });
    if (type !== 'password') return { input, el: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input) };
    const eye = h('button', { class: 'icon-btn eye', type: 'button', 'aria-label': 'Passwort anzeigen' }, icon('eye', 22));
    eye.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.replaceChildren(icon(show ? 'eye-off' : 'eye', 22));
      eye.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
    });
    return { input, el: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('span', { class: 'input-wrap' }, input, eye)) };
  }

  function paint() {
    error.textContent = '';
    tabs.replaceChildren(
      ...[['login', 'Anmelden'], ['register', 'Registrieren']].map(([id, label]) =>
        h('button', { class: `auth-tab${mode === id ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(mode === id), onclick: () => { mode = id; paint(); } }, label)));
    const login = mode === 'login';
    const f = {
      identifier: field({ name: 'identifier', label: 'E-Mail oder Benutzername', autocomplete: 'username' }),
      email: field({ name: 'email', label: 'E-Mail', type: 'email', autocomplete: 'email' }),
      username: field({ name: 'username', label: 'Benutzername', autocomplete: 'username' }),
      password: field({ name: 'password', label: 'Passwort', type: 'password', autocomplete: login ? 'current-password' : 'new-password', placeholder: login ? '' : 'Mindestens 8 Zeichen' }),
    };
    const migrate = !login && auth.hasGuestData() ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'migrate', checked: true }), h('span', null, 'Favoriten & Playlists aus dem Gastmodus übernehmen')) : null;
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, login ? 'Anmelden' : 'Konto erstellen');
    form.replaceChildren(
      ...(login ? [f.identifier.el, f.password.el] : [f.email.el, f.username.el, f.password.el]),
      ...[migrate, error, submit].filter(Boolean));
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      submit.disabled = true;
      submit.classList.add('loading');
      error.textContent = '';
      try {
        if (login) await auth.login({ identifier: f.identifier.input.value, password: f.password.input.value });
        else await auth.register({ email: f.email.input.value, username: f.username.input.value, password: f.password.input.value, migrateGuest: !!migrate?.querySelector('input').checked });
      } catch (err) {
        error.textContent = err instanceof AuthError ? err.message : 'Das hat nicht geklappt. Bitte versuche es erneut.';
        if (!(err instanceof AuthError)) console.error(err);
      } finally {
        busy = false;
        submit.disabled = false;
        submit.classList.remove('loading');
      }
    };
  }
  paint();
  return root;
}
