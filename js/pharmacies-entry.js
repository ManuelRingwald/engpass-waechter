// Pharmacies nearby (#15): one entry with opening hours, call and route, the route sheet and the map app choice.

import { OPENING_HOURS, state, STORAGE_KEYS } from './state.js';
import { el, saveSetting, t } from './dom.js';
import { kmText, mapChoice, mapUrl, telLink } from './pharmacies.js';
import { renderPharmacies } from './pharmacies-view.js';
import { sym } from './ui.js';

// Symbol next to the opening state of a pharmacy (#22: symbol and word).
const STATUS_SYMBOL = { offen: 'haken', zu: 'uhr', unbekannt: 'info', feiertag: 'info' };

// One pharmacy in the list: name, distance or place, opening status; opened with call and route.
export function pharmacyRow({ a, km, st }) {
    const open = state.pharmacyView.offen === a.id;
    const meta = [
        km !== undefined ? kmText(km) : [a.plz, a.ort].filter(Boolean).join(' '),
        a.strasse ? null : t('apoOhneAdresse'),
        a.rolli ? t('apoRollstuhl') : null,
    ]
        .filter(Boolean)
        .join(' · ');
    const rows = OPENING_HOURS.lesbar(a.oh);
    const option = mapChoice();
    const route =
        option === 'fragen'
            ? el(
                  'button',
                  {
                      type: 'button',
                      class: 'knopf',
                      'data-testid': 'apo-route',
                      onclick: () => {
                          state.pharmacyView.blatt = a;
                          renderPharmacies();
                      },
                  },
                  t('apoRoute'),
              )
            : el(
                  'a',
                  {
                      class: 'knopf',
                      'data-testid': 'apo-route',
                      href: mapUrl(option, a),
                      target: '_blank',
                      rel: 'noopener',
                  },
                  t('apoRoute'),
              );
    return el(
        'li',
        { 'data-apotheke': a.id },
        el(
            'button',
            {
                type: 'button',
                class: 'zeile',
                'aria-expanded': String(open),
                onclick: () => {
                    state.pharmacyView.offen = open ? null : a.id;
                    renderPharmacies();
                },
            },
            el(
                'span',
                { class: 'mitte' },
                el('span', { class: 'name' }, a.name),
                el('span', { class: 'meta' }, meta),
                el(
                    'span',
                    { class: `apo-status ${st.art}`, 'data-testid': 'apo-status' },
                    // Symbol and word (#22): open, closed, unknown or a public holiday.
                    sym(STATUS_SYMBOL[st.art] || 'info'),
                    st.text,
                ),
            ),
            sym('pfeil', open ? 'gedreht' : 'spiegeln'),
        ),
        open
            ? el(
                  'div',
                  { class: 'produkt-details apo-details' },
                  el(
                      'p',
                      {},
                      [
                          [a.strasse, a.nr].filter(Boolean).join(' '),
                          [a.plz, a.ort].filter(Boolean).join(' '),
                      ]
                          .filter(Boolean)
                          .join(', ') || t('apoOhneAdresse'),
                  ),
                  rows
                      ? el(
                            'ul',
                            { class: 'apo-zeiten' },
                            rows.map((z) => el('li', {}, z)),
                        )
                      : el(
                            'p',
                            { class: 'leise' },
                            a.oh ? t('apoZeitenRoh', { text: a.oh }) : t('apoKeineZeiten'),
                        ),
                  el(
                      'div',
                      { class: 'knopfreihe' },
                      a.telefon
                          ? el(
                                'a',
                                {
                                    class: 'knopf zweit',
                                    'data-testid': 'apo-anrufen',
                                    href: telLink(a.telefon),
                                },
                                t('apoAnrufen'),
                            )
                          : null,
                      route,
                  ),
              )
            : null,
    );
}
// Choice of the map app the first time (or with „Jedes Mal fragen“); „Auswahl merken“ is preselected.
export function routeSheet(a) {
    let save = true;
    const saveButton = el(
        'button',
        {
            type: 'button',
            class: 'merken-schalter',
            // An on/off setting: a switch for VoiceOver (#22), like the iOS switches.
            role: 'switch',
            'aria-checked': 'true',
            onclick: () => {
                save = !save;
                saveButton.setAttribute('aria-checked', String(save));
            },
        },
        t('routeMerken'),
    );
    // Link that opens the route in the given map app.
    const link = (app) =>
        el(
            'a',
            {
                class: 'knopf breit',
                href: mapUrl(app, a),
                target: '_blank',
                rel: 'noopener',
                'data-karte-app': app,
                onclick: () => {
                    if (save) {
                        saveSetting(STORAGE_KEYS.karte, app);
                        renderMapChoice();
                    }
                    setTimeout(() => {
                        if (state.pharmacyView) {
                            state.pharmacyView.blatt = null;
                            renderPharmacies();
                        }
                    }, 0);
                },
            },
            state.rules.apotheken.kartenApps[app].name,
        );
    return el(
        'div',
        {
            class: 'blatt-hintergrund',
            onclick: (e) => {
                if (e.target === e.currentTarget) {
                    state.pharmacyView.blatt = null;
                    renderPharmacies();
                }
            },
        },
        el(
            'div',
            {
                class: 'blatt',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'blatt-titel',
                'data-testid': 'route-blatt',
            },
            el('h2', { class: 'zwischentitel', id: 'blatt-titel' }, t('routeTitel')),
            link('apple'),
            link('google'),
            saveButton,
            el(
                'button',
                {
                    type: 'button',
                    class: 'link-knopf',
                    onclick: () => {
                        state.pharmacyView.blatt = null;
                        renderPharmacies();
                    },
                },
                t('abbrechen'),
            ),
        ),
    );
}
// Marks the stored choice of the map app under „Mehr“.
export function renderMapChoice() {
    const k = mapChoice();
    for (const b of document.querySelectorAll('[data-karte]'))
        b.setAttribute('aria-pressed', String(b.dataset.karte === k));
}
