/** Zentrale App-Konfiguration. */
export const APP = {
  name: 'ROUGE',
  version: '1.0.0',
  tagline: 'Musik in Rot & Schwarz',
  /** Künstlerindex der iTunes-Hörproben-Quelle (erzeugt mit tools/resolve_artists.py). */
  artistsUrl: 'data/artists.json',
  /** Hauptkünstler: werden beim Start geladen und auf der Startseite groß gezeigt. */
  preload: ['jul', 'bobby-vandamme'],
  artistOverrides: {
    jul: { name: 'JUL', tagline: 'Französischer Künstler' },
    'bobby-vandamme': { tagline: 'Deutscher Künstler' },
  },
  artistDescription: 'Hörproben (je 30 Sekunden) und Cover stammen aus der iTunes Search API von Apple und gehören den jeweiligen Rechteinhabern. Vollständige Songs gibt es bei Apple Music. Das Künstlerbild ist das Cover eines beliebten Titels.',
  catalogUrl: 'data/catalog.json',
  minSplashMs: 1500,
};
