'use strict';
/* JWG.logistik – Stammdaten, Standardwerte und Beispieldaten (Seed). Alles fiktiv. */

const CITIES = [
  ['Frankfurt am Main', '60311', 50.11, 8.68], ['Hamburg', '20095', 53.55, 9.99], ['München', '80331', 48.14, 11.58], ['Berlin', '10115', 52.52, 13.40],
  ['Köln', '50667', 50.94, 6.96], ['Düsseldorf', '40213', 51.23, 6.78], ['Stuttgart', '70173', 48.78, 9.18], ['Leipzig', '04109', 51.34, 12.37],
  ['Dresden', '01067', 51.05, 13.74], ['Hannover', '30159', 52.37, 9.73], ['Nürnberg', '90402', 49.45, 11.08], ['Bremen', '28195', 53.08, 8.80],
  ['Dortmund', '44135', 51.51, 7.47], ['Essen', '45127', 51.46, 7.01], ['Kassel', '34117', 51.31, 9.48], ['Rostock', '18055', 54.09, 12.10],
  ['Erfurt', '99084', 50.98, 11.03], ['Mainz', '55116', 50.00, 8.27], ['Karlsruhe', '76133', 49.01, 8.40], ['Freiburg', '79098', 47.99, 7.85],
  ['Magdeburg', '39104', 52.12, 11.63], ['Kiel', '24103', 54.32, 10.14], ['Saarbrücken', '66111', 49.24, 6.99], ['Regensburg', '93047', 49.01, 12.10],
  ['Augsburg', '86150', 48.37, 10.90], ['Würzburg', '97070', 49.79, 9.95], ['Bielefeld', '33602', 52.02, 8.53], ['Münster', '48143', 51.96, 7.63],
  ['Offenbach am Main', '63065', 50.10, 8.77], ['Darmstadt', '64283', 49.87, 8.65], ['Wiesbaden', '65183', 50.08, 8.24], ['Lübeck', '23552', 53.87, 10.69],
].map(([name, zip, lat, lon]) => ({ name, zip, lat, lon }));
const CITY = Object.fromEntries(CITIES.map((c) => [c.name, c]));

/* Grobe Umrisslinie Deutschlands (Breite, Länge) für die schematische Karte */
const DE_OUTLINE = [[55.05, 8.40], [54.80, 8.70], [54.80, 9.45], [54.45, 10.20], [54.45, 11.10], [53.95, 10.85], [53.90, 11.45], [54.15, 12.10], [54.45, 12.50], [54.65, 13.40], [53.90, 14.25], [53.50, 14.20], [52.90, 14.40], [52.40, 14.60], [51.80, 14.70], [51.45, 14.80], [51.10, 14.95], [50.85, 14.70], [50.80, 14.30], [50.60, 13.90], [50.30, 12.50], [50.25, 12.10], [49.90, 12.30], [49.60, 12.50], [49.10, 13.20], [48.80, 13.80], [48.55, 13.45], [48.20, 13.00], [47.70, 13.00], [47.55, 12.20], [47.55, 10.50], [47.40, 10.20], [47.55, 9.60], [47.60, 9.00], [47.55, 7.60], [48.00, 7.55], [48.50, 7.80], [49.00, 8.20], [49.10, 7.00], [49.45, 6.40], [49.80, 6.40], [50.20, 6.10], [50.80, 6.00], [51.00, 5.90], [51.50, 6.10], [51.85, 6.00], [52.20, 7.00], [52.60, 7.20], [53.20, 7.20], [53.35, 7.20], [53.70, 7.00], [53.55, 8.10], [53.60, 8.55], [53.87, 8.70], [53.95, 8.90], [54.30, 8.85], [54.90, 8.65]];

const BRANCH_GEO = { b1: { lat: 50.1033, lon: 8.6395 }, b2: { lat: 53.5438, lon: 9.9897 }, b3: { lat: 48.1402, lon: 11.5446 } };
const BRANCHES = [
  { id: 'b1', name: 'Frankfurt', hq: true, street: 'Hafenallee 14', zip: '60327', city: 'Frankfurt am Main', phone: '+49 69 555 0100' },
  { id: 'b2', name: 'Hamburg', street: 'Speicherstraße 31', zip: '20457', city: 'Hamburg', phone: '+49 40 555 0200' },
  { id: 'b3', name: 'München', street: 'Rangierweg 8', zip: '80335', city: 'München', phone: '+49 89 555 0300' },
];

/* Produkte aus JWG.onlineshop (für Lager und Shop-Bestellungen): Gewicht in kg, Volumen in m³ je Stück */
const SHOP_PRODUCTS = {
  hoodie: { name: 'Hoodie Core', kg: 0.62, m3: 0.006, sku: 'HOOD' },
  pullover: { name: 'Pullover Crest', kg: 0.55, m3: 0.005, sku: 'PULL' },
  tshirt: { name: 'T-Shirt Classic', kg: 0.2, m3: 0.002, sku: 'TEE' },
  hose: { name: 'Chino Campus', kg: 0.6, m3: 0.004, sku: 'CHIN' },
  guertel: { name: 'Ledergürtel Campus', kg: 0.25, m3: 0.001, sku: 'GURT' },
  cap: { name: 'Cap Sixpanel', kg: 0.1, m3: 0.002, sku: 'CAP' },
  stoffbeutel: { name: 'Stoffbeutel', kg: 0.12, m3: 0.001, sku: 'TOTE' },
  schluesselband: { name: 'Schlüsselband Campus', kg: 0.03, m3: 0.0005, sku: 'BAND' },
};

const TONES = [['blue', 'Blau'], ['teal', 'Türkis'], ['green', 'Grün'], ['amber', 'Gelb'], ['red', 'Rot'], ['violet', 'Violett'], ['pink', 'Rosa'], ['gray', 'Grau']];

