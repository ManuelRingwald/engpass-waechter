// Pharmacies nearby (#15, regeln.json → apotheken): loading the mirrored OpenStreetMap data, distance, position
// (only on tap, never sent) and links for maps and phone.

import { state, STORAGE_KEYS } from './state.js';
import { fetchDailyData, isDate, readFromCache } from './data.js';
import { $, el, readSetting, removeSetting, t } from './dom.js';
import { renderPharmacies } from './pharmacies-view.js';
import { distance, loadPlaces, resolvePlace } from './places.js';
import { sym } from './ui.js';

// Data: OpenStreetMap (ODbL), mirrored weekly, from our own host; loaded on first opening, then kept offline. The
// position never leaves the device: only requested on tap, distances computed here, kept in memory for this session
// only. { stand, liste: [{ id, name, lat, lon, strasse, nr, plz, ort, telefon, oh, rolli }] }
export let pharmacyData = null;
export let pharmacyLoading = null;
export let pharmacyError = false;
// Checks the mirrored pharmacy data; returns the reason it is unusable, or null.
function validatePharmacies(j) {
    if (!j || typeof j !== 'object' || !Array.isArray(j.felder) || !Array.isArray(j.apotheken))
        return 'Format unbekannt';
    if (!isDate(j.stand) || j.anzahl !== j.apotheken.length || !j.apotheken.length)
        return 'Anzahl oder Stand fehlt';
    for (const f of ['id', 'name', 'lat', 'lon'])
        if (!j.felder.includes(f)) return `Feld ${f} fehlt`;
    return null;
}
// Turns the compact table of the mirrored data into pharmacy objects.
function pharmaciesFromData(j) {
    const i = Object.fromEntries(j.felder.map((f, n) => [f, n]));
    const list = j.apotheken
        .filter((a) => Number.isFinite(a[i.lat]) && Number.isFinite(a[i.lon]))
        .map((a) => ({
            id: `${a[i.typ] || ''}${a[i.id]}`,
            name: a[i.name] || 'Apotheke',
            lat: a[i.lat],
            lon: a[i.lon],
            strasse: a[i.strasse] || '',
            nr: a[i.nr] || '',
            plz: a[i.plz] || '',
            ort: a[i.ort] || '',
            telefon: a[i.telefon] || '',
            oh: a[i.oeffnungszeiten] || '',
            rolli: a[i.rollstuhl] === 'yes',
        }));
    return { stand: j.stand, liste: list };
}
// Show the stored data at once; from the network only if nothing is there yet or the data is older than a week.
export function loadPharmacies() {
    if (pharmacyLoading) return pharmacyLoading;
    pharmacyLoading = (async () => {
        const url = 'daten/apotheken.json';
        // The place table (#50) loads alongside; a missing table only means the fallback over the pharmacies.
        const places = loadPlaces();
        const old = await readFromCache(url, validatePharmacies);
        if (old) {
            pharmacyData = pharmaciesFromData(old);
            if (state.pharmacyView) renderPharmacies();
        }
        const days = (Date.now() - (old ? Date.parse(old.stand) : 0)) / 864e5;
        if (!old || days > state.rules.apotheken.neuLadenNachTagen) {
            const r = await fetchDailyData(url, validatePharmacies);
            if (r.json) pharmacyData = pharmaciesFromData(r.json);
        }
        pharmacyError = !pharmacyData;
        await places;
    })()
        .catch(() => {
            pharmacyError = !pharmacyData;
        })
        .finally(() => {
            pharmacyLoading = null;
            if (state.pharmacyView) renderPharmacies();
        });
    return pharmacyLoading;
}
// Entry on the detail page (as main button when there is a shortage) and under „Mehr“.
export function pharmacyEntry(highlighted, back) {
    return el(
        'button',
        {
            type: 'button',
            class: `knopf breit apo-einstieg${highlighted ? '' : ' zweit'}`,
            'data-testid': 'apotheken-einstieg',
            onclick: () => openPharmacies({ zurueck: back }),
        },
        sym('ort'),
        el(
            'span',
            { class: 'mitte' },
            el('span', {}, t('apoEinstieg')),
            el('span', { class: 'unterzeile' }, t('apoEinstiegHilfe')),
        ),
    );
}
// Opens the pharmacy page, remembering where to go back to.
export function openPharmacies({ zurueck: back = null } = {}) {
    $('#suche').blur();
    if (!(history.state && history.state.ew === 'detail')) history.pushState({ ew: 'detail' }, '');
    state.selected = null;
    state.pznNumber = null;
    state.guide = null;
    state.newPzn = null;
    state.pharmacyView = {
        zurueck: back,
        anzahl: state.rules.apotheken.eintraegeJeSeite,
        nurOffen: false,
        offen: null,
        blatt: null,
        meldung: null,
    };
    if (!state.pharmacyPlace && !state.pharmacyPosition) {
        const o = readSetting(STORAGE_KEYS.apoOrt, '');
        if (o) state.pharmacyPlace = { art: 'text', text: o };
    }
    renderPharmacies();
    window.scrollTo(0, 0);
}
// Distance as text: one decimal below 10 km, otherwise whole kilometres.
export const kmText = (km) =>
    km < 10
        ? `${km.toFixed(1).replace('.', ',')} km`
        : `${Math.round(km).toLocaleString('de-DE')} km`;
