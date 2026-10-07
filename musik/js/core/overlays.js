/**
 * Overlay-Stapel (Player, Warteschlange, Sheets, Dialoge) mit Browser-Zurück-Unterstützung.
 *
 * Solange mindestens ein Overlay offen ist, existiert genau EIN zusätzlicher History-Eintrag.
 * Die Zurück-Taste (Android/Browser) schließt dann das oberste Overlay statt die Seite zu verlassen.
 */
const stack = [];
let hasEntry = false;
let expectedPops = 0;
let waiters = [];

const flushWaiters = () => {
  const w = waiters;
  waiters = [];
  w.forEach((fn) => fn());
};

function pushEntry() {
  history.pushState({ overlay: true }, '');
  hasEntry = true;
}

function releaseEntryLater() {
  // Erst nach dem aktuellen Tick prüfen – so können Overlays nahtlos ineinander übergehen.
  queueMicrotask(() => {
    if (!stack.length && hasEntry) {
      hasEntry = false;
      expectedPops++;
      history.back();
    }
  });
}

export function openOverlay(close) {
  const overlay = { close };
  stack.push(overlay);
  if (!hasEntry) pushEntry();
  return overlay;
}

export function closeOverlay(overlay) {
  const i = stack.indexOf(overlay);
  if (i < 0) return;
  stack.splice(i, 1);
  overlay.close();
  releaseEntryLater();
}

export const hasOverlay = () => stack.length > 0;

export function closeTop() {
  if (stack.length) closeOverlay(stack[stack.length - 1]);
}

/** Schließt alles und wartet, bis der History-Eintrag entfernt wurde (vor einer Navigation aufrufen). */
export function closeAll() {
  while (stack.length) stack.pop().close();
  if (!hasEntry) return Promise.resolve();
  hasEntry = false;
  expectedPops++;
  return new Promise((resolve) => {
    waiters.push(resolve);
    setTimeout(resolve, 500);
    history.back();
  });
}

/**
 * Wartet, bis der History-Eintrag eines gerade geschlossenen Overlays entfernt ist.
 * Muss vor jeder Navigation aufgerufen werden, die direkt nach dem Schließen passiert –
 * sonst würde das nachgelagerte history.back() die neue Seite wieder verlassen.
 */
export function settled() {
  const wait = () => new Promise((resolve) => {
    waiters.push(resolve);
    setTimeout(resolve, 500);
  });
  if (!stack.length && hasEntry) {
    hasEntry = false;
    expectedPops++;
    const p = wait();
    history.back();
    return p;
  }
  return expectedPops > 0 ? wait() : Promise.resolve();
}

window.addEventListener('popstate', () => {
  if (expectedPops > 0) {
    expectedPops--;
    flushWaiters();
    return;
  }
  if (!stack.length) return;
  hasEntry = false;
  stack.pop().close();
  if (stack.length) pushEntry();
});

// Nach einem Reload darf kein veralteter Overlay-Zustand im History-State stehen.
if (history.state?.overlay) history.replaceState(null, '');
