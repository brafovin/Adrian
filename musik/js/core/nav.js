/** Dünne Fassade um den Router, damit Module ohne zirkuläre Importe navigieren können. */
import { closeAll, settled } from './overlays.js';

let router = null;
export const setRouter = (r) => (router = r);
export const navigate = (path) => settled().then(() => router.navigate(path));
export const goBack = () => router.back();
export const replaceUrl = (path) => router.silentReplace(path);

/** Schließt zuerst alle Overlays (Player, Sheets) und navigiert dann. */
export async function navigateFromOverlay(path) {
  await closeAll();
  navigate(path);
}