// Hits sorted by distance: from the position, or from the centre of the entered postcode or place (#50). Pharmacies
// without an address are found too, because only their coordinates count.
export function pharmacyMatches() {
    if (!pharmacyData || !state.pharmacyPlace) return [];
    const byDistance = (p) =>
        pharmacyData.liste
            .map((a) => ({ a, km: distance(p, a) }))
            .sort((x, y) => x.km - y.km || x.a.name.localeCompare(y.a.name, 'de'));
    if (state.pharmacyPlace.art === 'standort')
        return state.pharmacyPosition ? byDistance(state.pharmacyPosition) : [];
    const r = currentPlace();
    return r && r.punkt ? byDistance(r.punkt) : [];
}
// The resolved entered place: { punkt, label, auswahl? } or { hinweis } or null.
export const currentPlace = () =>
    state.pharmacyPlace && state.pharmacyPlace.art === 'text' && pharmacyData
        ? resolvePlace(state.pharmacyPlace.text, pharmacyData.liste, state.pharmacyPlace.wahl)
        : null;
// Asks for the position once on tap; it stays in memory for this session only.
export function getPosition() {
    if (!navigator.geolocation) {
        state.pharmacyView.meldung = t('apoStandortFehler');
        renderPharmacies();
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            state.pharmacyPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            state.pharmacyPlace = { art: 'standort' };
            // The position replaces the remembered place (#68); the position itself is never stored.
            removeSetting(STORAGE_KEYS.apoOrt);
            if (state.pharmacyView) {
                state.pharmacyView.meldung = null;
                state.pharmacyView.anzahl = state.rules.apotheken.eintraegeJeSeite;
                state.pharmacyView.offen = null;
                renderPharmacies();
            }
        },
        () => {
            if (state.pharmacyView) {
                state.pharmacyView.meldung = t('apoStandortFehler');
                renderPharmacies();
            }
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
}
// Route link of a map app with the coordinates encoded.
export const mapUrl = (app, a) =>
    state.rules.apotheken.kartenApps[app].url
        .replace('{lat}', encodeURIComponent(a.lat))
        .replace('{lon}', encodeURIComponent(a.lon));
export const telLink = (num) => `tel:${String(num).replace(/[^\d+]/g, '')}`;
// The stored map app: 'apple', 'google' or 'fragen' (ask every time).
export const mapChoice = () => {
    const k = readSetting(STORAGE_KEYS.karte, 'fragen');
    return k === 'apple' || k === 'google' ? k : 'fragen';
};
