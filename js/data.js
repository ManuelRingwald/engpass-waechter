// Loading and checking data: JSON files, the daily data with its rules (regeln.json → pruefung), the offline cache,
// notices about outages and the age of the data (#56).

import { notices, state, TIMEOUT_MS } from './state.js';
import { $, el, formatDate, formatDateTime, t } from './dom.js';
import { sym } from './ui.js';

// Requests of this page can be cancelled by the app itself (#39): right before it reloads the page for „Jetzt laden“
// (#27), so they end as an ordinary, handled abort instead of being stopped by WebKit half-way. (Cancelling on
// pagehide was measured too and did not help: 3 of 240 vs. 1 of 240 runs with „Context is stopped“.)
let pageLife = new AbortController();
export const pageSignal = () => pageLife.signal;
// Cancels all running requests now; later requests get a fresh signal.
export const abortRequests = () => {
    pageLife.abort();
    pageLife = new AbortController();
};
// Loads a JSON file from the own host, past the HTTP cache.
export async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store', signal: pageSignal() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { json: await r.json(), ausSpeicher: false };
}
// Daily data: from the network first; the page checks it (regeln.json → pruefung) and stores only checked data in the
// offline cache. Without network, on errors or with broken data: the last checked data, with the reason.
const DATA_CACHE = 'ew-daten';
export const isDate = (x) => typeof x === 'string' && !Number.isNaN(Date.parse(x));
// Not an error, but never take it over (regeln.json → pruefung.nieAelter)
const OLDER = 'älter als der gespeicherte Stand';
// A stored timestamp in the future (wrong clock, faulty delivery) is no reference for „older“.
const usableAsReference = (x) => isDate(x) && Date.parse(x) <= Date.now() + 10 * 60e3;
// Checks the daily reports (regeln.json → pruefung); returns the reason they are unusable, or null.
export function validateDaily(j, previous) {
    const P = state.rules.pruefung;
    if (!j || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.meldungen))
        return 'Format unbekannt';
    if (!isDate(j.abgerufen) || Date.parse(j.abgerufen) > Date.now() + 864e5)
        return 'Abrufdatum ungültig';
    if (j.meldungen.length < P.minMeldungen) return `nur ${j.meldungen.length} Meldungen`;
    if (typeof j.anzahl !== 'number' || j.anzahl !== j.meldungen.length)
        return 'Anzahl passt nicht';
    if (
        j.meldungen.some(
            (m) =>
                !m ||
                typeof m !== 'object' ||
                (typeof m.id !== 'string' && typeof m.id !== 'number') ||
                (typeof m.name !== 'string' && typeof m.wirkstoffe !== 'string'),
        )
    )
        return 'Meldung ohne Kennung oder Namen';
    if (
        previous &&
        previous.meldungen &&
        j.meldungen.length < previous.meldungen.length * P.minAnteilVorher
    )
        return 'unplausibel wenige Meldungen';
    if (
        previous &&
        usableAsReference(previous.abgerufen) &&
        Date.parse(j.abgerufen) < Date.parse(previous.abgerufen)
    )
        return OLDER;
    return null;
}
// Checks the history of the reports; returns the reason it is unusable, or null.
export function validateHistory(j, previous) {
    if (
        !j ||
        typeof j !== 'object' ||
        !isDate(j.seit) ||
        !Array.isArray(j.tage) ||
        !j.meldungen ||
        typeof j.meldungen !== 'object'
    )
        return 'Format unbekannt';
    if (!isDate(j.aktualisiert) || Date.parse(j.aktualisiert) > Date.now() + 864e5)
        return 'Zeitpunkt fehlt oder ungültig';
    if (
        previous &&
        usableAsReference(previous.aktualisiert) &&
        Date.parse(j.aktualisiert) < Date.parse(previous.aktualisiert)
    )
        return OLDER;
    return null;
}
// Reads checked daily data from the offline cache; null when it is missing or broken.
export async function readFromCache(url, validate) {
    try {
        const cache = await caches.open(DATA_CACHE);
        const r = await cache.match(url);
        if (!r) return null;
        let json = null;
        try {
            json = await r.json();
        } catch {
            /* broken */
        }
        if (json && !validate(json)) return json;
        // Never reuse a broken copy (e.g. from an older version of the app)
        await cache.delete(url);
        return null;
    } catch {
        return null;
    }
}
// Result: { json, grund } – grund: null (fresh and checked) | 'netz' | 'http' | 'defekt' | 'aelter'; json then from the
// cache (or null).
export async function fetchDailyData(url, validate) {
    let reason;
    try {
        const r = await fetch(url, { cache: 'no-store', signal: pageSignal() });
        if (!r.ok) reason = 'http';
        else {
            const text = await r.text();
            let json = null;
            try {
                json = JSON.parse(text);
            } catch {
                /* broken */
            }
            const error = json ? validate(json) : 'kein JSON';
            if (!error) {
                try {
                    await (
                        await caches.open(DATA_CACHE)
                    ).put(
                        url,
                        new Response(text, { headers: { 'Content-Type': 'application/json' } }),
                    );
                } catch {
                    /* Offline cache not usable */
                }
                return { json, grund: null };
            }
            reason = error === OLDER ? 'aelter' : 'defekt';
        }
    } catch {
        reason = 'netz';
    }
    return { json: await readFromCache(url, validate), grund: reason };
}
// Loads a text file with a time limit (used for the RKI figures).
export async function fetchText(url) {
    const ctrl = new AbortController();
    const time = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const leave = () => ctrl.abort();
    pageSignal().addEventListener('abort', leave, { once: true });
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
    } finally {
        clearTimeout(time);
        pageSignal().removeEventListener('abort', leave);
    }
}
// Shows the notices for offline mode and for sources that failed.
export function renderNotices() {
    // Symbol and word, as everywhere (#22, project rule): the banners never rely on colour alone.
    const fill = (box, symbol, text) => {
        if (text) box.replaceChildren(sym(symbol), el('span', {}, text));
        else box.textContent = '';
        box.hidden = !text;
    };
    fill($('[data-testid="offline-hinweis"]'), 'info', notices.offline || '');
    // „info“, not the triangle: that one means „versorgungskritisch“ everywhere else.
    fill($('[data-testid="hinweis-ausfall"]'), 'info', [...notices.ausfall.values()].join(' '));
}
const ageHours = () =>
    state.daily ? (Date.now() - new Date(state.daily.abgerufen).getTime()) / 36e5 : 0;
// Mark stale data right at the statement (regeln.json → pruefung.veraltetNachStunden).
export function staleNotice() {
    if (!state.daily || ageHours() <= state.rules.pruefung.veraltetNachStunden) return null;
    const h = Math.round(ageHours());
    const age = h < 48 ? `${h} Stunden alt` : `${Math.floor(h / 24)} Tage alt`;
    return el(
        'p',
        { class: 'marke alt', 'data-testid': 'daten-veraltet', role: 'status' },
        t('veraltet', { datum: formatDateTime(state.daily.abgerufen), alter: age }),
    );
}
// Shows when the daily data was fetched and since when the history runs.
export function renderAsOf() {
    const s = $('#stand');
    if (!state.daily) {
        s.textContent = '';
        return;
    }
    s.textContent = `Tagesdaten des BfArM abgerufen am ${formatDateTime(state.daily.abgerufen)}${state.history ? ` · Verlauf seit ${formatDate(state.history.seit)}` : ''}${ageHours() > state.rules.pruefung.veraltetNachStunden ? ' · älter als üblich' : ''}`;
}
