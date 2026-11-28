// Postcode and place name → centre (#50): loads orte.json (OpenStreetMap, ODbL, mirrored weekly next to
// apotheken.json) and resolves an input to a point, so pharmacies are sorted by distance as with the position.
// Fallback without the table: the centre of the pharmacies with that postcode or place. Nothing leaves the device.

import { state } from './state.js';
import { fetchDailyData, isDate, readFromCache } from './data.js';
import { norm, t } from './dom.js';

// Decoded table: { postcodes: Map(code → {lat, lon}), places: [{ kind, lat, lon, name, key }] } or null.
export let placeData = null;
let placeLoading = null;
const KIND_RANK = { c: 4, t: 3, s: 2, v: 1 };
// Places closer than this count as the same place when a name is ambiguous (node and suburb of one town).
const SAME_PLACE_KM = 5;
const MAX_CHOICES = 5;

// Checks the mirrored place table; returns the reason it is unusable, or null.
function validatePlaces(j) {
    if (!j || typeof j !== 'object' || typeof j.plz !== 'string' || typeof j.orte !== 'string')
        return 'Format unbekannt';
    if (!isDate(j.stand) || j.plz.length !== j.anzahlPlz * 11) return 'Anzahl oder Stand fehlt';
    return null;
}
// One coordinate pair from 6 base-36 characters (see werkzeuge/orte-holen.mjs).
const decode = (s) => ({
    lat: 47 + parseInt(s.slice(0, 3), 36) / 1000,
    lon: 5 + parseInt(s.slice(3, 6), 36) / 1000,
});
// Turns the compact strings of orte.json into a postcode map and a list of places.
function placesFromData(j) {
    const postcodes = new Map();
    for (let i = 0; i + 11 <= j.plz.length; i += 11)
        postcodes.set(j.plz.slice(i, i + 5), decode(j.plz.slice(i + 5, i + 11)));
    const places = j.orte
        .split('|')
        .filter((s) => s.length > 7)
        .map((s) => {
            const name = s.slice(7);
            return { kind: s[0], ...decode(s.slice(1, 7)), name, key: norm(name) };
        });
    return { postcodes, places };
}
// Loads the table like the pharmacies: stored copy at once, from the network at most weekly. Missing table (before
// the first weekly run) is fine: the fallback over the pharmacies takes over.
export function loadPlaces() {
    if (placeLoading) return placeLoading;
    placeLoading = (async () => {
        const url = 'daten/orte.json';
        const old = await readFromCache(url, validatePlaces);
        if (old) placeData = placesFromData(old);
        const days = (Date.now() - (old ? Date.parse(old.stand) : 0)) / 864e5;
        if (!old || days > state.rules.apotheken.neuLadenNachTagen) {
            const r = await fetchDailyData(url, validatePlaces);
            if (r.json) placeData = placesFromData(r.json);
        }
    })()
        .catch(() => {
            /* Table not usable: fallback over the pharmacies */
        })
        .finally(() => {
            placeLoading = null;
        });
    return placeLoading;
}

// Distance between two coordinates in kilometres (haversine).
export const distance = (a, b) => {
    const r = Math.PI / 180;
    const x =
        Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
        Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
};
// Mean position of a list of points; null for an empty list.
function centreOf(points) {
    if (!points.length) return null;
    const sum = points.reduce((s, p) => ({ lat: s.lat + p.lat, lon: s.lon + p.lon }), {
        lat: 0,
        lon: 0,
    });
    return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}
