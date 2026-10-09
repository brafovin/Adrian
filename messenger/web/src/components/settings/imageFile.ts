import { formatBytes } from '../../lib/format';

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const EXT_TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** MIME-Typ der Datei (notfalls aus der Endung). */
export function imageMime(file: File): string {
  return (file.type || EXT_TYPE[extOf(file.name)] || '').toLowerCase();
}

/** Prüft eine ausgewählte Bilddatei. Ergibt eine verständliche Fehlermeldung oder null. */
export function checkImageFile(file: File, maxMb: number): string | null {
  const type = imageMime(file);
  const ext = extOf(file.name);
  if (/hei[cf]/.test(type) || /^hei[cf]s?$/.test(ext)) {
    return 'HEIC/HEIF-Bilder (z. B. vom iPhone) werden nicht unterstützt. Bitte wähle ein JPEG- oder PNG-Bild – auf dem iPhone unter Einstellungen › Kamera › Formate › „Maximale Kompatibilität“.';
  }
  if (!OK_TYPES.has(type)) {
    return 'Dieses Dateiformat wird nicht unterstützt. Erlaubt sind JPEG, PNG, WebP, GIF und AVIF.';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `Das Bild ist zu groß (${formatBytes(file.size)}). Erlaubt sind höchstens ${maxMb} MB.`;
  }
  if (file.size === 0) return 'Die Datei ist leer.';
  return null;
}

/** Lädt ein Bild und wartet, bis es dekodiert ist. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden. Möglicherweise ist die Datei beschädigt.'));
    img.src = src;
  });
}
