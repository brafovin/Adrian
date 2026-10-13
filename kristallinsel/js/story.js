// Geschichte, Aufgaben und Dialoge. Reines JS – abhängig nur vom Spielstand.
export const GOALS = { glider: 5, map: 20, all: 40 };

/** Aktuelles Ziel als kurzer Text für die Anzeige. */
export function objective(s) {
  const n = s.crystals.size;
  if (s.flags.finale) return 'Die Insel leuchtet wieder! Erkunde sie, so lange du willst.';
  if (!s.flags.intro) return 'Sprich mit Mira am Brunnen von Lindenhain.';
  if (n >= GOALS.all) return 'Entzünde das Leuchtfeuer am Leuchtturm Westkap (Westen).';
  if (!s.flags.glider) return n >= GOALS.glider ? 'Bring Mira deine 5 Kristalle – sie hat etwas für dich.' : `Sammle Kristalle für Mira (${n}/${GOALS.glider}). Folge den Lichtsäulen!`;
  if (!s.flags.map) return n >= GOALS.map ? 'Zeig Mira deine 20 Kristalle.' : `Sammle weitere Kristalle (${n}/${GOALS.map}). Gleite von hohen Orten!`;
  return `Finde die restlichen Kristalle (${n}/${GOALS.all}) – sie stehen jetzt auf deiner Karte.`;
}

const HINTS = {
  jonas: [
    'Moin! Hier am Steg beißen die Fische am besten.',
    'Weit draußen im Osten liegt der Möwenfels. Da glitzert manchmal was – man müsste hinschwimmen.',
    'Im Nordwesten liegt ein altes Schiffswrack am Strand. Unheimlich, aber spannend!',
    'Ganz vorne am Steg hab ich auch etwas Glitzerndes gesehen. Schau mal nach!',
  ],
  lotta: [
    'Hallo! Ich bin Lotta. Mein Papa mahlt in der Mühle Mehl.',
    'Hinter der Mühle hab ich was Leuchtendes gesehen!',
    'In den Sonnenruinen im Osten stehen hohe Säulen. Wer geschickt springt, kommt ganz nach oben.',
    'Die Vogelscheuche auf dem Feld passt auf irgendwas auf …',
  ],
  bruno: [
    'Guten Tag! Pass auf, dass du meine Schafe nicht erschreckst.',
    'Oben auf der Wolkenspitze steht ein alter Schrein. Folg einfach dem Bergpfad ab der Kreuzung.',
    'Im Südwesten gibt es einen Steinkreis. Die Alten sagen, er sei älter als das Dorf.',
    'Nachts sieht man die Lichtsäulen der Kristalle besonders gut.',
  ],
  ronja: [
    'Hallo, Reisende! Setz dich ans Feuer, wenn du müde bist – dann vergeht die Zeit wie im Flug.',
    'Vom Turm der Waldwacht aus kann man weit gleiten. Probier’s mal!',
    'Mitten im Spiegelsee liegt eine kleine Insel. Schnelles Kraulen kostet Ausdauer, langsam geht’s immer.',
    'Am Leuchtturm im Westen fällt die Klippe steil ins Meer. Ein toller Ausblick – und vielleicht mehr.',
  ],
};

/**
 * Dialog mit einer Figur. Liefert { lines: [...], effects: [...] }.
 * effects: 'intro', 'glider', 'map' (setzen Flags).
 */
export function talk(id, s) {
  const n = s.crystals.size;
  if (id === 'mira') {
    if (!s.flags.intro) return {
      lines: [
        'Ah, ein neues Gesicht! Willkommen auf der Kristallinsel.',
        'Früher strahlte unser Leuchtturm jede Nacht über das Meer. Seine Kraft kam aus 40 Kristallen.',
        'Beim großen Sturm wurden sie über die ganze Insel verstreut.',
        'Hilfst du uns, sie zu finden? Achte auf die leuchtenden Lichtsäulen – darunter liegt ein Kristall.',
        `Einer liegt gleich hier am Brunnen. Bring mir ${GOALS.glider}, dann schenke ich dir etwas Besonderes!`,
      ],
      effects: ['intro'],
    };
    if (s.flags.finale) return { lines: ['Sieh nur, wie das Licht über das Meer streicht. Danke dir!', 'Die Insel gehört dir – erkunde sie, so lange du magst.'], effects: [] };
    if (n >= GOALS.all) return { lines: ['Alle 40 Kristalle! Unglaublich.', 'Geh zum Leuchtturm Westkap im Westen und entzünde das Leuchtfeuer!'], effects: [] };
    if (!s.flags.glider) {
      if (n >= GOALS.glider) return {
        lines: [
          `${n} Kristalle! Du bist wirklich fleißig.`,
          'Hier, nimm meinen alten Gleiter. Spring von einer Anhöhe und drück in der Luft noch einmal Springen.',
          'Gleiten kostet Ausdauer – behalte den grünen Ring im Blick.',
        ],
        effects: ['glider'],
      };
      return { lines: [`Du hast schon ${n} ${n === 1 ? 'Kristall' : 'Kristalle'}. Noch ${GOALS.glider - n}, dann gehört mein alter Gleiter dir!`, pickHint(s)], effects: [] };
    }
    if (!s.flags.map) {
      if (n >= GOALS.map) return {
        lines: [
          'Zwanzig! Ich habe beobachtet, wohin die Lichter in der Sturmnacht gefallen sind.',
          'Ich trage dir alle übrigen Kristalle in deine Karte ein. Öffne sie mit K.',
        ],
        effects: ['map'],
      };
      return { lines: [`${n} Kristalle – prima! Bring mir ${GOALS.map}, dann zeichne ich dir eine Karte der übrigen.`, pickHint(s)], effects: [] };
    }
    return { lines: [`Noch ${GOALS.all - n} Kristalle. Sie stehen alle auf deiner Karte – du schaffst das!`], effects: [] };
  }
  const list = HINTS[id] || ['…'];
  const k = (s.talkCount[id] = (s.talkCount[id] || 0) + 1);
  return { lines: [list[(k - 1) % list.length]], effects: [] };
}

function pickHint(s) {
  const tips = [
    'Tipp: Auf dem Turm der Waldwacht im Westen soll auch einer liegen.',
    'Tipp: Die Leute im Dorf und am Steg wissen so einiges. Frag sie ruhig!',
    'Tipp: Mit Umschalt rennst du – aber das kostet Ausdauer.',
    'Tipp: Am Lagerfeuer im Norden kannst du dich bis zum Morgen ausruhen.',
  ];
  return tips[s.crystals.size % tips.length];
}

export function newState() {
  return {
    crystals: new Set(),
    flags: { intro: false, glider: false, map: false, finale: false },
    discovered: new Set(),
    talkCount: {},
    time: 0.36,         // Tageszeit 0..1 (0.36 ≈ 8:40 Uhr)
    day: 1,
    play: 0,
    pos: null,
  };
}

export function clockText(time, day) {
  const mins = Math.floor(time * 24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `Tag ${day} · ${String(h).padStart(2, '0')}:${String(m - (m % 5)).padStart(2, '0')}`;
}