// The postcode whose centre is nearest to a point (to tell places with the same name apart).
function nearestPostcode(p, pharmacies) {
    let best = null;
    if (placeData && placeData.postcodes.size) {
        for (const [code, c] of placeData.postcodes) {
            const d = distance(p, c);
            if (!best || d < best.d) best = { code, d };
        }
    } else {
        for (const a of pharmacies) {
            if (!/^\d{5}$/.test(a.plz)) continue;
            const d = distance(p, a);
            if (!best || d < best.d) best = { code: a.plz, d };
        }
    }
    return best ? best.code : '';
}
// Postcode (3–5 digits) → centre from the table, else from the pharmacies with that postcode.
function resolvePostcode(q, pharmacies) {
    if (q.length < 3) return { hinweis: 'apoPlzKurz' };
    if (placeData) {
        const exact = q.length === 5 && placeData.postcodes.get(q);
        if (exact) return { punkt: exact, label: q };
        const prefix = [...placeData.postcodes]
            .filter(([code]) => code.startsWith(q))
            .map(([, c]) => c);
        if (prefix.length) return { punkt: centreOf(prefix), label: q };
    }
    const own = pharmacies.filter((a) => a.plz.startsWith(q));
    return own.length ? { punkt: centreOf(own), label: q } : null;
}
// Place name → centre. Names equal to the input or starting with it (word boundary); bigger places first, equal
// names before longer ones („Hochheim“ → the town Hochheim am Main before the village Hochheim). Several places far
// apart with that name: the first is used and up to five are offered as a choice.
function resolveName(q, pharmacies, choice) {
    const n = norm(q);
    if (n.length < 2) return null;
    const startsWord = (key) => key.startsWith(n) && /^$|^[\s\-/(,]/.test(key.slice(n.length));
    const found = placeData
        ? placeData.places
              .filter((o) => startsWord(o.key))
              .sort(
                  (a, b) =>
                      KIND_RANK[b.kind] - KIND_RANK[a.kind] ||
                      (b.key === n) - (a.key === n) ||
                      a.name.localeCompare(b.name, 'de'),
              )
        : [];
    // One entry per place: drop entries close to a bigger one already kept.
    const kept = [];
    for (const o of found) if (!kept.some((k) => distance(k, o) < SAME_PLACE_KM)) kept.push(o);
    if (kept.length) {
        const choices = kept
            .slice(0, MAX_CHOICES)
            .map((o) => ({ ...o, plz: nearestPostcode(o, pharmacies) }));
        const pick = choices[Math.min(choice || 0, choices.length - 1)];
        return {
            punkt: pick,
            label: pick.name,
            auswahl: choices.length > 1 ? choices : null,
        };
    }
    // Fallback: pharmacies whose place starts with the input.
    const own = pharmacies.filter((a) => startsWord(norm(a.ort)));
    return own.length ? { punkt: centreOf(own), label: q } : null;
}
// A place name counts as matching a postcode when one of its places lies this close to the postcode centre.
const FITS_POSTCODE_KM = 10;
// Postcode and place name together, in any order („65239 Hochheim“, „Hochheim, 65239“; #68). The postcode wins: the
// place of that name closest to it is used when it fits; otherwise the postcode centre, with a calm note.
function resolveBoth(code, name, pharmacies) {
    const byCode = resolvePostcode(code, pharmacies);
    if (!byCode || !byCode.punkt) return resolveName(name, pharmacies, 0);
    const byName = resolveName(name, pharmacies, 0);
    const candidates = byName ? byName.auswahl || [byName.punkt] : [];
    const nearest = candidates
        .map((c) => ({ c, km: distance(c, byCode.punkt) }))
        .sort((a, b) => a.km - b.km)[0];
    if (nearest && nearest.km <= FITS_POSTCODE_KM) {
        const label = nearest.c.name || byName.label;
        return { punkt: nearest.c, label: t('apoOrtMitPlz', { ort: label, plz: code }) };
    }
    return { ...byCode, notiz: t('apoPlzOrtPasstNicht', { plz: code, ort: name }) };
}
// Input → { punkt, label, auswahl?, notiz? } or { hinweis } or null (nothing found).
export function resolvePlace(text, pharmacies, choice = 0) {
    const q = String(text || '').trim();
    if (/^\d+$/.test(q)) return resolvePostcode(q, pharmacies);
    const both = q.match(/^(?:(\d{3,5})[\s,]+(\D.*)|(\D.*?)[\s,]+(\d{3,5}))$/);
    if (both) {
        const code = both[1] || both[4];
        const name = (both[2] || both[3]).replace(/[\s,]+$/, '').trim();
        if (name) return resolveBoth(code, name, pharmacies);
    }
    return resolveName(q, pharmacies, choice);
}
