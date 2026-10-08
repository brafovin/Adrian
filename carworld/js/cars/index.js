// Fahrzeug-Register: lädt das Modell zu einer ID.
export const CAR_IDS = ['cls63', 'rs7', 'i7', 'g63'];

export async function loadCar(id) {
  switch (id) {
    case 'cls63': return (await import('./cls63.js')).buildCLS();
    case 'rs7': return (await import('./rs7.js')).buildRS7();
    case 'i7': return (await import('./i7.js')).buildI7();
    case 'g63': return (await import('./g63.js')).buildG63();
    default: throw new Error('Unbekanntes Fahrzeug: ' + id);
  }
}
