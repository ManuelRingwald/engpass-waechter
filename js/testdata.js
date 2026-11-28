// Test data on the device (#79): a file „PZN → Produkt“ that the person loads themselves under „Mehr“ – only on this
// iPhone, only for testing. It names the product of a PZN (name, substance, strength, pack size, form); it never says
// anything about shortages, which come only from the reports of the BfArM. The file is checked strictly, kept in
// IndexedDB of this device and never sent anywhere; its content is only ever shown as text.

import { state } from './state.js';
import { pznValid } from './matching.js';

const DB_NAME = 'ew-testdaten';
const STORE = 'daten';
const KEY = 'aktuell';
// Limits of the file (#79): size, number of packs and length of every field.
export const LIMITS = {
    bytes: 10 * 1024 * 1024,
    packs: 200000,
    sources: 10,
    text: 500,
    fields: { n: 120, w: 200, s: 60, p: 40, f: 80, h: 120, q: 20 },
};
const REQUIRED = ['n'];
const FIELD_NAMES = Object.keys(LIMITS.fields);

// True when a text has control characters or characters that turn the reading direction (they could make a name look
// like something else, e.g. like another PZN).
function hasControl(text) {
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 0x20 || c === 0x7f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069))
            return true;
    }
    return false;
}

// Opens the database of the test data (one store, one entry).
function openDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB fehlt'));
            return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
// Runs one request on the store and resolves with its result.
async function withStore(mode, run) {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = run(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

// Checks a parsed file; returns { data } with only the known fields, or { error: text key }.
export function checkTestData(j) {
    const isText = (x, max) => typeof x === 'string' && x.length <= max && !hasControl(x);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { error: 'testdatenAufbau' };
    if (!isText(j.hinweis, LIMITS.text)) return { error: 'testdatenAufbau' };
    const sources = j.quellen;
    if (!sources || typeof sources !== 'object' || Array.isArray(sources))
        return { error: 'testdatenAufbau' };
    if (Object.keys(sources).length > LIMITS.sources) return { error: 'testdatenAufbau' };
    const sourceList = Object.entries(sources);
    if (!sourceList.every(([k, v]) => isText(k, 60) && isText(v, 200)))
        return { error: 'testdatenAufbau' };
    const packs = j.produkte;
    if (!packs || typeof packs !== 'object' || Array.isArray(packs))
        return { error: 'testdatenAufbau' };
    const keys = Object.keys(packs);
    if (!keys.length || keys.length > LIMITS.packs || j.anzahl !== keys.length)
        return { error: 'testdatenAnzahl' };
    const clean = {};
    for (const pzn of keys) {
        if (!/^\d{8}$/.test(pzn) || !pznValid(pzn)) return { error: 'testdatenPruefziffer' };
        const e = packs[pzn];
        if (!e || typeof e !== 'object' || Array.isArray(e)) return { error: 'testdatenAufbau' };
        if (Object.keys(e).length > FIELD_NAMES.length) return { error: 'testdatenFeld' };
        const out = {};
        for (const [k, v] of Object.entries(e)) {
            // Only own names of the list: never inherited ones like „__proto__“ or „constructor“.
            const max = Object.hasOwn(LIMITS.fields, k) ? LIMITS.fields[k] : 0;
            if (!max || !isText(v, max)) return { error: 'testdatenFeld' };
            const text = v.trim();
            if (text) out[k] = text;
        }
        if (!REQUIRED.every((k) => out[k])) return { error: 'testdatenFeld' };
        clean[pzn] = out;
    }
    return {
        data: {
            hinweis: j.hinweis,
            quellen: Object.fromEntries(sourceList),
            anzahl: keys.length,
            produkte: clean,
        },
    };
}
// Makes the loaded data usable: the packs and their PZN sorted for the search by prefix.
function use(data) {
    state.testData = data ? { ...data, sorted: Object.keys(data.produkte).sort() } : null;
}
// Reads a chosen file: size first, then JSON, then the strict check. Stores it only when everything is right.
export async function importTestData(file) {
    if (!file || file.size > LIMITS.bytes) return { error: 'testdatenGroesse' };
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        return { error: 'testdatenKeinJson' };
    }
    const r = checkTestData(parsed);
    if (r.error) return r;
    const data = { ...r.data, geladen: new Date().toISOString() };
    try {
        await withStore('readwrite', (s) => s.put(data, KEY));
    } catch {
        return { error: 'testdatenSpeicher' };
    }
    use(data);
    return { data };
}
// Deletes the whole database of the test data (fallback when deleting the entry fails); resolves with true on success.
function deleteDb() {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
            req.onblocked = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
}
// Removes the test data from this device. Returns false when they could not be deleted (then they stay shown, so the
// app never says „entfernt“ while they would come back after a restart).
export async function removeTestData() {
    let removed = true;
    try {
        await withStore('readwrite', (s) => s.delete(KEY));
    } catch {
        removed = await deleteDb();
    }
    if (removed) use(null);
    return removed;
}
// Loads stored test data at the start, after the first drawing (never slows the start down). The stored copy is
// checked again; broken data is ignored.
export async function loadTestData() {
    try {
        const stored = await withStore('readonly', (s) => s.get(KEY));
        const r = stored ? checkTestData(stored) : null;
        const when =
            stored && typeof stored.geladen === 'string' && stored.geladen.length <= 40
                ? stored.geladen
                : null;
        if (r && r.data) use({ ...r.data, geladen: when });
        // A broken copy is removed, so it is not checked again at every start.
        else if (r && r.error) await withStore('readwrite', (s) => s.delete(KEY));
    } catch {
        /* No test data */
    }
    return state.testData;
}
// The test product of a PZN, or null.
export const testProduct = (pzn) =>
    state.testData && Object.hasOwn(state.testData.produkte, pzn)
        ? state.testData.produkte[pzn]
        : null;
// All PZN of the test data that begin with the given digits (binary search in the sorted list).
export function testPznsWith(digits) {
    const list = state.testData ? state.testData.sorted : [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid] < digits) lo = mid + 1;
        else hi = mid;
    }
    const out = [];
    for (let i = lo; i < list.length && list[i].startsWith(digits); i++) out.push(list[i]);
    return out;
}
// One line with the details of a test product: substance, strength, pack size, form, maker (whatever is known).
export const testDetails = (p) => [p.w, p.s, p.p, p.f, p.h].filter(Boolean).join(' · ');
