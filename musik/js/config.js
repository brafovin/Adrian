/** Zentrale App-Konfiguration. */
export const APP = {
  name: 'ROUGE',
  version: '1.0.0',
  tagline: 'Musik in Rot & Schwarz',
  /** Künstler der iTunes-Hörproben-Quelle (Apple-Künstler-IDs). */
  artists: [
    { id: 'jul', itunesId: 250647018, name: 'JUL', tagline: 'Französischer Künstler',
      description: 'Hörproben (je 30 Sekunden) und Cover stammen aus der iTunes Search API von Apple und gehören den jeweiligen Rechteinhabern. Vollständige Songs gibt es bei Apple Music. Das Künstlerbild ist das Cover des beliebtesten Titels.' },
    { id: 'bobby-vandamme', itunesId: 1526155005, name: 'Bobby Vandamme', tagline: 'Deutscher Künstler',
      description: 'Hörproben (je 30 Sekunden) und Cover stammen aus der iTunes Search API von Apple und gehören den jeweiligen Rechteinhabern. Vollständige Songs gibt es bei Apple Music. Das Künstlerbild ist das Cover des beliebtesten Titels.' },
  ],
  catalogUrl: 'data/catalog.json',
  minSplashMs: 1500,
};
