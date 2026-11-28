// PZN first (#77): a PZN typed or scanned into the search field. From the first digit the search shows calmly how many
// digits are missing; from 4 digits it suggests reported packs whose PZN begins with them (current reports and reports
// that ended, from the history); at 8 digits it checks the check digit. Everything runs on the device; the PZN is never
// sent anywhere.

import { state } from './state.js';
import { choosePzn } from './choose.js';
import { el, t } from './dom.js';
import { pznValid } from './matching.js';
import { setView } from './navigation.js';
import { openNewPzn } from './pzn.js';
import { testDetails, testPznsWith, testProduct } from './testdata.js';
import { arrow, badge, levelOf, sym } from './ui.js';

// From how many digits suggestions come, and how many at most (regeln.json → abgleich.pznSuche).
const minDigits = () => state.rules.abgleich.pznSuche.mindestZiffern;
const maxSuggestions = () => state.rules.abgleich.pznSuche.hoechstensVorschlaege;

// The digits of a PZN input („PZN-0862 517“, „pzn 0862517“, „08625171“), or null when the input is no PZN.
export function pznDigits(q) {
    const m = /^\s*(?:pzn\s*[-:]?\s*)?(\d[\d\s-]*)$/i.exec(String(q || ''));
    if (!m) return null;
    const digits = m[1].replace(/\D/g, '');
    return digits.length <= 8 ? digits : null;
}
// All packs with a PZN in the reports: current ones, then ended ones from the history („früher gemeldet“). Built once
// per state of the data.
let packs = { key: null, list: [] };
function allPacks() {
    const key = state.daily
        ? `${state.daily.abgerufen}|${state.history ? state.history.aktualisiert : ''}`
        : '';
    if (packs.key === key) return packs.list;
    const list = [];
    const seen = new Set();
    for (const m of state.daily ? state.daily.meldungen : [])
        if (m.pzn && !seen.has(m.pzn)) {
            seen.add(m.pzn);
            list.push({ m, ended: false });
        }
    const old =
        state.history && state.history.meldungen ? Object.values(state.history.meldungen) : [];
    for (const v of old)
        if (v.pzn && v.entferntAm && !seen.has(v.pzn)) {
            seen.add(v.pzn);
            list.push({ m: v, ended: true });
        }
    list.sort((a, b) => a.m.pzn.localeCompare(b.m.pzn));
    packs = { key, list };
    return list;
}
// One suggestion: name, substance, form, maker and the state with symbol and word.
function suggestion(p, action) {
    const { m, ended } = p;
    const meta = [m.wirkstoffe, m.form, m.inhaber].filter(Boolean).join(' · ');
    return el(
        'li',
        {},
        el(
            'button',
            {
                type: 'button',
                'data-testid': 'such-treffer',
                'data-pzn': m.pzn,
                ...action(() => choosePzn(m.pzn)),
            },
            el(
                'span',
                { class: 'mitte' },
                el('span', { class: 'name' }, m.name),
                el('span', { class: 'meta' }, `PZN ${m.pzn}${meta ? ` · ${meta}` : ''}`),
                ended ? badge('info', t('pznFrueherGemeldet')) : badge(levelOf([m])),
            ),
            arrow(),
        ),
    );
}
// One suggestion from the test data (#79): name, PZN, substance, strength, pack size, form – marked „Aus Testdaten“,
// never with a state of supply.
function testSuggestion({ pzn, product }, action) {
    const details = testDetails(product);
    return el(
        'li',
        {},
        el(
            'button',
            {
                type: 'button',
                'data-testid': 'such-treffer',
                'data-pzn': pzn,
                'data-test': 'ja',
                ...action(() => choosePzn(pzn)),
            },
            el(
                'span',
                { class: 'mitte' },
                el('span', { class: 'name' }, product.n),
                el('span', { class: 'meta' }, `PZN\u00a0${pzn}${details ? ` · ${details}` : ''}`),
                badge('info', t('ausTestdaten')),
            ),
            arrow(),
        ),
    );
}
// A calm line in the list (no button): the counter or a hint.
const line = (text, testid, symbol = 'info') =>
    el('li', { class: 'pzn-hinweis', 'data-testid': testid }, sym(symbol), el('span', {}, text));
