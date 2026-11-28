// Pharmacies nearby (#15): emergency service card, the list and the bottom sheet.

import { OPENING_HOURS, state, STORAGE_KEYS } from './state.js';
import { $, el, formatDate, removeSetting, saveSetting, t } from './dom.js';
import { renderView } from './navigation.js';
import {
    currentPlace,
    getPosition,
    loadPharmacies,
    pharmacyData,
    pharmacyError,
    pharmacyLoading,
    pharmacyMatches,
    telLink,
} from './pharmacies.js';
import { pharmacyRow, routeSheet } from './pharmacies-entry.js';
import { dataAttrs, sym } from './ui.js';

// Card with the numbers of the emergency pharmacy service.
function emergencyCard() {
    const N = state.rules.apotheken;
    // Call button for one emergency number.
    const tel = (n) =>
        el(
            'a',
            { class: 'knopf zweit notdienst-tel', href: telLink(n.tel) },
            el('span', {}, n.anzeige),
            // Shown short („69 ct/Min.“), read in words („69 Cent pro Minute“) – #22.
            el(
                'span',
                { class: 'unterzeile' },
                el('span', { 'aria-hidden': n.vorlesen ? 'true' : null }, n.hinweis),
                n.vorlesen ? el('span', { class: 'nur-vorlesen' }, n.vorlesen) : null,
            ),
        );
    return el(
        'div',
        { class: 'karte notdienst', 'data-testid': 'notdienst' },
        el('h2', { class: 'zwischentitel' }, t('notdienstTitel')),
        el('p', {}, t('notdienstText')),
        el(
            'a',
            { class: 'knopf breit', href: N.notdienstUrl, target: '_blank', rel: 'noopener' },
            t('notdienstSuche'),
        ),
        el('div', { class: 'knopfreihe' }, tel(N.notdienstFestnetz), tel(N.notdienstHandy)),
    );
}
// Draws the pharmacy page: emergency card, choice of place, list or route sheet.
export function renderPharmacies() {
    if (!state.pharmacyView) return;
    const core = $('#kern');
    // The page is redrawn when the data arrives: keep what was typed into the place field (and its focus).
    const before = document.getElementById('apo-ort');
    const typed = before
        ? {
              value: before.value,
              focus: document.activeElement === before,
              start: before.selectionStart,
              end: before.selectionEnd,
          }
        : null;
    const focusKey = focusKeyOf(document.activeElement, core);
    core.textContent = '';
    core.append(el('h1', { class: 'titel' }, t('apoTitel')), emergencyCard());
    const placeOpen =
        !state.pharmacyPlace || (state.pharmacyPlace.art === 'standort' && !state.pharmacyPosition);
    if (placeOpen) {
        const field = el('input', {
            type: 'search',
            id: 'apo-ort',
            autocomplete: 'off',
            enterkeyhint: 'search',
            placeholder: 'z. B. 65239 oder Hochheim',
        });
        // Takes the entered place or postcode and shows the first page of hits.
        const searching = () => {
            const v = field.value.trim();
            if (!v) return;
            state.pharmacyPlace = { art: 'text', text: v };
            saveSetting(STORAGE_KEYS.apoOrt, v);
            state.pharmacyView.anzahl = state.rules.apotheken.eintraegeJeSeite;
            state.pharmacyView.offen = null;
            state.pharmacyView.meldung = null;
            renderPharmacies();
        };
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searching();
        });
        if (typed) field.value = typed.value;
        core.append(
            el(
                'div',
                { class: 'karte' },
                el('h2', { class: 'zwischentitel' }, t('apoWo')),
                el(
                    'button',
                    {
                        type: 'button',
                        class: 'knopf breit',
                        'data-testid': 'apo-standort',
                        onclick: getPosition,
                    },
                    sym('ort'),
                    t('apoStandort'),
                ),
                el('label', { class: 'feldtitel', for: 'apo-ort' }, t('apoOrtFeld')),
                el(
                    'div',
                    { class: 'ort-zeile' },
                    field,
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'knopf zweit',
                            'data-testid': 'apo-suchen',
                            onclick: searching,
                        },
                        t('apoSuchen'),
                    ),
                ),
                state.pharmacyView.meldung
                    ? el(
                          'p',
                          { class: 'rueckmeldung fehler', role: 'alert' },
                          state.pharmacyView.meldung,
                      )
                    : null,
                el('p', { class: 'hinweis-info' }, sym('info'), el('span', {}, t('apoPrivat'))),
            ),
        );
    } else {
        const place = currentPlace();
        const text =
            state.pharmacyPlace.art === 'standort'
                ? t('apoBeiStandort')
                : t('apoRundUm', { ort: (place && place.label) || state.pharmacyPlace.text });
        core.append(
            el(
                'p',
                { class: 'apo-ort' },
                el('span', { class: 'name' }, text),
                ' · ',
                el(
                    'button',
                    {
                        type: 'button',
                        class: 'link-knopf',
                        'data-testid': 'apo-aendern',
                        onclick: () => {
                            state.pharmacyPlace = null;
                            state.pharmacyPosition = null;
                            state.pharmacyView.meldung = null;
                            // „ändern“ forgets the remembered place (#68): it must not come back unexpectedly.
                            removeSetting(STORAGE_KEYS.apoOrt);
                            renderPharmacies();
                        },
                    },
                    t('apoAendern'),
                ),
            ),
        );
        if (place && place.notiz)
            core.append(
                el(
                    'p',
                    { class: 'hinweis-info', 'data-testid': 'apo-ort-notiz' },
                    sym('info'),
                    el('span', {}, place.notiz),
                ),
            );
        if (place && place.auswahl) core.append(placeChoice(place.auswahl));
    }
    if (!pharmacyData) {
        core.append(
            el(
                'div',
                { class: 'karte' },
                el(
                    'p',
                    { role: 'status' },
                    pharmacyError && !pharmacyLoading ? t('apoLadenFehler') : t('apoLaden'),
                ),
            ),
        );
        if (!pharmacyLoading && !pharmacyError) loadPharmacies();
    } else if (!placeOpen) {
        const now = new Date();
        const hits = pharmacyMatches();
        const withStatus = [];
        for (const x of hits) {
            const st = OPENING_HOURS.status(x.a.oh, now);
            if (state.pharmacyView.nurOffen && !st.offen) continue;
            withStatus.push({ ...x, st });
            if (withStatus.length > state.pharmacyView.anzahl) break;
        }
        const shown = withStatus.slice(0, state.pharmacyView.anzahl);
        core.append(
            el(
                'div',
                { class: 'apo-filter' },
                el(
                    'button',
                    {
                        type: 'button',
                        class: `knopf ${state.pharmacyView.nurOffen ? '' : 'zweit'}`.trim(),
                        'aria-pressed': String(state.pharmacyView.nurOffen),
                        'data-testid': 'apo-nur-offen',
                        onclick: () => {
                            state.pharmacyView.nurOffen = !state.pharmacyView.nurOffen;
                            state.pharmacyView.anzahl = state.rules.apotheken.eintraegeJeSeite;
                            state.pharmacyView.offen = null;
                            renderPharmacies();
                        },
                    },
                    t('apoNurOffen'),
                ),
            ),
        );
        const place = currentPlace();
        if (place && place.hinweis)
            core.append(el('div', { class: 'karte' }, el('p', {}, t(place.hinweis))));
        else if (!hits.length)
            core.append(
                el(
                    'div',
                    { class: 'karte' },
                    el('p', {}, t('apoNichtsGefunden', { ort: state.pharmacyPlace.text || '' })),
                ),
            );
        else if (!shown.length)
            core.append(el('div', { class: 'karte' }, el('p', {}, t('apoKeineOffen'))));
        else {
            const ul = el('ul', {
                class: 'zeilen apotheken',
                'data-testid': 'apotheken-liste',
            });
            for (const x of shown) ul.append(pharmacyRow(x));
            core.append(el('div', { class: 'karte liste' }, ul));
            if (withStatus.length > state.pharmacyView.anzahl) {
                core.append(
                    el(
                        'p',
                        { class: 'unter-liste' },
                        el(
                            'button',
                            {
                                type: 'button',
                                class: 'link-knopf',
                                'data-testid': 'apo-mehr',
                                onclick: () => {
                                    state.pharmacyView.anzahl +=
                                        state.rules.apotheken.eintraegeJeSeite;
                                    renderPharmacies();
                                },
                            },
                            t('apoMehr', { anzahl: state.rules.apotheken.eintraegeJeSeite }),
                        ),
                    ),
                );
            }
        }
    }
    core.append(
        el(
            'p',
            {
                class: 'leise apo-fuss',
                ...(pharmacyData ? dataAttrs('osm', pharmacyData.stand) : {}),
            },
            t('apoFuss', { stand: pharmacyData ? formatDate(pharmacyData.stand) : '–' }),
        ),
    );
    renderSheet();
    renderView();
    const field = document.getElementById('apo-ort');
    if (typed && typed.focus && field) {
        field.focus();
        field.setSelectionRange(typed.start, typed.end);
    } else if (!(state.pharmacyView && state.pharmacyView.blatt)) restoreFocus(core, focusKey);
}
// Where the focus was inside the page before a redraw (#22, WCAG 2.4.3): the pharmacy row or a control by its test id.
function focusKeyOf(active, core) {
    if (!active || !core.contains(active)) return null;
    const row = active.closest('li[data-apotheke]');
    return { apotheke: row ? row.dataset.apotheke : null, testid: active.dataset.testid || null };
}
// Puts the focus back on the same control after the page was redrawn (aufklappen, „Nur jetzt geöffnete“, „weitere“).
function restoreFocus(core, key) {
    if (!key) return;
    const row = key.apotheke
        ? [...core.querySelectorAll('li[data-apotheke]')].find(
              (li) => li.dataset.apotheke === key.apotheke,
          )
        : null;
    const scope = row || core;
    const target = key.testid
        ? scope.querySelector(`[data-testid="${CSS.escape(key.testid)}"]`)
        : row && row.querySelector('button.zeile');
    if (target) target.focus({ preventScroll: true });
}
// Several places with the entered name (#50): the biggest is shown, the others can be chosen with one tap.
function placeChoice(choices) {
    const chosen = state.pharmacyPlace.wahl || 0;
    return el(
        'div',
        { class: 'apo-auswahl', 'data-testid': 'apo-ortswahl' },
        el('p', { class: 'leise', id: 'apo-ortswahl-frage' }, t('apoOrtWahl')),
        // Same pattern as the choices of the guided choice: pills in a labelled group.
        el(
            'div',
            { class: 'chips wahl', role: 'group', 'aria-labelledby': 'apo-ortswahl-frage' },
            ...choices.map((c, i) =>
                el(
                    'button',
                    {
                        type: 'button',
                        class: `knopf ${i === chosen ? '' : 'zweit'}`.trim(),
                        'aria-pressed': String(i === chosen),
                        onclick: () => {
                            state.pharmacyPlace = { ...state.pharmacyPlace, wahl: i };
                            // Remember the chosen place as name and postcode (#68): next time it resolves to exactly
                            // this place, without asking again. Only on this device.
                            if (c.plz) saveSetting(STORAGE_KEYS.apoOrt, `${c.name} ${c.plz}`);
                            state.pharmacyView.anzahl = state.rules.apotheken.eintraegeJeSeite;
                            state.pharmacyView.offen = null;
                            renderPharmacies();
                        },
                    },
                    c.plz ? t('apoOrtMitPlz', { ort: c.name, plz: c.plz }) : c.name,
                ),
            ),
        ),
    );
}
// The choice sheet lies above everything (outside the content, so the bar rule does not hide it).
// While it is open, the rest of the page is inert (#22): the focus cannot leave the sheet, Escape closes it, and
// afterwards the focus returns to the „Route“ button of that pharmacy.
let sheetFor = null;
function renderSheet() {
    const old = document.getElementById('route-blatt');
    if (old) old.remove();
    const open = !!(state.pharmacyView && state.pharmacyView.blatt);
    for (const id of ['inhalt', 'dock']) {
        const part = document.getElementById(id);
        if (part) part.inert = open;
    }
    if (open) {
        sheetFor = state.pharmacyView.blatt.id;
        const b = routeSheet(state.pharmacyView.blatt);
        b.id = 'route-blatt';
        document.body.append(b);
        const firstOne = b.querySelector('a, button');
        if (firstOne) firstOne.focus();
    } else if (sheetFor) {
        const row = [...document.querySelectorAll('#kern li[data-apotheke]')].find(
            (li) => li.dataset.apotheke === sheetFor,
        );
        sheetFor = null;
        const route = row && row.querySelector('[data-testid="apo-route"]');
        if (route) route.focus({ preventScroll: true });
    }
}
// Escape closes the route sheet.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.pharmacyView && state.pharmacyView.blatt) {
        state.pharmacyView.blatt = null;
        renderPharmacies();
    }
});