function defaultSettings() {
  return {
    company: { name: 'JWG Logistik GmbH (Demo)', legal: 'Amtsgericht Frankfurt am Main, HRB 000000 (fiktiv)', vatId: 'DE000000000', street: 'Hafenallee 14', zip: '60327', city: 'Frankfurt am Main', phone: '+49 69 555 0100', email: 'dispo@jwg-logistik.example', web: 'www.jwg-logistik.example', iban: 'DE00 0000 0000 0000 0000 00', bic: 'DEMODEFFXXX' },
    vat: 19, currency: 'EUR', lang: 'de', dateFormat: 'dd.mm.yyyy',
    transportTypes: [
      { id: 'paket', name: 'Paket (bis 31,5 kg)', base: 5.9, perKm: 0.05, perKg: 0.04, min: 5.9, maxKg: 31.5, co2: 0.35 },
      { id: 'kurier', name: 'Kurier / Eilfahrt', base: 25, perKm: 1.1, perKg: 0.0, min: 39, maxKg: 900, co2: 0.28 },
      { id: 'stueckgut', name: 'Stückgut', base: 35, perKm: 0.45, perKg: 0.035, min: 49, maxKg: 2500, co2: 0.11 },
      { id: 'palette', name: 'Palettenversand', base: 29, perKm: 0.38, perKg: 0.025, min: 45, maxKg: 1500, co2: 0.1 },
      { id: 'komplett', name: 'Komplettladung (FTL)', base: 120, perKm: 1.35, perKg: 0, min: 220, maxKg: 24000, co2: 0.06 },
    ],
    statuses: [
      { id: 'entwurf', name: 'Entwurf', tone: 'gray' }, { id: 'offen', name: 'Offen', tone: 'amber' }, { id: 'geplant', name: 'Geplant', tone: 'blue' },
      { id: 'abgeholt', name: 'Abgeholt / unterwegs', tone: 'violet' }, { id: 'in_zustellung', name: 'In Zustellung', tone: 'pink' }, { id: 'zugestellt', name: 'Zugestellt', tone: 'green' },
      { id: 'abgeschlossen', name: 'Abgeschlossen', tone: 'teal' }, { id: 'storniert', name: 'Storniert', tone: 'red' },
    ],
    priorities: [{ id: 'normal', name: 'Normal', tone: 'gray' }, { id: 'hoch', name: 'Hoch', tone: 'amber' }, { id: 'express', name: 'Express', tone: 'red' }],
    extras: [
      { id: 'hebebuehne', name: 'Hebebühne / Ladebordwand', fix: 18, needs: 'hebebuehne' }, { id: 'avis', name: 'Telefonische Avisierung', fix: 6 },
      { id: 'leergut', name: 'Leergut-/Palettentausch', fix: 12 }, { id: 'nachnahme', name: 'Nachnahme', fix: 9.5 },
      { id: 'versicherung', name: 'Transportversicherung (Warenwert-Zuschlag)', fix: 14 }, { id: 'abstell', name: 'Abstellgenehmigung', fix: 0 },
      { id: 'termin', name: 'Terminzustellung', fix: 15 },
    ],
    surcharges: { expressPct: 30, hochPct: 12, dieselPct: 6, tollPerKm: 0.16, tollTypes: ['stueckgut', 'palette', 'komplett'], waitPerHour: 42, freeWaitMin: 30, roadFactor: 1.22 },
    vehicleTypes: [
      { id: 'klein', name: 'Kleintransporter 1,5 t', payload: 700, volume: 6, req: ['B'], co2: 0.21, perKm: 0.34 },
      { id: 'trans', name: 'Transporter 3,5 t', payload: 1100, volume: 14, req: ['B'], co2: 0.26, perKm: 0.42 },
      { id: 'lkw75', name: 'LKW 7,5 t', payload: 3200, volume: 38, req: ['C1', 'C', 'CE'], co2: 0.38, perKm: 0.66 },
      { id: 'lkw18', name: 'LKW 18 t', payload: 10500, volume: 60, req: ['C', 'CE'], co2: 0.55, perKm: 0.92 },
      { id: 'zug', name: 'Sattelzug 24 t', payload: 24000, volume: 90, req: ['CE'], co2: 0.8, perKm: 1.18 },
    ],
    numbers: {
      order: { label: 'Aufträge', prefix: 'A-%Y-', next: 1, digits: 4 }, tour: { label: 'Touren', prefix: 'T-%Y-', next: 1, digits: 4 },
      quote: { label: 'Angebote', prefix: 'AN-%Y-', next: 1, digits: 4 }, invoice: { label: 'Rechnungen', prefix: 'R-%Y-', next: 1, digits: 4 },
      credit: { label: 'Gutschriften', prefix: 'G-%Y-', next: 1, digits: 4 }, customer: { label: 'Kunden', prefix: 'K-', next: 1001, digits: 4 },
      claim: { label: 'Reklamationen', prefix: 'RK-%Y-', next: 1, digits: 3 }, inbound: { label: 'Eingangsrechnungen', prefix: 'ER-%Y-', next: 1, digits: 4 },
    },
    templates: [
      { id: 'confirm', name: 'Auftragsbestätigung (E-Mail)', subject: 'Auftragsbestätigung {{auftrag}}', body: 'Guten Tag {{ansprechpartner}},\n\nvielen Dank für Ihren Auftrag {{auftrag}}. Abholung: {{abholung}}, Zustellung: {{zustellung}}.\nSendungsnummer: {{sendung}}\n\nFreundliche Grüße\n{{firma}}' },
      { id: 'status', name: 'Statusmeldung', subject: 'Ihre Sendung {{sendung}}: {{status}}', body: 'Guten Tag {{ansprechpartner}},\n\nIhre Sendung {{sendung}} hat jetzt den Status „{{status}}“.\nVerfolgen Sie sie hier: {{link}}\n\nFreundliche Grüße\n{{firma}}' },
      { id: 'delay', name: 'Verspätungsmeldung', subject: 'Verspätung bei Sendung {{sendung}}', body: 'Guten Tag {{ansprechpartner}},\n\nleider verzögert sich die Zustellung Ihrer Sendung {{sendung}} um ca. {{minuten}} Minuten. Neue voraussichtliche Ankunft: {{eta}}.\n\nWir bitten um Entschuldigung.\n{{firma}}' },
      { id: 'reminder', name: 'Erinnerung Abholung', subject: 'Erinnerung: Abholung {{auftrag}} morgen', body: 'Guten Tag {{ansprechpartner}},\n\nzur Erinnerung: Wir holen Auftrag {{auftrag}} am {{abholung}} ab. Bitte halten Sie die Ware bereit.\n\n{{firma}}' },
      { id: 'dunning', name: 'Zahlungserinnerung', subject: 'Zahlungserinnerung zu Rechnung {{rechnung}}', body: 'Guten Tag,\n\ndie Rechnung {{rechnung}} über {{betrag}} war am {{faellig}} fällig. Bitte überweisen Sie den Betrag in den nächsten Tagen.\n\n{{firma}}' },
      { id: 'delivnote', name: 'Lieferschein (Kopftext)', subject: 'Lieferschein {{auftrag}}', body: 'Wir bestätigen die Übergabe der folgenden Ware. Mängel bitte sofort auf diesem Lieferschein vermerken.' },
    ],
    automation: { statusMail: true, delayMail: true, reminder: true, pushDriver: true },
    security: { mfaRequired: false, sessionMin: 30, pwMin: 10, lockAfter: 5, ipRestrict: false, locConsentRequired: true, locRetentionDays: 30 },
    retention: [
      { type: 'Rechnung', years: 10 }, { type: 'Gutschrift', years: 10 }, { type: 'Angebot', years: 6 }, { type: 'Auftragsbestätigung', years: 6 }, { type: 'Lieferschein', years: 6 },
      { type: 'Frachtbrief', years: 6 }, { type: 'POD', years: 6 }, { type: 'Foto', years: 2 }, { type: 'Unterschrift', years: 6 }, { type: 'Sonstiges', years: 3 },
    ],
    integrations: {
      maps: { on: true, name: 'Karten und Navigation', desc: 'Schematische Karte im Browser. Navigation startet die Karten-App des Geräts per Link.', real: true },
      telematics: { on: true, name: 'GPS und Telematik', desc: 'Fahrzeugpositionen werden aus dem Tourverlauf berechnet (Simulation).', real: false },
      accounting: { on: false, name: 'Buchhaltung (DATEV-nah)', desc: 'CSV-Export der Rechnungen im Menü Abrechnung. Keine Live-Schnittstelle.', real: false },
      erp: { on: false, name: 'ERP / Warenwirtschaft', desc: 'Artikel und Bestände sind im Modul Lager vorhanden. Keine Verbindung zu einem ERP.', real: false },
      email: { on: true, name: 'E-Mail-Versand', desc: 'Nachrichten landen im Versandprotokoll (Kommunikation). Es werden keine E-Mails verschickt.', real: false },
      signature: { on: true, name: 'Digitale Unterschrift', desc: 'Unterschrift auf dem Touchscreen in der Fahrer-App. Keine qualifizierte Signatur.', real: true },
      portals: { on: true, name: 'Kunden- und Partnerportale', desc: 'Das Kundenportal läuft als Demo (Anmeldung per Auswahl). Antworten der Frachtführer werden per Schaltfläche simuliert.', real: false },
      shop: { on: true, name: 'JWG.onlineshop', desc: 'Bestellungen aus dem Shop werden als Aufträge übernommen, wenn Shop und App im selben Browser auf derselben Domain laufen.', real: true },
    },
    autoImportShop: true,
  };
}

