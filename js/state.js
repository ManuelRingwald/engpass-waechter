// Shared state of the app (#56): one object for everything that several modules write, plus storage keys, the
// helpers that the classic scripts put on window (strength, classification, opening hours) and the notices.

// Shared state that several modules write.
export const state = {
    // Rules from stamm/regeln.json
    rules: null,
    // Substance list (stamm/wirkstoffe.json)
    substanceList: [],
    // Trade names (own compilation) → substance
    tradeNames: [],
    // Daily data: current reports (daten/aktuell.json)
    daily: null,
    // History of the reports (daten/verlauf.json)
    history: null,
    // Search index over substances and trade names
    searchIndex: [],
    // Substance whose detail page is open
    selected: null,
    // Strength taken over from the search input
    strengthHint: null,
    // Pattern of salt and hydrate forms (regeln.json → abgleich.kurzname)
    saltPattern: /^$/,
    // Current view
    view: 'meine',
    // PZN whose detail page is open
    pznNumber: null,
    // The general explanation was opened in this session
    generalOpen: false,
    // Progress of the guided choice
    guide: null,
    // PZN entry being added
    newPzn: null,
    // State of the pharmacy view
    pharmacyView: null,
    // Feedback to show once after the next drawing
    feedback: null,
    // Test data of this device (#79): { hinweis, quellen, anzahl, produkte, sorted } or null.
    testData: null,
    // Position for this session only, never stored or sent
    pharmacyPosition: null,
    // Place or postcode entered for pharmacies
    pharmacyPlace: null,
    // Version found at the last check
    lastVersion: null,
    // The page reloads after „Jetzt laden“
    reloading: false,
};

export const STORAGE_KEYS = {
    meine: 'ew.meine',
    land: 'ew.land',
    gesehen: 'ew.gesehen',
    erklaert: 'ew.erklaert',
    thema: 'ew.thema',
    neu: 'ew.neuGesehen',
    apoOrt: 'ew.apoOrt',
    karte: 'ew.karte',
};
// Was the app already used on this device? (Determined before the first drawing; for „Neu in dieser Version“.)
export const usedBefore = ['ew.meine', 'ew.erklaert', 'ew.gesehen'].some((k) => {
    try {
        return localStorage.getItem(k) !== null;
    } catch {
        return false;
    }
});
export const TIMEOUT_MS = 15000;
// Reading and comparing strengths (staerke.js)
export const STRENGTH = window.EWStaerke;
// Classifying a report against „my medicine“ (einordnung.js)
export const CLASSIFY = window.EWEinordnung;
// Opening hours from OpenStreetMap (oeffnungszeiten.js)
export const OPENING_HOURS = window.EWOeffnungszeiten;
export const notices = { offline: null, ausfall: new Map() };
