// My product by PZN (#18, regeln.json → abgleich.meinProdukt): add, rename, remove and show a product.

import { state, STORAGE_KEYS } from './state.js';
import { choosePzn } from './choose.js';
import { $, el, endText, readSetting, saveSetting, t } from './dom.js';
import { renderGuide, showAfterSave } from './guided-choice.js';
import { matches, pznValid } from './matching.js';
import { renderView } from './navigation.js';
import { canScan, openScanner } from './scan.js';
import { testDetails, testProduct } from './testdata.js';
import { arrow, badge, dataAttrs, levelOf, sym } from './ui.js';
import { lastSeenText, myList } from './watchlist.js';

export const isPznEntry = (e) => !!e && e.typ === 'pzn';
export const myPzn = (pzn) => myList().find((x) => isPznEntry(x) && x.pzn === pzn) || null;
export const reportForPzn = (pzn) =>
    (state.daily && pznValid(pzn) ? state.daily.meldungen.find((m) => m.pzn === pzn) : null) ||
    null;
// The substance of a report, if it is in the list.
const substanceFor = (m) => {
    const e = m && state.searchIndex.find((x) => x.typ === 'wirkstoff' && matches(x.w, m));
    return e ? e.w : null;
};
// Card with the product of a PZN from the test data (#79): name, details, „Aus Testdaten“ and the reminder that test
// data say nothing about shortages. Used in the PZN entry and on the page of a PZN.
// heading: true on the page of a PZN, so the card can be reached by its heading.
export function testProductCard(pzn, p, heading = false) {
    return el(
        'div',
        { class: 'pzn-karte testprodukt', 'data-testid': 'pzn-testprodukt' },
        badge('info', t('ausTestdaten')),
        el(heading ? 'h2' : 'p', { class: 'name' }, p.n),
        el(
            'p',
            { class: 'leise' },
            [`PZN\u00a0${pzn}`, testDetails(p)].filter(Boolean).join(' · '),
        ),
        el('p', { class: 'leise' }, t('testdatenOhneStatus')),
    );
}
// The name proposed from the test data: the name, and the strength only when the name does not already contain it
// („Erfundol 500 mg“ stays as it is, „Placebomin“ becomes „Placebomin 5 mg“).
function nameWithStrength(p) {
    const plain = (x) => x.toLowerCase().replace(/\s+/g, '');
    return p.s && !plain(p.n).includes(plain(p.s)) ? `${p.n} ${p.s}` : p.n;
}
// Opens „Mein Produkt hinzufügen“, optionally with PZN and name preset.
export function openNewPzn({ pzn = '', name = '', zurueck: back = null } = {}) {
    state.newPzn = { pzn, name, vorschlag: name, zurueck: back };
    state.selected = null;
    state.pznNumber = null;
    const f = state.guide;
    state.guide = null;
    if (f && !back)
        state.newPzn.zurueck = () => {
            state.guide = f;
            renderGuide();
        };
    else if (f)
        state.newPzn.zurueck = () => {
            state.guide = f;
            back();
        };
    renderNewPzn();
}
// Redraws only the result of the open PZN entry with the current daily data; the typed PZN and name stay (#65).
let redrawResult = () => {};
export const refreshNewPzn = () => redrawResult();
// Draws the PZN entry: field, check of the PZN, the matching report and the name.
function renderNewPzn() {
    const core = $('#kern');
    core.textContent = '';
    const field = el('input', {
        type: 'text',
        id: 'pzn-eingabe',
        inputmode: 'numeric',
        autocomplete: 'off',
        spellcheck: 'false',
        maxlength: '14',
        placeholder: 'z. B. 08625171',
        value: state.newPzn.pzn,
        'aria-describedby': 'pzn-hilfe pzn-ergebnis',
    });
    const name = el('input', {
        type: 'text',
        id: 'pzn-name',
        autocomplete: 'off',
        value: state.newPzn.name,
        'aria-describedby': 'pzn-name-hilfe',
    });
    const result = el('div', { id: 'pzn-ergebnis', 'aria-live': 'polite' });
    // The product from the test data stands outside the live region, so VoiceOver does not read the whole card at the
    // 8th digit; it is reached by swiping (review: accessibility).
    const testSlot = el('div', {});
    const nameHint = el('p', { class: 'leise', id: 'pzn-name-hilfe' });
    // What the result says for the typed digits: same key → same result, nothing to redraw (#67).
    const resultKey = (digits) => {
        const m = reportForPzn(digits);
        const tp = pznValid(digits) ? testProduct(digits) : null;
        return JSON.stringify([
            digits,
            !!state.daily,
            m && [m.id, m.name, m.inhaber, m.ende, levelOf([m])],
            tp && [tp.n, testDetails(tp)],
        ]);
    };
    let shownKey = null;
    // Checks the entered PZN on every input and shows what is reported for it.
    const update = () => {
        const digits = field.value.replace(/\D/g, '');
        state.newPzn.pzn = digits;
        shownKey = resultKey(digits);
        result.textContent = '';
        testSlot.textContent = '';
        const m = reportForPzn(digits);
        // The field names its error (#22, WCAG 3.3.1); the message itself is in pzn-ergebnis.
        if (digits.length === 8 && !pznValid(digits)) field.setAttribute('aria-invalid', 'true');
        else field.removeAttribute('aria-invalid');
        if (digits.length === 8 && !pznValid(digits)) {
            result.append(
                el('p', { class: 'rueckmeldung fehler', role: 'alert' }, t('pznUngueltig')),
            );
        } else if (digits.length === 8 && m) {
            result.append(
                el(
                    'div',
                    { class: 'pzn-karte achtung', 'data-testid': 'pzn-gemeldet' },
                    badge(levelOf([m])),
                    el(
                        'p',
                        { class: 'status', ...dataAttrs('bfarm', state.daily.abgerufen) },
                        t('pznGemeldet'),
                    ),
                    el('p', {}, `${m.name} · ${m.inhaber || ''}`.replace(/ · $/, '')),
                    m.ende ? el('p', { class: 'leise' }, endText(m.ende)) : null,
                ),
            );
            // Suggest the name from the report as long as the person has not entered an own one.
            if (!name.value.trim() || name.value === state.newPzn.vorschlag) {
                name.value = m.name;
                state.newPzn.vorschlag = m.name;
                state.newPzn.name = m.name;
            }
        } else if (digits.length === 8) {
            // Without daily data nothing is said about reports (never a false all-clear, #77/#79).
            result.append(
                state.daily
                    ? el(
                          'div',
                          { class: 'pzn-karte gut', 'data-testid': 'pzn-nichts' },
                          badge('gut'),
                          el(
                              'p',
                              { class: 'status', ...dataAttrs('bfarm', state.daily.abgerufen) },
                              t('pznNichts'),
                          ),
                      )
                    : el(
                          'p',
                          { class: 'hinweis-info', 'data-testid': 'pzn-daten-fehlen' },
                          sym('info'),
                          el('span', {}, t('datenFehlen')),
                      ),
            );
            // The product from the test data of this device (#79): name and details, no state of supply.
            const tp = testProduct(digits);
            if (tp) testSlot.append(testProductCard(digits, tp));
            const proposal = tp ? nameWithStrength(tp) : '';
            if (proposal && (!name.value.trim() || name.value === state.newPzn.vorschlag)) {
                name.value = proposal;
                state.newPzn.vorschlag = proposal;
                state.newPzn.name = proposal;
            } else if (
                !proposal &&
                name.value === state.newPzn.vorschlag &&
                state.newPzn.vorschlag
            ) {
                name.value = '';
                state.newPzn.name = '';
                state.newPzn.vorschlag = '';
            }
        }
        const fromTests = !m && digits.length === 8 && pznValid(digits) && testProduct(digits);
        nameHint.textContent = m
            ? t('pznNameVorschlag')
            : fromTests
              ? t('pznNameAusTestdaten')
              : t('pznNameLeer');
        const mainButton = $('#haupt');
        mainButton.disabled = !pznValid(digits);
    };
    field.addEventListener('input', update);
    // After reloading the daily data (#65): redraw only a changed result, so VoiceOver does not announce the same
    // alert twice (#67); an unchanged result only gets the new data timestamp.
    redrawResult = () => {
        if (!field.isConnected) return;
        if (resultKey(field.value.replace(/\D/g, '')) !== shownKey) update();
        else if (state.daily)
            for (const n of result.querySelectorAll('[data-stand]'))
                n.setAttribute('data-stand', state.daily.abgerufen);
    };
    name.addEventListener('input', () => {
        state.newPzn.name = name.value;
    });
    core.append(
        el(
            'div',
            { class: 'karte' },
            el('h1', { class: 'ueberschrift' }, t('pznTitel')),
            el('label', { class: 'feldtitel', for: 'pzn-eingabe' }, t('pznFeld')),
            field,
            scanButton(field),
            el('p', { class: 'leise', id: 'pzn-hilfe' }, t('pznHilfe')),
            result,
            testSlot,
            el('label', { class: 'feldtitel', for: 'pzn-name' }, t('pznName')),
            name,
            nameHint,
            el('p', { class: 'hinweis-info' }, sym('info'), el('span', {}, t('pznPrivat'))),
        ),
    );
    renderView();
    update();
    window.scrollTo(0, 0);
}
// „Packung scannen“ (#43, trial): reads the PZN barcode with the camera and writes the PZN into the field, where it is
// checked as if typed. Only offered when the browser can show the camera; typing always stays possible.
function scanButton(field) {
    if (!canScan()) return null;
    const button = el(
        'button',
        {
            type: 'button',
            class: 'knopf zweit breit scan-knopf',
            'data-testid': 'pzn-scannen',
            onclick: () =>
                openScanner((p) => {
                    field.value = p;
                    field.dispatchEvent(new Event('input'));
                    // The focus in the field reads the PZN and its result (live region); no third announcement.
                    field.focus();
                }, button),
        },
        sym('kamera'),
        t('scanKnopf'),
    );
    return button;
}
// Saves the PZN entry in „Meine“ (replacing an earlier entry with the same PZN).
export function savePzn() {
    const pzn = state.newPzn.pzn;
    if (!pznValid(pzn)) return;
    const m = reportForPzn(pzn);
    const w = substanceFor(m);
    const name = (state.newPzn.name || '').trim() || t('pznNameErsatz', { pzn });
    const list = myList().filter((x) => !(isPznEntry(x) && x.pzn === pzn));
    list.push({ typ: 'pzn', pzn, name, ...(w ? { wirkstoff: w.n } : {}) });
    saveSetting(STORAGE_KEYS.meine, list);
    markSeenPzn(pzn);
    state.feedback = t('hinzugefuegt');
    state.newPzn = null;
    showAfterSave();
}
// „Seit deinem letzten Blick“ for PZN entries (key pzn:<PZN>).
export function markSeenPzn(pzn) {
    if (!state.daily) return;
    const g = readSetting(STORAGE_KEYS.gesehen, {});
    const ms = state.daily.meldungen.filter((m) => m.pzn === pzn);
    g[`pzn:${pzn}`] = {
        am: new Date().toISOString(),
        ids: ms.map((m) => m.id),
        enden: Object.fromEntries(ms.map((m) => [m.id, m.ende])),
    };
    saveSetting(STORAGE_KEYS.gesehen, g);
}
// What changed for a PZN since the last look: new, removed, end postponed; null when nothing.
export function sinceLastSeenPzn(pzn) {
    const g = readSetting(STORAGE_KEYS.gesehen, {})[`pzn:${pzn}`];
    if (!g || !state.daily) return null;
    const ms = state.daily.meldungen.filter((m) => m.pzn === pzn);
    const now = new Set(ms.map((m) => m.id));
    const added = ms.filter((m) => !g.ids.includes(m.id)).length;
    const removed = g.ids.filter((id) => !now.has(id)).length;
    const postponed = ms.filter((m) => g.ids.includes(m.id) && g.enden[m.id] !== m.ende).length;
    return added || removed || postponed
        ? { am: g.am, neu: added, weg: removed, verschoben: postponed }
        : null;
}
// Row in „Meine“ and „Neuigkeiten“ for a PZN entry.
export function pznRow(e, lastSeen = sinceLastSeenPzn(e.pzn)) {
    const m = reportForPzn(e.pzn);
    return el(
        'li',
        {},
        el(
            'button',
            {
                type: 'button',
                class: 'zeile',
                'data-testid': 'mein-produkt',
                onclick: () => choosePzn(e.pzn),
            },
            el(
                'span',
                { class: 'mitte' },
                el('span', { class: 'name' }, e.name),
                el('span', { class: 'meta' }, t('pznMeta', { pzn: e.pzn })),
                el(
                    'span',
                    { class: 'meta', ...dataAttrs('bfarm', state.daily.abgerufen) },
                    m ? t('pznStatusGemeldet', { name: m.name }) : t('pznStatusNichts'),
                ),
                badge(m ? levelOf([m]) : 'gut'),
                lastSeen ? el('span', { class: 'marke neu' }, lastSeenText(lastSeen)) : null,
            ),
            arrow(),
        ),
    );
}
// Renames a PZN entry; an empty name falls back to the PZN.
export function renamePzn(pzn, name) {
    const list = myList();
    const e = list.find((x) => isPznEntry(x) && x.pzn === pzn);
    if (!e) return;
    e.name = name.trim() || t('pznNameErsatz', { pzn });
    saveSetting(STORAGE_KEYS.meine, list);
    state.feedback = t('pznUmbenannt');
    choosePzn(pzn);
}
// Removes a PZN entry from „Meine“.
export function removePzn(pzn) {
    saveSetting(
        STORAGE_KEYS.meine,
        myList().filter((x) => !(isPznEntry(x) && x.pzn === pzn)),
    );
    state.feedback = t('entfernt');
    showAfterSave();
}