// „Als mein Produkt merken“ for a valid PZN: opens the PZN entry; „Zurück“ returns to the search with the typed PZN.
const rememberButton = (digits, action) =>
    el(
        'li',
        {},
        el(
            'button',
            {
                type: 'button',
                'data-testid': 'pzn-merken',
                ...action(() =>
                    openNewPzn({ pzn: digits, zurueck: () => setView('suchen', { fokus: true }) }),
                ),
            },
            el('span', { class: 'mitte' }, t('pznAlsMeins')),
            arrow(),
        ),
    );
// The counter „PZN: noch 5 Ziffern“.
const counterText = (n) => (n === 1 ? t('pznNochZiffer') : t('pznNochZiffern', { anzahl: n }));

// Builds the list for a PZN input into ul; returns the text to announce once typing pauses. The last line always says
// that the PZN stays on the device.
export function buildPznHits(digits, ul, action) {
    const said = buildLines(digits, ul, action);
    ul.append(line(t('pznPrivat'), 'pzn-privat'));
    return said;
}
// The counter, hints and suggestions for the typed digits.
function buildLines(digits, ul, action) {
    const missing = 8 - digits.length;
    const said = [];
    if (missing > 0) {
        ul.append(line(counterText(missing), 'pzn-zaehler', 'lupe'));
        // With a full stop, so VoiceOver pauses before the next part.
        said.push(`${counterText(missing)}.`);
    }
    if (digits.length < minDigits()) {
        const text = t('pznMindestens', { anzahl: minDigits() });
        ul.append(line(text, 'pzn-mindestens'));
        said.push(text);
        return said.join(' ');
    }
    if (digits.length === 8 && !pznValid(digits)) {
        ul.append(line(t('pznUngueltig'), 'pzn-ungueltig'));
        said.push(t('pznUngueltig'));
        return said.join(' ');
    }
    // An old PZN-7: with a leading 0 it becomes the PZN-8 of the same pack.
    if (digits.length === 7 && pznValid(`0${digits}`)) {
        const p = `0${digits}`;
        ul.append(
            el(
                'li',
                {},
                el(
                    'button',
                    { type: 'button', 'data-testid': 'pzn-alt7', ...action(() => choosePzn(p)) },
                    el('span', { class: 'mitte' }, t('pznAlt7', { pzn: p })),
                    arrow(),
                ),
            ),
        );
        said.push(t('pznAlt7', { pzn: p }));
    }
    // Test data of this device (#79): products for PZN without a report – never a statement about shortages.
    const tests = (reported) =>
        testPznsWith(digits)
            .filter((p) => !reported.has(p))
            .map((p) => ({ pzn: p, product: testProduct(p) }));
    // Without daily data nothing can be said about reports (#77, review): never „nichts gemeldet“, but „Tagesdaten
    // fehlen“. Products from the test data can still be shown; a valid PZN can still be remembered.
    if (!state.daily) {
        ul.append(line(t('datenFehlen'), 'pzn-daten-fehlen'));
        said.push(t('datenFehlen'));
        if (digits.length >= minDigits())
            for (const p of tests(new Set()).slice(0, maxSuggestions()))
                ul.append(testSuggestion(p, action));
        if (digits.length === 8) ul.append(rememberButton(digits, action));
        return said.join(' ');
    }
    const found = allPacks().filter((p) => p.m.pzn.startsWith(digits));
    const fromTests = tests(new Set(found.map((p) => p.m.pzn)));
    const total = found.length + fromTests.length;
    for (const p of found.slice(0, maxSuggestions())) ul.append(suggestion(p, action));
    for (const p of fromTests.slice(0, Math.max(0, maxSuggestions() - found.length)))
        ul.append(testSuggestion(p, action));
    if (total > maxSuggestions()) {
        ul.append(line(t('pznEingrenzen', { anzahl: total }), 'pzn-eingrenzen'));
        said.push(t('pznEingrenzen', { anzahl: total }));
    } else if (total)
        said.push(
            total === 1 ? t('ansagePznVorschlag') : t('ansagePznVorschlaege', { anzahl: total }),
        );
    if (digits.length === 8 && !found.length) {
        // A valid PZN without a report: remember it as my product, with a name of my own.
        ul.append(
            line(t('pznGueltigNichts'), 'pzn-gueltig-nichts'),
            rememberButton(digits, action),
        );
        said.push(t('pznGueltigNichts'));
        return said.join(' ');
    }
    if (digits.length < 8) {
        ul.append(
            line(
                t(state.testData ? 'pznNurGemeldetUndTest' : 'pznNurGemeldet'),
                'pzn-nur-gemeldet',
            ),
        );
        if (!total) said.push(t('pznKeinVorschlag'));
    }
    return said.join(' ');
}