/* ---------- Beispieldaten ---------- */
function seedDB() {
  const R = mulberry(20261009);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const rr = (a, b) => a + R() * (b - a);
  const DB = {
    v: 1, seedDay: today(), dirty: false, settings: defaultSettings(),
    customers: [], drivers: [], vehicles: [], partners: [], orders: [], tours: [], quotes: [], invoices: [], inInvoices: [], docs: [], threads: [], claims: [],
    wh: { locations: [], articles: [], moves: [], counts: [] }, users: [], roles: [], audit: [], seclog: [], tasks: [], outbox: [], notifs: [], appQueue: [], shopSeen: [],
  };
  const T0 = NOW();
  const D0 = today();
  const day = (n) => addDays(D0, n);
  const ts = (n, hm) => at(day(n), hm);

  /* Rollen und Benutzer */
  const mods = ['dashboard', 'auftraege', 'dispo', 'kunden', 'fahrer', 'fuhrpark', 'tracking', 'partner', 'angebote', 'dokumente', 'abrechnung', 'lager', 'komm', 'reklamation', 'reporting', 'benutzer', 'einstellungen', 'schnittstellen', 'sicherheit', 'roadmap'];
  const P = (r, w) => Object.fromEntries(mods.map((m) => [m, r.includes(m) || r === '*' ? (w.includes(m) || w === '*' ? 'w' : 'r') : (w.includes(m) ? 'w' : '')]));
  DB.roles = [
    { id: 'admin', name: 'Administrator', locked: true, perm: Object.fromEntries(mods.map((m) => [m, 'w'])) },
    { id: 'dispo', name: 'Disposition', perm: P(['dashboard', 'auftraege', 'dispo', 'kunden', 'fahrer', 'fuhrpark', 'tracking', 'partner', 'angebote', 'dokumente', 'abrechnung', 'lager', 'komm', 'reklamation', 'reporting', 'roadmap'], ['auftraege', 'dispo', 'fahrer', 'fuhrpark', 'tracking', 'partner', 'angebote', 'dokumente', 'komm', 'reklamation']) },
    { id: 'buch', name: 'Buchhaltung', perm: P(['dashboard', 'auftraege', 'kunden', 'tracking', 'partner', 'angebote', 'dokumente', 'abrechnung', 'reporting', 'roadmap'], ['dokumente', 'abrechnung', 'angebote']) },
    { id: 'service', name: 'Kundenservice', perm: P(['dashboard', 'auftraege', 'kunden', 'tracking', 'angebote', 'dokumente', 'komm', 'reklamation', 'roadmap'], ['auftraege', 'kunden', 'tracking', 'angebote', 'komm', 'reklamation']) },
    { id: 'lager', name: 'Lager', perm: P(['dashboard', 'auftraege', 'dokumente', 'lager', 'roadmap'], ['lager']) },
    { id: 'lesen', name: 'Nur Lesezugriff', perm: P(mods.filter((m) => !['benutzer', 'einstellungen', 'sicherheit'].includes(m)), []) },
  ];
  DB.users = [
    { id: 'u1', name: 'Maren Keller', email: 'maren.keller@jwg-logistik.example', role: 'admin', branches: ['b1', 'b2', 'b3'], active: true, mfa: true, last: T0 - 36e5 },
    { id: 'u2', name: 'Tobias Brandt', email: 'tobias.brandt@jwg-logistik.example', role: 'dispo', branches: ['b1'], active: true, mfa: true, last: T0 - 5 * 36e5 },
    { id: 'u3', name: 'Sina Yilmaz', email: 'sina.yilmaz@jwg-logistik.example', role: 'dispo', branches: ['b2'], active: true, mfa: false, last: T0 - 26 * 36e5 },
    { id: 'u4', name: 'Jonas Weber', email: 'jonas.weber@jwg-logistik.example', role: 'buch', branches: ['b1', 'b2', 'b3'], active: true, mfa: true, last: T0 - 30 * 36e5 },
    { id: 'u5', name: 'Lea Fischer', email: 'lea.fischer@jwg-logistik.example', role: 'service', branches: ['b1', 'b3'], active: true, mfa: false, last: T0 - 3 * 36e5 },
    { id: 'u6', name: 'Paul Novak', email: 'paul.novak@jwg-logistik.example', role: 'lager', branches: ['b1'], active: true, mfa: false, last: T0 - 52 * 36e5 },
    { id: 'u7', name: 'Gast Auswertung', email: 'gast@jwg-logistik.example', role: 'lesen', branches: ['b1', 'b2', 'b3'], active: false, mfa: false, last: T0 - 400 * 36e5 },
  ];

  /* Kunden */
  const C = (name, type, city, street, extra = {}) => {
    const c = CITY[city];
    const id = 'c' + (DB.customers.length + 1);
    const nr = 'K-' + (1001 + DB.customers.length);
    DB.customers.push({
      id, nr, name, type, street, zip: c.zip, city, billing: { name, street, zip: c.zip, city }, addresses: [{ id: 'ad1', label: 'Hauptadresse', name, street, zip: c.zip, city }],
      contacts: [{ name: extra.contact || 'Sekretariat', role: extra.role || 'Einkauf', email: extra.email || `info@${name.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 18)}.example`, phone: extra.phone || `+49 ${(c.zip.slice(0, 2))} 555 ${1000 + Math.floor(R() * 8999)}` }],
      discount: extra.discount || 0, priceList: extra.priceList || 'Standard', terms: extra.terms || 14, vatId: extra.vatId || '', notes: extra.notes || '', archived: !!extra.archived, created: T0 - Math.floor(rr(60, 700)) * 864e5, docs: [],
    });
    return id;
  };
  const cShop = C('JWG.onlineshop (Endkunden)', 'Onlineshop', 'Frankfurt am Main', 'Hafenallee 14', { contact: 'Shop-Team', role: 'Shop', email: 'shop@jwg-logistik.example', terms: 0, notes: 'Sammelkunde für Paketsendungen aus dem Onlineshop. Zahlung über den Shop.', priceList: 'Shop' });
  const cFoerder = C('Förderverein der Goethe-Schule e. V.', 'Verein', 'Frankfurt am Main', 'Goethestraße 22', { contact: 'Birgit Hahn', role: 'Vorsitzende', discount: 8, priceList: 'Schule' });
  const cBuch = C('Buchhandlung Lesezeit GmbH', 'Handel', 'Köln', 'Schildergasse 40', { contact: 'Frank Dietz', role: 'Inhaber', terms: 30, discount: 5, priceList: 'Partner' });
  const cTsv = C('TSV Rotweiß 1923 e. V.', 'Verein', 'Stuttgart', 'Sportparkweg 3', { contact: 'Mehmet Aksoy', role: 'Kassenwart', discount: 8, priceList: 'Schule' });
  const cNord = C('Schulbedarf Nord GmbH', 'Handel', 'Hamburg', 'Hammer Deich 90', { contact: 'Kirsten Lorenz', role: 'Einkauf', terms: 30, discount: 7, priceList: 'Partner', vatId: 'DE300000001' });
  const cDruck = C('Druckerei Federkiel KG', 'Lieferant', 'Leipzig', 'Gutenbergplatz 5', { contact: 'Ralf Ebert', role: 'Vertrieb', terms: 14, priceList: 'Standard' });
  const cEltern = C('Elternverein Gymnasium Süd', 'Verein', 'München', 'Schillerplatz 2', { contact: 'Anja Roth', role: 'Schriftführerin', discount: 8, priceList: 'Schule' });
  const cTextil = C('Textilhandel Maier & Söhne', 'Lieferant', 'Nürnberg', 'Webergasse 17', { contact: 'Josef Maier', role: 'Geschäftsführer', terms: 30, vatId: 'DE300000002' });
  const cAbi = C('Abiturjahrgang 2027', 'Verein', 'Kassel', 'Humboldtstraße 9', { contact: 'Lena Scholz', role: 'Jahrgangssprecherin', discount: 5, priceList: 'Schule' });
  const cCafe = C('Campus Café UG', 'Gastronomie', 'Berlin', 'Torstraße 101', { contact: 'Nico Wagner', role: 'Betreiber', terms: 14 });
  const cReise = C('Reisebüro Weitblick', 'Dienstleister', 'Dresden', 'Prager Straße 12', { contact: 'Heike Voss', role: 'Büroleitung', terms: 30, discount: 4 });
  C('Alte Schulbuchhandlung (ehemals)', 'Handel', 'Bielefeld', 'Marktgasse 4', { archived: true, contact: 'Karl Lenz', notes: 'Geschäftsaufgabe, nur noch zur Nachvollziehbarkeit.' });
  const cNames = Object.fromEntries(DB.customers.map((c) => [c.id, c.name]));
  DB.customers.find((c) => c.id === cFoerder).addresses.push({ id: 'ad2', label: 'Aula (Lieferung)', name: 'Förderverein – Aula', street: 'Goethestraße 22 (Hintereingang)', zip: '60313', city: 'Frankfurt am Main' });

  /* Fahrzeuge */
  const vt = Object.fromEntries(DB.settings.vehicleTypes.map((t) => [t.id, t]));
  const V = (plate, type, branch, o = {}) => {
    const t = vt[type];
    DB.vehicles.push({ id: 'v' + (DB.vehicles.length + 1), plate, type, make: o.make || 'Mercedes-Benz', model: o.model || '', branch, payload: t.payload, volume: t.volume, equipment: o.equipment || [], status: o.status || 'verfuegbar',
      tuev: day(o.tuev == null ? 120 : o.tuev), service: day(o.service == null ? 60 : o.service), insurance: day(o.ins == null ? 200 : o.ins), insurer: 'Südwest Flottenversicherung (fiktiv)', km: o.km || Math.floor(rr(30000, 180000)),
      costs: { fuel: o.fuel || Math.round(rr(900, 2600)), maint: o.maint || Math.round(rr(150, 900)), ins: o.insCost || 210 }, defects: o.defects || [], docs: ['Fahrzeugschein', 'Versicherungsnachweis'], note: o.note || '' });
  };
  V('F-JW 101', 'trans', 'b1', { model: 'Sprinter 316', tuev: 150 }); V('F-JW 102', 'trans', 'b1', { model: 'Sprinter 316', equipment: ['hebebuehne'], tuev: 22 });
  V('F-JW 103', 'klein', 'b1', { model: 'eVito', make: 'Mercedes-Benz', tuev: 300, service: 90 }); V('F-JW 201', 'lkw75', 'b1', { make: 'MAN', model: 'TGL 7.190', equipment: ['hebebuehne'], service: 12 });
  V('F-JW 301', 'lkw18', 'b1', { make: 'MAN', model: 'TGM 18.320', equipment: ['hebebuehne'], tuev: 70 }); V('F-JW 401', 'zug', 'b1', { make: 'Volvo', model: 'FH 460', tuev: 200, km: 241000 });
  V('HH-JW 101', 'trans', 'b2', { model: 'Sprinter 314' }); V('HH-JW 201', 'lkw75', 'b2', { make: 'MAN', model: 'TGL 8.190', equipment: ['hebebuehne'], status: 'gesperrt', defects: [{ id: 'd1', ts: T0 - 2 * 864e5, text: 'Bremsbelag vorn verschlissen, Werkstatttermin gebucht', by: 'Sina Yilmaz', open: true }], note: 'Bis zur Reparatur gesperrt.' });
  V('HH-JW 301', 'klein', 'b2', { model: 'Caddy Cargo', make: 'VW' }); V('M-JW 101', 'trans', 'b3', { model: 'Sprinter 316', status: 'werkstatt', note: 'Inspektion + Reifenwechsel' });
  V('M-JW 201', 'lkw75', 'b3', { make: 'MAN', model: 'TGL 7.190', equipment: ['hebebuehne'], tuev: -6 }); V('M-JW 301', 'trans', 'b3', { model: 'Sprinter 316' });
  DB.vehicles.find((v) => v.plate === 'M-JW 201').note = 'TÜV seit 6 Tagen überfällig – nicht einsetzen.';

  /* Fahrer */
  const Q = (type, name, exp) => ({ type, name, exp: exp == null ? null : day(exp) });
  const Dr = (name, branch, lic, o = {}) => {
    DB.drivers.push({ id: 'd' + (DB.drivers.length + 1), name, branch, phone: o.phone || `+49 151 555 ${1000 + Math.floor(R() * 8999)}`, email: `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.')}@jwg-logistik.example`.replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c])),
      licenses: lic, quals: o.quals || [Q('Fahrerkarte', 'Digitale Fahrerkarte', 400), Q('Ladungssicherung', 'Ladungssicherung (VDI 2700)', 500)], vehicleId: o.vehicle || null, status: o.status || 'verfuegbar', absences: o.abs || [], hours: o.hours || [8.2, 7.9, 8.5, 8.1, 7.5], pin: '1234', consent: o.consent !== false, note: o.note || '' });
  };
  Dr('Emre Kaya', 'b1', ['B', 'C1', 'C'], { vehicle: 'v1', quals: [Q('Fahrerkarte', 'Digitale Fahrerkarte', 380), Q('Ladungssicherung', 'Ladungssicherung (VDI 2700)', 120), Q('Gabelstapler', 'Staplerschein', 700)] });
  Dr('Julia Neumann', 'b1', ['B'], { vehicle: 'v2', hours: [8.9, 9.0, 8.4, 9.2, 8.8] }); Dr('Dennis Schulte', 'b1', ['B', 'C1', 'C', 'CE'], { vehicle: 'v5', quals: [Q('Fahrerkarte', 'Digitale Fahrerkarte', 15), Q('ADR', 'ADR-Schein (Gefahrgut)', 300), Q('Ladungssicherung', 'Ladungssicherung (VDI 2700)', 350)] });
  Dr('Katarina Horvat', 'b1', ['B', 'C1'], { vehicle: 'v4', quals: [Q('Fahrerkarte', 'Digitale Fahrerkarte', 600), Q('Ladungssicherung', 'Ladungssicherung (VDI 2700)', -10)] });
  Dr('Marek Wolny', 'b1', ['B', 'C1', 'C', 'CE'], { vehicle: 'v6', abs: [{ from: day(-1), to: day(3), kind: 'Urlaub' }], status: 'abwesend' }); Dr('Ayşe Demir', 'b1', ['B'], { vehicle: 'v3' });
  Dr('Lars Petersen', 'b2', ['B', 'C1', 'C'], { vehicle: 'v7' }); Dr('Ines Bauer', 'b2', ['B'], { vehicle: 'v9', abs: [{ from: day(0), to: day(1), kind: 'Krank' }], status: 'abwesend' }); Dr('Thorsten Möller', 'b2', ['B', 'C1', 'C'], { vehicle: 'v8' });
  Dr('Florian Gruber', 'b3', ['B', 'C1'], { vehicle: 'v12' }); Dr('Sabine Eder', 'b3', ['B', 'C1', 'C'], { vehicle: 'v11', consent: false, note: 'Standortfreigabe nicht erteilt (Betriebsvereinbarung offen).' });
  DB.drivers[0].pin = '1234';

  /* Frachtführer */
  const Pa = (name, city, o = {}) => DB.partners.push({ id: 'p' + (DB.partners.length + 1), name, city, contact: o.contact, phone: o.phone || `+49 ${CITY[city].zip.slice(0, 2)} 555 ${1000 + Math.floor(R() * 8999)}`, email: o.email || `dispo@${name.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 14)}.example`, fleet: o.fleet, capacity: o.capacity, perKm: o.perKm, min: o.min, rating: o.rating, onTime: o.onTime, docs: [{ name: 'Erlaubnis nach GüKG', exp: day(o.exp || 400) }, { name: 'Verkehrshaftpflicht', exp: day(o.exp2 || 220) }], active: true, areas: o.areas || '' });
  Pa('Nordwind Transport GmbH', 'Bremen', { contact: 'Henning Klaas', fleet: '8 × 7,5 t, 4 × Sattelzug', capacity: 'Palettenverkehr Nord, bis 24 t', perKm: 1.05, min: 190, rating: 4.6, onTime: 96, areas: 'Hamburg, Bremen, Hannover, Kiel' });
  Pa('Rhein-Main Kurier Express', 'Mainz', { contact: 'Selin Arslan', fleet: '14 × Transporter 3,5 t', capacity: 'Eilkurier, Same-Day', perKm: 0.92, min: 45, rating: 4.3, onTime: 93, areas: 'Rhein-Main, Rhein-Neckar' });
  Pa('Alpen Cargo Süd', 'Augsburg', { contact: 'Matthias Egger', fleet: '6 × 7,5 t, 3 × 18 t', capacity: 'Stückgut Süd, Hebebühne', perKm: 0.88, min: 120, rating: 4.1, onTime: 88, areas: 'Bayern, Baden-Württemberg', exp2: 25 });
  Pa('Ostfracht Dresden', 'Dresden', { contact: 'Uwe Richter', fleet: '5 × 7,5 t', capacity: 'Palettenverkehr Ost', perKm: 0.96, min: 140, rating: 3.9, onTime: 85, areas: 'Sachsen, Thüringen, Berlin' });
  Pa('Schnell & Sicher Paketdienst', 'Köln', { contact: 'Dilara Yildiz', fleet: '22 × Transporter, Paketshops', capacity: 'Pakete bis 31,5 kg, bundesweit', perKm: 0.35, min: 6.2, rating: 4.4, onTime: 95, areas: 'bundesweit' });

  /* Aufträge */
  const dep = { name: 'JWG Logistikzentrum Frankfurt', street: 'Hafenallee 14', zip: '60327', city: 'Frankfurt am Main', contact: 'Lagerleitung', phone: '+49 69 555 0100' };
  const geo = (a) => { const c = CITY[a.city]; const h = hash(a.street + a.city); return { lat: +(c.lat + ((h % 1000) / 1000 - 0.5) * 0.09).toFixed(4), lon: +(c.lon + (((h >> 10) % 1000) / 1000 - 0.5) * 0.12).toFixed(4) }; };
  const addr = (a, date, from, to) => { const b = BRANCHES.find((x) => x.street === a.street && x.city === a.city); return { ...a, ...(b ? BRANCH_GEO[b.id] : geo(a)), date, from, to }; };
  const people = ['Anna Becker', 'Markus Lang', 'Sophie Richter', 'Jan Hoffmann', 'Mira Schäfer', 'Paul Krüger', 'Lena Vogel', 'Tim Berger', 'Clara Winter', 'Ben Fuchs', 'Nora Albrecht', 'Leon Seidel', 'Emma Pohl', 'Felix Graf'];
  const streets = ['Lindenallee 4', 'Rosenweg 18', 'Bahnhofstraße 7', 'Gartenstraße 23', 'Schulstraße 11', 'Mühlenweg 2', 'Birkenstraße 31', 'Wiesengrund 6', 'Kastanienweg 9', 'Am Markt 5'];
  const shopCities = ['Berlin', 'Hamburg', 'München', 'Köln', 'Stuttgart', 'Leipzig', 'Dresden', 'Hannover', 'Düsseldorf', 'Nürnberg', 'Mainz', 'Wiesbaden', 'Darmstadt', 'Kassel', 'Erfurt', 'Bremen', 'Münster', 'Karlsruhe'];
  const claimsPending = [];
  const orderSpecs = [];
  const O = (s) => orderSpecs.push(s);
  const shopOrder = (dayOff, status, o = {}) => {
    const city = o.city || pick(shopCities); const person = o.person || pick(people);
    const prods = o.prods || [pick(Object.keys(SHOP_PRODUCTS)), pick(Object.keys(SHOP_PRODUCTS))];
    const kg = prods.reduce((s, k) => s + SHOP_PRODUCTS[k].kg, 0) + 0.3, m3 = Math.max(0.01, prods.reduce((s, k) => s + SHOP_PRODUCTS[k].m3, 0) + 0.006);
    O({ cust: cShop, type: 'paket', status, dayOff, prio: o.prio || 'normal', pickup: dep, delivery: { name: person, street: pick(streets), zip: CITY[city].zip, city, contact: person, phone: '' }, goods: { desc: prods.map((k) => SHOP_PRODUCTS[k].name).join(', '), weight: +kg.toFixed(1), volume: +m3.toFixed(3), pieces: 1, pallets: 0 }, extras: [], source: 'shop', ...o });
  };
  const PW = ['08:00', '12:00'], DW = ['09:00', '17:00'];
  /* Vergangene Aufträge (zugestellt/abgeschlossen) */
  for (let i = 0; i < 9; i++) shopOrder(-(3 + i * 2), i < 3 ? 'zugestellt' : 'abgeschlossen');
  O({ cust: cFoerder, type: 'palette', status: 'abgeschlossen', dayOff: -20, prio: 'normal', pickup: dep, delivery: { name: 'Goethe-Schule Aula', street: 'Goethestraße 22', zip: '60313', city: 'Frankfurt am Main', contact: 'Birgit Hahn', phone: '+49 69 555 4411' }, goods: { desc: 'Schulbekleidung für den Tag der offenen Tür', weight: 180, volume: 1.6, pieces: 6, pallets: 1 }, extras: ['avis'], source: 'manuell' });
  O({ cust: cBuch, type: 'palette', status: 'abgeschlossen', dayOff: -17, prio: 'normal', pickup: dep, delivery: { name: 'Buchhandlung Lesezeit', street: 'Schildergasse 40', zip: '50667', city: 'Köln', contact: 'Frank Dietz', phone: '+49 221 555 7710' }, goods: { desc: 'Wiederverkäufer-Lieferung Pullover/Hoodies', weight: 240, volume: 2.1, pieces: 8, pallets: 1 }, extras: ['hebebuehne', 'avis'], source: 'manuell' });
  O({ cust: cTsv, type: 'stueckgut', status: 'abgeschlossen', dayOff: -12, prio: 'normal', pickup: dep, delivery: { name: 'TSV Rotweiß Vereinsheim', street: 'Sportparkweg 3', zip: '70173', city: 'Stuttgart', contact: 'Mehmet Aksoy', phone: '+49 711 555 3322' }, goods: { desc: 'Trikots und Caps, 40 Teile', weight: 55, volume: 0.9, pieces: 4, pallets: 0 }, extras: [], source: 'manuell' });
  O({ cust: cShop, type: 'komplett', status: 'abgeschlossen', dayOff: -9, prio: 'normal', pickup: { name: 'Textilhandel Maier & Söhne', street: 'Webergasse 17', zip: '90402', city: 'Nürnberg', contact: 'Josef Maier', phone: '+49 911 555 2200' }, delivery: dep, goods: { desc: 'Bio-Baumwollstoffe und Rohlinge', weight: 5200, volume: 38, pieces: 22, pallets: 14 }, extras: ['hebebuehne'], source: 'manuell' });
  O({ cust: cShop, type: 'kurier', status: 'zugestellt', dayOff: -4, prio: 'express', pickup: { name: 'Druckerei Federkiel', street: 'Gutenbergplatz 5', zip: '04109', city: 'Leipzig', contact: 'Ralf Ebert', phone: '+49 341 555 9000' }, delivery: dep, goods: { desc: 'Etiketten und Hangtags', weight: 38, volume: 0.3, pieces: 3, pallets: 0 }, extras: ['avis'], source: 'manuell' });
  O({ cust: cNord, type: 'palette', status: 'zugestellt', dayOff: -3, prio: 'normal', pickup: dep, delivery: { name: 'Schulbedarf Nord GmbH', street: 'Hammer Deich 90', zip: '20095', city: 'Hamburg', contact: 'Kirsten Lorenz', phone: '+49 40 555 6611' }, goods: { desc: 'Schulbekleidung Sortiment', weight: 410, volume: 3.4, pieces: 14, pallets: 2 }, extras: ['hebebuehne'], source: 'manuell', carrier: { partnerId: 'p1', price: 238, status: 'geliefert' } });
  O({ cust: cShop, type: 'paket', status: 'storniert', dayOff: -6, prio: 'normal', pickup: dep, delivery: { name: 'Clara Winter', street: 'Birkenstraße 31', zip: CITY.Bremen.zip, city: 'Bremen', contact: 'Clara Winter', phone: '' }, goods: { desc: 'Hoodie Core', weight: 0.9, volume: 0.01, pieces: 1, pallets: 0 }, extras: [], source: 'shop', cancelReason: 'Bestellung vom Kunden widerrufen' });
  /* Heute: Tour 1 und Tour 2 laufen, Tour 3 ist für morgen geplant */
  shopOrder(0, 'zugestellt', { city: 'Mainz', person: 'Nora Albrecht', tour: 'T1' }); shopOrder(0, 'abgeholt', { city: 'Wiesbaden', person: 'Felix Graf', tour: 'T1' });
  shopOrder(0, 'abgeholt', { city: 'Darmstadt', person: 'Emma Pohl', tour: 'T1' }); shopOrder(0, 'abgeholt', { city: 'Offenbach am Main', person: 'Leon Seidel', tour: 'T1', prio: 'express' });
  O({ cust: cFoerder, type: 'palette', status: 'abgeholt', dayOff: 0, prio: 'hoch', pickup: dep, delivery: { name: 'Goethe-Schule Aula', street: 'Goethestraße 22 (Hintereingang)', zip: '60313', city: 'Frankfurt am Main', contact: 'Birgit Hahn', phone: '+49 69 555 4411' }, goods: { desc: 'Hoodies für den Schulchor, 60 Stück', weight: 150, volume: 1.4, pieces: 5, pallets: 1 }, extras: ['avis', 'termin'], source: 'manuell', tour: 'T1', late: true });
  O({ cust: cNord, type: 'stueckgut', status: 'abgeholt', dayOff: 0, prio: 'normal', pickup: { name: 'Schulbedarf Nord GmbH', street: 'Hammer Deich 90', zip: '20095', city: 'Hamburg', contact: 'Kirsten Lorenz', phone: '+49 40 555 6611' }, delivery: { name: 'JWG Hamburg Umschlag', street: 'Speicherstraße 31', zip: '20457', city: 'Hamburg', contact: 'Umschlag HH', phone: '+49 40 555 0200' }, goods: { desc: 'Retouren Schulbekleidung', weight: 320, volume: 2.2, pieces: 9, pallets: 0 }, extras: [], source: 'manuell', tour: 'T2' });
  O({ cust: cShop, type: 'paket', status: 'abgeholt', dayOff: 0, prio: 'normal', pickup: { ...dep, name: 'JWG Hamburg Umschlag', street: 'Speicherstraße 31', zip: '20457', city: 'Hamburg' }, delivery: { name: 'Mira Schäfer', street: 'Rosenweg 18', zip: CITY.Kiel.zip, city: 'Kiel', contact: 'Mira Schäfer', phone: '' }, goods: { desc: 'Pullover Crest, Cap Sixpanel', weight: 1.0, volume: 0.011, pieces: 1, pallets: 0 }, extras: [], source: 'shop', tour: 'T2' });
  O({ cust: cShop, type: 'paket', status: 'abgeholt', dayOff: 0, prio: 'normal', pickup: { ...dep, name: 'JWG Hamburg Umschlag', street: 'Speicherstraße 31', zip: '20457', city: 'Hamburg' }, delivery: { name: 'Ben Fuchs', street: 'Am Markt 5', zip: CITY['Lübeck'].zip, city: 'Lübeck', contact: 'Ben Fuchs', phone: '' }, goods: { desc: 'T-Shirt Classic, Stoffbeutel', weight: 0.6, volume: 0.007, pieces: 1, pallets: 0 }, extras: [], source: 'shop', tour: 'T2' });
  O({ cust: cEltern, type: 'palette', status: 'geplant', dayOff: 0, prio: 'normal', pickup: dep, delivery: { name: 'Gymnasium Süd', street: 'Schillerplatz 2', zip: '80335', city: 'München', contact: 'Anja Roth', phone: '+49 89 555 8800' }, goods: { desc: 'Schulbekleidung Erstausstattung', weight: 360, volume: 3, pieces: 12, pallets: 2 }, extras: ['hebebuehne', 'avis'], source: 'manuell', carrier: { partnerId: 'p3', price: 276, status: 'angenommen' } });
  O({ cust: cCafe, type: 'stueckgut', status: 'offen', dayOff: 0, prio: 'hoch', pickup: dep, delivery: { name: 'Campus Café', street: 'Torstraße 101', zip: '10115', city: 'Berlin', contact: 'Nico Wagner', phone: '+49 30 555 7788' }, goods: { desc: 'Merchandise für Verkaufstresen: Beutel, Bänder, Caps', weight: 48, volume: 0.7, pieces: 3, pallets: 0 }, extras: ['avis'], source: 'manuell', carrier: { partnerId: 'p4', price: 128, status: 'angefragt' }, problem: 'Frachtführer Ostfracht Dresden hat die Anfrage noch nicht bestätigt' });
  /* Morgen: Tour 3 geplant, Rest offen */
  shopOrder(1, 'geplant', { city: 'Frankfurt am Main', person: 'Tim Berger', tour: 'T3' }); shopOrder(1, 'geplant', { city: 'Offenbach am Main', person: 'Lena Vogel', tour: 'T3' }); shopOrder(1, 'geplant', { city: 'Darmstadt', person: 'Jan Hoffmann', tour: 'T3' });
  O({ cust: cAbi, type: 'stueckgut', status: 'offen', dayOff: 1, prio: 'normal', pickup: dep, delivery: { name: 'Abiturjahrgang 2027', street: 'Humboldtstraße 9', zip: CITY.Kassel.zip, city: 'Kassel', contact: 'Lena Scholz', phone: '+49 561 555 1212' }, goods: { desc: 'Abi-Hoodies, 85 Stück', weight: 62, volume: 0.9, pieces: 6, pallets: 0 }, extras: ['avis'], source: 'manuell' });
  shopOrder(0, 'offen', { city: 'Wiesbaden', person: 'Anna Becker', prio: 'express', rel: true });
  O({ cust: cBuch, type: 'palette', status: 'offen', dayOff: 0, prio: 'normal', pickup: dep, delivery: { name: 'Buchhandlung Lesezeit', street: 'Schildergasse 40', zip: '50667', city: 'Köln', contact: 'Frank Dietz', phone: '+49 221 555 7710' }, goods: { desc: 'Nachlieferung Hoodies und Caps', weight: 210, volume: 1.8, pieces: 7, pallets: 1 }, extras: ['hebebuehne', 'avis'], source: 'manuell', rel: true });
  shopOrder(1, 'offen', { city: 'Köln', person: 'Sophie Richter' }); shopOrder(1, 'offen', { city: 'Stuttgart', person: 'Markus Lang', prio: 'express' }); shopOrder(2, 'offen', { city: 'Leipzig', person: 'Paul Krüger' });
  O({ cust: cReise, type: 'palette', status: 'offen', dayOff: 3, prio: 'normal', pickup: dep, delivery: { name: 'Reisebüro Weitblick', street: 'Prager Straße 12', zip: '01067', city: 'Dresden', contact: 'Heike Voss', phone: '+49 351 555 4040' }, goods: { desc: 'Reisegruppen-Merchandise, Taschen und Bänder', weight: 130, volume: 1.2, pieces: 5, pallets: 1 }, extras: [], source: 'manuell' });
  O({ cust: cShop, type: 'komplett', status: 'offen', dayOff: 4, prio: 'normal', pickup: { name: 'Textilhandel Maier & Söhne', street: 'Webergasse 17', zip: '90402', city: 'Nürnberg', contact: 'Josef Maier', phone: '+49 911 555 2200' }, delivery: dep, goods: { desc: 'Nachschub Sweat-Stoffe Herbst', weight: 7800, volume: 52, pieces: 30, pallets: 20 }, extras: ['hebebuehne'], source: 'manuell' });
  O({ cust: cShop, type: 'kurier', status: 'offen', dayOff: 2, prio: 'express', pickup: { name: 'Druckerei Federkiel', street: 'Gutenbergplatz 5', zip: '04109', city: 'Leipzig', contact: 'Ralf Ebert', phone: '+49 341 555 9000' }, delivery: dep, goods: { desc: 'Neuer Katalog, Probedruck', weight: 22, volume: 0.15, pieces: 2, pallets: 0 }, extras: ['avis'], source: 'manuell' });
  O({ cust: cEltern, type: 'stueckgut', status: 'entwurf', dayOff: 6, prio: 'normal', pickup: dep, delivery: { name: 'Gymnasium Süd', street: 'Schillerplatz 2', zip: '80335', city: 'München', contact: 'Anja Roth', phone: '+49 89 555 8800' }, goods: { desc: 'Nachbestellung Caps', weight: 30, volume: 0.5, pieces: 3, pallets: 0 }, extras: [], source: 'portal' });

  /* Aufträge erzeugen */
  const tourOrders = {};
  const cNo = DB.settings.numbers;
  orderSpecs.forEach((s, i) => {
    const nr = fmtNo(cNo.order, i + 1);
    const baseDay = day(s.dayOff);
    const pu = addr(s.pickup, baseDay, PW[0], PW[1]);
    const de = addr(s.delivery, baseDay, DW[0], DW[1]);
    if (s.rel) { // Fenster relativ zur aktuellen Uhrzeit, damit der Auftrag heute noch disponierbar ist
      const lim = (ms) => hhmm(Math.min(ms, at(D0, '23:45')));
      const f = Math.ceil((T0 + 30 * 60000) / 9e5) * 9e5;
      pu.from = lim(f); pu.to = lim(f + 3 * 36e5); de.from = lim(f + 36e5); de.to = lim(f + 8 * 36e5);
      if (pu.from >= pu.to) { pu.from = '23:00'; pu.to = '23:45'; de.from = '23:00'; de.to = '23:45'; }
    }
    const o = {
      id: nr, nr, customerId: s.cust, ref: s.source === 'shop' ? 'SHOP-' + (20400 + i) : '', status: s.status, prio: s.prio || 'normal', type: s.type, branch: 'b1', pickup: pu, delivery: de,
      goods: s.goods, extras: s.extras || [], note: '', tourId: null, carrier: s.carrier ? { ...s.carrier } : null, price: 0, cost: 0, tracking: 'JWG-' + (hash(nr) % 9000000 + 1000000).toString(36).toUpperCase().slice(0, 6),
      locShare: true, created: ts(Math.min(s.dayOff, 0) - 1, '09:' + D2(10 + (i % 40))), createdBy: 'u' + (1 + (i % 3)), history: [], pod: null, flags: s.problem ? { problem: true, problemText: s.problem } : {}, rev: 1, source: s.source || 'manuell', invoiceId: null, tour: s.tour, lateFlag: s.late,
    };
    if (s.cancelReason) o.cancelReason = s.cancelReason;
    if (s.delivery.city === 'Hamburg' || s.delivery.city === 'Kiel' || s.delivery.city === 'Lübeck' || s.pickup.city === 'Hamburg') o.branch = 'b2';
    if (['München'].includes(s.delivery.city)) o.branch = 'b3';
    DB.orders.push(o);
    if (s.tour) (tourOrders[s.tour] ||= []).push(o);
  });
  DB.settings.numbers.order.next = orderSpecs.length + 1;

  /* Preise, Kosten */
  DB.orders.forEach((o) => {
    const pr = calcPrice(o, DB);
    o.price = pr.net;
    const km = roadKm(o.pickup, o.delivery, DB.settings);
    o.cost = o.carrier ? o.carrier.price : estCost(o.type, km, o.goods.weight);
    o.km = km;
  });

  /* Touren */
  const mkTour = (key, dayOff, branch, driverId, vehicleId, status, startTime) => {
    const orders = tourOrders[key] || [];
    const t = { id: fmtNo(cNo.tour, DB.tours.length + 1), date: day(dayOff), branch, driverId, vehicleId, status, startTime, startedAt: null, finishedAt: null, seq: [], done: {}, arrived: {}, note: '' };
    DB.settings.numbers.tour.next = DB.tours.length + 2;
    orders.forEach((o) => { o.tourId = t.id; });
    const ps = orders.filter((o) => o.pickup.street === dep.street || o.pickup.street === 'Speicherstraße 31').map((o) => o.id + ':P');
    const others = orders.filter((o) => !(o.pickup.street === dep.street || o.pickup.street === 'Speicherstraße 31')).map((o) => o.id + ':P');
    t.seq = [...ps, ...others, ...orders.map((o) => o.id + ':D')];
    DB.tours.push(t);
    return t;
  };
  const d = (n) => DB.drivers[n - 1].id, vh = (n) => DB.vehicles[n - 1].id;
  const t1 = mkTour('T1', 0, 'b1', d(1), vh(1), 'unterwegs', '07:30');
  const t2 = mkTour('T2', 0, 'b2', d(7), vh(7), 'unterwegs', '07:45');
  const roundQ = (ms) => Math.ceil(ms / 9e5) * 9e5;
  const t3 = mkTour('T3', 1, 'b1', d(2), vh(2), 'geplant', '07:30');
  /* Fortschritt der laufenden Touren so wählen, dass Zeiten zur aktuellen Uhrzeit passen */
  const settle = (t, doneCount, frac) => {
    const sch = scheduleTour(t, DB, { start: 0, relative: true });
    const prog = sch.stops.slice(0, doneCount);
    const partial = sch.stops[doneCount] ? (sch.stops[doneCount].legMin * frac) * 60000 : 0;
    const base = doneCount ? sch.stops[doneCount - 1].rel + sch.stops[doneCount - 1].service * 60000 : 0; // Zeitpunkt, zu dem der Fahrer den letzten erledigten Stopp verlässt
    t.startedAt = T0 - (base + partial);
    prog.forEach((s) => { t.arrived[s.key] = t.startedAt + s.rel; t.done[s.key] = t.startedAt + s.rel + s.service * 60000; });
  };
  settle(t1, 6, 0.45); settle(t2, 3, 0.4);
  t3.startTime = '07:30';

  /* Verspätungen: Zeitfenster relativ zur ETA setzen */
  [t1, t2].forEach((t) => {
    const sch = scheduleTour(t, DB, { relative: true });
    sch.stops.forEach((s) => {
      if (s.done) return;
      const o = DB.orders.find((x) => x.id === s.orderId);
      const addrs = s.kind === 'P' ? o.pickup : o.delivery;
      const eta = s.eta;
      const late = o.lateFlag && s.kind === 'D';
      addrs.date = t.date;
      addrs.from = hhmm(roundQ(eta) - 2 * 36e5);
      addrs.to = late ? hhmm(eta - 25 * 60000) : hhmm(roundQ(eta) + 2.5 * 36e5);
    });
  });

  /* Verlauf der Aufträge */
  DB.orders.forEach((o) => {
    const h = [];
    const push = (t, status, text, by = 'System') => h.push({ ts: t, status, text, by });
    const c0 = o.created;
    push(c0, 'offen', o.source === 'shop' ? 'Auftrag aus JWG.onlineshop übernommen' : o.source === 'portal' ? 'Auftrag im Kundenportal angefragt' : 'Auftrag angelegt', o.source === 'shop' ? 'Shop' : 'Disposition');
    const pu = at(o.pickup.date, o.pickup.from);
    const done = ['abgeholt', 'in_zustellung', 'zugestellt', 'abgeschlossen'].includes(o.status);
    if (['geplant', 'abgeholt', 'in_zustellung', 'zugestellt', 'abgeschlossen'].includes(o.status)) push(Math.min(c0 + 36e5, pu - 36e5), 'geplant', o.carrier ? `An Frachtführer vergeben: ${DB.partners.find((p) => p.id === o.carrier.partnerId).name}` : o.tourId ? `Tour ${o.tourId} zugeordnet` : 'Disponiert', 'Disposition');
    if (o.status === 'entwurf') h[0].status = 'entwurf';
    if (o.status === 'storniert') push(c0 + 5 * 36e5, 'storniert', o.cancelReason || 'Storniert', 'Disposition');
    if (done) {
      const t = DB.tours.find((x) => x.id === o.tourId);
      const pk = t && t.done[o.id + ':P'];
      push(pk || pu + 20 * 60000, 'abgeholt', `Abgeholt in ${o.pickup.city}`, o.carrier ? 'Frachtführer' : 'Fahrer');
    }
    if (o.status === 'zugestellt' || o.status === 'abgeschlossen') {
      const tr = DB.tours.find((x) => x.id === o.tourId);
      const dt = (tr && tr.done[o.id + ':D']) || at(o.delivery.date, hash(o.id) % 6 === 0 ? '17:' + D2(10 + (hash(o.id) % 40)) : '14:' + D2(10 + (hash(o.id) % 40)));
      push(dt - 30 * 60000, 'in_zustellung', `In Zustellung in ${o.delivery.city}`, 'Fahrer');
      push(dt, 'zugestellt', `Zugestellt, Empfang bestätigt durch ${o.delivery.contact || 'Empfänger'}`, 'Fahrer');
      o.pod = { name: o.delivery.contact || 'Empfänger', ts: dt, sig: null, photos: [], by: 'Fahrer', demo: true };
    }
    o.history = h.sort((a, b) => a.ts - b.ts);
  });

  /* Rechnungen aus zugestellten Aufträgen */
  const minISO = (a, b) => (a < b ? a : b);
  const bill = (custId, orderIdxs, paid, dun = 0) => {
    const orders = orderIdxs.map((i) => DB.orders[i]);
    const nr = fmtNo(cNo.invoice, DB.invoices.length + 1);
    DB.settings.numbers.invoice.next = DB.invoices.length + 2;
    const cust = DB.customers.find((c) => c.id === custId);
    const off = Math.min(0, Math.max(...orders.map((o) => diffDays(o.delivery.date, D0))) + 1);
    const date = day(off);
    const lines = orders.map((o) => ({ orderId: o.id, text: `${o.nr}: ${o.pickup.city} → ${o.delivery.city} (${o.goods.desc})`, net: o.price }));
    const net = +sum(lines, (l) => l.net).toFixed(2);
    const inv = { id: nr, nr, customerId: custId, date, due: addDays(date, cust.terms), lines, net, vat: +(net * 0.19).toFixed(2), gross: +(net * 1.19).toFixed(2), status: paid ? 'bezahlt' : 'offen', paidOn: paid ? minISO(addDays(date, Math.min(cust.terms, 9)), D0) : null, dunning: dun, kind: 'rechnung', created: ts(off, '10:00') };
    DB.invoices.push(inv);
    orders.forEach((o) => { o.invoiceId = nr; if (o.status === 'zugestellt') o.status = 'abgeschlossen'; o.history.push({ ts: ts(off, '10:00'), status: 'abgeschlossen', text: `Abgerechnet mit ${nr}`, by: 'Buchhaltung' }); });
    return inv;
  };
  const idOf = (i) => DB.orders[i].id;
  bill(cShop, [8, 7, 6, 5], true); bill(cShop, [4, 3], false); const overdue = bill(cFoerder, [9], false, 1); bill(cBuch, [10], true); bill(cTsv, [11], false); bill(cShop, [12], false);

  /* Eingangsrechnungen */
  const inv = (supplier, kind, text, dOff, gross, paid) => {
    const nr = fmtNo(cNo.inbound, DB.inInvoices.length + 1); DB.settings.numbers.inbound.next = DB.inInvoices.length + 2;
    DB.inInvoices.push({ id: nr, nr, supplier, kind, text, date: day(dOff), due: day(dOff + 14), gross, net: +(gross / 1.19).toFixed(2), vat: +(gross - gross / 1.19).toFixed(2), status: paid ? 'bezahlt' : 'offen', ext: 'RE-' + (8000 + Math.floor(R() * 999)) });
  };
  inv('Nordwind Transport GmbH', 'Frachtführer', 'Palettenverkehr Frankfurt → Hamburg (Auftrag ' + idOf(14) + ')', -2, 283.22, false);
  inv('Südwest Tankkarten (fiktiv)', 'Kraftstoff', 'Sammelrechnung Kraftstoff September', -9, 3412.8, true); inv('Autohaus Brenner Nutzfahrzeuge (fiktiv)', 'Werkstatt', 'Inspektion F-JW 201', -20, 689.5, true);
  inv('Alpen Cargo Süd', 'Frachtführer', 'Stückgut-Sonderfahrt München', -5, 331.5, false); inv('Flottenversicherung Südwest (fiktiv)', 'Versicherung', 'Quartalsbeitrag Flotte', -12, 2140, true); inv('Reifen Klose (fiktiv)', 'Werkstatt', 'Reifenwechsel M-JW 101', -1, 742.9, false);

  /* Angebote */
  const quote = (cust, from, to, type, w, vol, status, dOff, extras = [], prio = 'normal') => {
    const nr = fmtNo(cNo.quote, DB.quotes.length + 1); DB.settings.numbers.quote.next = DB.quotes.length + 2;
    const fakeOrder = { type, goods: { weight: w, volume: vol, pallets: type === 'palette' ? 1 : 0 }, prio, extras, customerId: cust, pickup: { ...geo({ city: from, street: 'x' }), city: from }, delivery: { ...geo({ city: to, street: 'y' }), city: to } };
    const pr = calcPrice(fakeOrder, DB);
    DB.quotes.push({ id: nr, nr, customerId: cust, from, to, type, weight: w, volume: vol, prio, extras, status, date: day(dOff), valid: day(dOff + 30), net: pr.net, lines: pr.lines, history: [{ ts: ts(dOff, '11:00'), text: 'Angebot erstellt', by: 'Tobias Brandt' }], orderId: null });
  };
  quote(cReise, 'Frankfurt am Main', 'Dresden', 'palette', 130, 1.2, 'versendet', -3); quote(cCafe, 'Frankfurt am Main', 'Berlin', 'stueckgut', 48, 0.7, 'angenommen', -9, ['avis']); quote(cTsv, 'Frankfurt am Main', 'Stuttgart', 'palette', 320, 2.6, 'entwurf', -1, ['hebebuehne']);
  quote(cNord, 'Frankfurt am Main', 'Hamburg', 'komplett', 6000, 40, 'abgelehnt', -22); quote(cBuch, 'Frankfurt am Main', 'Köln', 'palette', 240, 2.1, 'versendet', -40);
  DB.quotes[1].orderId = idOf(DB.orders.findIndex((o) => o.customerId === cCafe));
  DB.quotes[1].history.push({ ts: ts(-8, '15:30'), text: 'Vom Kunden angenommen, in Auftrag umgewandelt', by: 'Kundenportal' });

  /* Reklamationen */
  const claim = (orderIdx, type, text, status, cost, dOff, resp = 'Lea Fischer') => {
    const o = DB.orders[orderIdx]; const nr = fmtNo(cNo.claim, DB.claims.length + 1); DB.settings.numbers.claim.next = DB.claims.length + 2;
    DB.claims.push({ id: nr, nr, orderId: o.id, customerId: o.customerId, type, text, status, cost, resp, created: ts(dOff, '13:20'), photos: [], actions: status === 'neu' ? [] : [{ ts: ts(dOff, '15:00'), text: 'Sachverhalt aufgenommen, Fahrer befragt', by: resp, done: true }], log: [{ ts: ts(dOff, '13:20'), text: 'Reklamation angelegt', by: 'Kundenservice' }] });
  };
  claim(2, 'Schaden', 'Karton beim Empfänger eingedrückt, Hoodie verschmutzt.', 'massnahme', 59.0, -6); claim(10, 'Fehlmenge', 'Laut Lieferschein 8 Kartons, 7 angekommen.', 'pruefung', 120.0, -13, 'Tobias Brandt');
  claim(3, 'Verspätung', 'Zustellung einen Tag später als zugesagt.', 'geloest', 0, -9); claim(11, 'Falschlieferung', 'Falsche Größen geliefert (Trikots).', 'neu', 85.0, -1);

  /* Dokumente (hochgeladene) */
  DB.docs = [
    { id: 'u1', type: 'Sonstiges', name: 'Rahmenvertrag_Nordwind_2026.pdf', size: 184320, orderId: null, partnerId: 'p1', ts: T0 - 90 * 864e5, by: 'Maren Keller', role: ['admin', 'dispo', 'buch'] },
    { id: 'u2', type: 'Lieferschein', name: `Lieferschein_${idOf(4)}_Unterschrift.jpg`, size: 98304, orderId: idOf(4), ts: T0 - 3 * 864e5, by: 'Emre Kaya', role: ['admin', 'dispo', 'buch', 'service'] },
    { id: 'u3', type: 'Sonstiges', name: 'Versicherungsnachweis_Flotte_2026.pdf', size: 221184, orderId: null, ts: T0 - 200 * 864e5, by: 'Jonas Weber', role: ['admin', 'buch'] },
  ];

  /* Nachrichten */
  const msg = (from, text, hoursAgo, kind = 'intern') => ({ id: uid('m'), from, text, ts: T0 - hoursAgo * 36e5, kind });
  DB.threads = [
    { id: 'th1', kind: 'fahrer', title: 'Emre Kaya (F-JW 101)', refId: DB.drivers[0].id, orderId: null, unread: 1, msgs: [msg('Tobias Brandt', 'Guten Morgen Emre, bitte bei der Aula zuerst anrufen, der Hintereingang ist heute wegen Aufbau teilweise gesperrt.', 4), msg('Emre Kaya', 'Alles klar. Bin um 11 Uhr in Mainz, danach direkt zur Aula.', 3.5), msg('Emre Kaya', 'Stau auf der A66, ich rechne mit ca. 20 Min. Verzug.', 0.4, 'fahrer')] },
    { id: 'th2', kind: 'kunde', title: 'Förderverein – Auftrag ' + idOf(20), refId: cFoerder, orderId: DB.orders.find((o) => o.customerId === cFoerder && o.status === 'abgeholt').id, unread: 0, msgs: [msg('Birgit Hahn (Kunde)', 'Können wir die Lieferung bitte nicht vor 12 Uhr bekommen? Die Aula ist vormittags belegt.', 20, 'kunde'), msg('Lea Fischer', 'Notiert. Wir avisieren Sie 30 Minuten vorher.', 19)] },
    { id: 'th3', kind: 'partner', title: 'Alpen Cargo Süd – Palettenlieferung München', refId: 'p3', orderId: DB.orders.find((o) => o.carrier && o.carrier.partnerId === 'p3').id, unread: 1, msgs: [msg('Matthias Egger (Alpen Cargo)', 'Auftrag angenommen. Abholung morgen früh möglich?', 2, 'partner')] },
    { id: 'th4', kind: 'intern', title: 'Dispo Frankfurt – Tagesplanung', refId: null, orderId: null, unread: 0, msgs: [msg('Maren Keller', 'F-JW 102 hat nächste Woche TÜV, bitte Tour 3 trotzdem normal planen.', 26), msg('Tobias Brandt', 'Verstanden, Termin ist am Mittwoch gebucht.', 25)] },
  ];

  /* Lager */
  DB.wh.locations = [
    { id: 'l1', name: 'Hauptlager Frankfurt', branch: 'b1', slots: 24 }, { id: 'l2', name: 'Umschlaglager Hamburg', branch: 'b2', slots: 12 }, { id: 'l3', name: 'Depot München', branch: 'b3', slots: 14 },
  ];
  const art = (sku, name, stock, min = 40) => DB.wh.articles.push({ sku, name, stock, min, perCarton: 20, perPallet: 400 });
  art('HOOD-MAR-M', 'Hoodie Core · Marine · M', { l1: 142, l2: 30, l3: 24 }, 40); art('HOOD-ANT-L', 'Hoodie Core · Anthrazit · L', { l1: 118, l2: 24, l3: 18 }, 40);
  art('HOOD-MOH-S', 'Hoodie Core · Mohn · S', { l1: 36, l2: 0, l3: 8 }, 40); art('PULL-TAN-M', 'Pullover Crest · Tanne · M', { l1: 96, l2: 20, l3: 12 }, 30);
  art('TEE-MAR-M', 'T-Shirt Classic · Marine · M', { l1: 260, l2: 60, l3: 40 }, 80); art('TEE-SEN-L', 'T-Shirt Classic · Senf · L', { l1: 74, l2: 10, l3: 6 }, 60);
  art('CHIN-MAR-32', 'Chino Campus · Marine · W32', { l1: 64, l2: 12, l3: 10 }, 30); art('GURT-ANT-M', 'Ledergürtel · Anthrazit · M', { l1: 88, l2: 16, l3: 12 }, 30);
  art('CAP-MAR', 'Cap Sixpanel · Marine', { l1: 210, l2: 40, l3: 30 }, 60); art('TOTE-NAT', 'Stoffbeutel · Natur', { l1: 380, l2: 80, l3: 60 }, 100);
  art('BAND-COB', 'Schlüsselband Campus · Kobalt', { l1: 520, l2: 100, l3: 80 }, 150); art('BAND-SUN', 'Schlüsselband Campus · Sonne', { l1: 44, l2: 0, l3: 20 }, 150);
  const mv = (dOff, kind, sku, qty, loc, ref, to) => DB.wh.moves.push({ id: uid('mv'), ts: ts(dOff, '10:' + D2(10 + DB.wh.moves.length * 3)), kind, sku, qty, loc, to: to || null, ref: ref || '', by: 'Paul Novak' });
  mv(-9, 'Wareneingang', 'TEE-MAR-M', 300, 'l1', idOf(12)); mv(-9, 'Wareneingang', 'HOOD-MAR-M', 120, 'l1', idOf(12)); mv(-8, 'Einlagerung', 'CAP-MAR', 200, 'l1', ''); mv(-6, 'Umlagerung', 'HOOD-ANT-L', 24, 'l1', '', 'l2');
  mv(-5, 'Warenausgang', 'HOOD-MAR-M', 12, 'l1', idOf(0)); mv(-4, 'Warenausgang', 'BAND-COB', 60, 'l1', idOf(11)); mv(-3, 'Warenausgang', 'TOTE-NAT', 40, 'l1', idOf(10)); mv(-1, 'Warenausgang', 'HOOD-MOH-S', 24, 'l1', idOf(20));

  /* Aufgaben, Protokolle */
  DB.tasks = [
    { id: 'tk1', text: 'TÜV für F-JW 102 in 22 Tagen: Termin bestätigen', done: false, link: '#/fuhrpark', due: day(5) },
    { id: 'tk2', text: 'Mahnlauf prüfen: Rechnung ' + overdue.nr + ' überfällig', done: false, link: '#/abrechnung', due: day(0) },
    { id: 'tk3', text: 'Sicherheitsunterweisung Fahrer Q4 einplanen', done: false, link: '', due: day(14) },
    { id: 'tk4', text: 'Reklamation ' + DB.claims[3].nr + ' (Falschlieferung) zuweisen', done: true, link: '#/reklamation', due: day(-1) },
  ];
  const aud = (hAgo, user, entity, id, action, text) => DB.audit.push({ id: uid('au'), ts: T0 - hAgo * 36e5, user, entity, ref: id, action, text });
  aud(70, 'Tobias Brandt', 'Auftrag', idOf(30), 'bearbeitet', 'Zeitfenster Lieferung angepasst'); aud(52, 'Jonas Weber', 'Rechnung', DB.invoices[2].nr, 'erstellt', 'Rechnung angelegt'); aud(30, 'Maren Keller', 'Benutzer', 'u5', 'bearbeitet', 'Rolle von „Lesezugriff“ auf „Kundenservice“ geändert');
  aud(8, 'Sina Yilmaz', 'Fahrzeug', 'HH-JW 201', 'gesperrt', 'Bremsbelag vorn verschlissen'); aud(3, 'Lea Fischer', 'Reklamation', DB.claims[3].nr, 'erstellt', 'Falschlieferung angelegt');
  DB.seclog = [
    { id: uid('s'), ts: T0 - 36e5, user: 'Maren Keller', event: 'Anmeldung', detail: 'Erfolgreich (MFA)', ok: true, ip: '192.0.2.10' }, { id: uid('s'), ts: T0 - 5 * 36e5, user: 'Tobias Brandt', event: 'Anmeldung', detail: 'Erfolgreich (MFA)', ok: true, ip: '192.0.2.24' },
    { id: uid('s'), ts: T0 - 14 * 36e5, user: 'unbekannt', event: 'Anmeldung', detail: 'Fehlgeschlagen: falsches Passwort (3 Versuche)', ok: false, ip: '198.51.100.77' }, { id: uid('s'), ts: T0 - 30 * 36e5, user: 'Maren Keller', event: 'Rollen geändert', detail: 'Lea Fischer: Kundenservice', ok: true, ip: '192.0.2.10' },
  ];
  DB.notifs = [];
  return DB;
}
