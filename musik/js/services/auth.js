/**
 * Benutzerverwaltung.
 *
 * Aktuell lokal auf dem Gerät: Konten liegen in IndexedDB, Passwörter werden nur als
 * PBKDF2-Hash (SHA-256, zufälliges Salz) gespeichert. Die Schnittstelle (register/login/logout)
 * ist bewusst klein gehalten, damit später ein Server-Backend (Token, Sync) dahinter passt.
 */
import { bus } from '../core/events.js';
import { storage } from '../core/storage.js';
import { setUserId, userData } from '../core/userdata.js';
import { uid } from '../core/util.js';

const USERS_KEY = 'auth:users';
const SESSION_KEY = 'auth:session';
const ITERATIONS = 150_000;
export const GUEST = Object.freeze({ id: 'guest', username: 'Gast', email: null, guest: true });

export class AuthError extends Error {}

let current = null;

const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

async function hashPassword(password, salt, iterations) {
  if (!crypto?.subtle) throw new AuthError('Für Konten ist eine sichere Verbindung (HTTPS) nötig.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64.dec(salt), iterations, hash: 'SHA-256' }, key, 256);
  return b64.enc(bits);
}

const loadUsers = () => storage.get(USERS_KEY, {});
const saveUsers = (u) => storage.set(USERS_KEY, u);
const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, guest: false, createdAt: u.createdAt });

function setSession(user) {
  current = user;
  setUserId(user?.id);
  if (user) storage.set(SESSION_KEY, { userId: user.id });
  else storage.remove(SESSION_KEY);
  bus.emit('session:change', { user });
}

export const auth = {
  init() {
    const session = storage.get(SESSION_KEY);
    if (session?.userId === GUEST.id) current = GUEST;
    else if (session) {
      const u = loadUsers()[session.userId];
      current = u ? publicUser(u) : null;
    }
    setUserId(current?.id);
  },

  get user() {
    return current;
  },

  hasGuestData() {
    const d = userData.dump('guest');
    return (d.favorites?.length || 0) + (d.playlists?.length || 0) > 0;
  },

  async register({ email, username, password, migrateGuest = false }) {
    email = String(email || '').trim().toLowerCase();
    username = String(username || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AuthError('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) throw new AuthError('Benutzername: 3–24 Zeichen (Buchstaben, Zahlen, _ . -).');
    if (String(password || '').length < 8) throw new AuthError('Das Passwort muss mindestens 8 Zeichen lang sein.');
    const users = loadUsers();
    const all = Object.values(users);
    if (all.some((u) => u.email === email)) throw new AuthError('Mit dieser E-Mail existiert bereits ein Konto.');
    if (all.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new AuthError('Dieser Benutzername ist bereits vergeben.');
    const salt = b64.enc(crypto.getRandomValues(new Uint8Array(16)));
    const user = {
      id: uid('usr'),
      email,
      username,
      salt,
      iterations: ITERATIONS,
      hash: await hashPassword(password, salt, ITERATIONS),
      createdAt: new Date().toISOString(),
    };
    users[user.id] = user;
    saveUsers(users);
    if (migrateGuest) {
      for (const [name, value] of Object.entries(userData.dump('guest'))) {
        if (['favorites', 'playlists', 'history', 'savedAlbums'].includes(name)) storage.set(`u:${user.id}:${name}`, value);
      }
    }
    setSession(publicUser(user));
    return current;
  },

  async login({ identifier, password }) {
    const id = String(identifier || '').trim().toLowerCase();
    if (!id || !password) throw new AuthError('Bitte E-Mail/Benutzername und Passwort eingeben.');
    const user = Object.values(loadUsers()).find((u) => u.email === id || u.username.toLowerCase() === id);
    const fail = new AuthError('E-Mail/Benutzername oder Passwort ist falsch.');
    if (!user) throw fail;
    if ((await hashPassword(password, user.salt, user.iterations)) !== user.hash) throw fail;
    setSession(publicUser(user));
    return current;
  },

  loginAsGuest() {
    setSession(GUEST);
  },

  logout() {
    setSession(null);
  },

  async updateUsername(username) {
    username = String(username || '').trim();
    if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(username)) throw new AuthError('Benutzername: 3–24 Zeichen (Buchstaben, Zahlen, _ . -).');
    const users = loadUsers();
    if (Object.values(users).some((u) => u.id !== current.id && u.username.toLowerCase() === username.toLowerCase())) {
      throw new AuthError('Dieser Benutzername ist bereits vergeben.');
    }
    users[current.id].username = username;
    saveUsers(users);
    current = publicUser(users[current.id]);
    bus.emit('session:change', { user: current, profileOnly: true });
  },

  /** Löscht das Konto samt aller Nutzerdaten (Gast: nur die Daten). */
  async deleteAccount(password) {
    const user = current;
    if (!user) return;
    if (!user.guest) {
      const users = loadUsers();
      const rec = users[user.id];
      if ((await hashPassword(password || '', rec.salt, rec.iterations)) !== rec.hash) throw new AuthError('Das Passwort ist falsch.');
      delete users[user.id];
      saveUsers(users);
    }
    userData.wipe(user.id);
    setSession(null);
  },
};
