// Guided choice (#18): substance → strength → form → reported products (regeln.json → abgleich.gefuehrt).

import { CLASSIFY, state, STORAGE_KEYS, STRENGTH } from './state.js';
import { toOverview } from './choose.js';
import { staleNotice } from './data.js';
import { selectionCard } from './detail-parts.js';
import { $, el, feedbackLine, norm, replaceKeepingInput, saveSetting, t } from './dom.js';
import { productList } from './guided-result.js';
import { formGroup, reportsFor } from './matching.js';
import { overview } from './mine.js';
import { DONT_KNOW, NOT_LISTED, renderView } from './navigation.js';
import { isPznEntry } from './pzn.js';
import { dataAttrs } from './ui.js';
import { markSeen, myEntry, myList } from './watchlist.js';

export const singleOf = (w) =>
    reportsFor(w).filter((m) => !CLASSIFY.istKombination(m, w, state.rules));
// Reads the first number of a strength text as a number (German decimal comma).
const numberOf = (text) =>
    Number(
        String(text)
            .match(/\d[\d.]*(?:,\d+)?/)[0]
            .replace(/\./g, '')
            .replace(',', '.'),
    );
// Strengths of the reported single products (only those read safely), sorted by number.
function reportedStrengths(ms) {
    const byKey = new Map();
    for (const m of ms) {
        const st = STRENGTH.staerkeVon(m.name);
        // Without a unit in the report only the number is shown; one sentence below explains it (#41).
        if (st && !st.unsicher && !byKey.has(st.text))
            byKey.set(st.text, {
                text: st.text,
                label: st.ohneEinheit ? st.text : STRENGTH.anzeige(st),
                withoutUnit: st.ohneEinheit,
            });
    }
    return [...byKey.values()].sort(
        (a, b) => numberOf(a.text) - numberOf(b.text) || a.text.localeCompare(b.text, 'de'),
    );
}
// True when the strength of a report cannot be read safely.
const unclearStrength = (m) => {
    const st = STRENGTH.staerkeVon(m.name);
    return !st || st.unsicher;
};
// The sentence under strengths without a unit: the usual unit only where regeln.json names one for the substance.
function withoutUnitNote(w) {
    const usual = state.rules.abgleich.ueblicheEinheit.liste.find((u) =>
        norm(w.n).startsWith(norm(u.wirkstoff)),
    );
    return el(
        'p',
        { class: 'leise', id: 'staerke-ohne-einheit', 'data-testid': 'staerke-ohne-einheit' },
        usual
            ? t('staerkeOhneEinheitUeblich', {
                  wirkstoff: w.n,
                  wort: usual.wort,
                  einheit: usual.einheit,
              })
            : t('staerkeOhneEinheit'),
    );
}
// Own input of number and unit inside the question card (#41): no second card. The frozen check 09 expects the
// number field right on the strength question, so it stays here, below the reported strengths.
function ownStrengthPart(w) {
    const card = selectionCard(w, [], myEntry(w));
    const part = el('div', { class: 'trenner selbst-eingeben', id: 'auswahl' });
    card.removeAttribute('id');
    card.querySelector('h2').textContent = t('selbstEingebenTitel');
    card.querySelector('p.leise').textContent = t('selbstEingeben');
    part.append(...card.childNodes);
    return part;
}
const realChoice = (x) => (x && x !== NOT_LISTED && x !== DONT_KNOW ? x : null);
// Reports for the chosen strength (for the form question): matching or not safely assignable.
function toStrength(ms, strength) {
    if (strength === NOT_LISTED) return ms.filter(unclearStrength);
    if (!realChoice(strength)) return ms;
    return ms.filter((m) => STRENGTH.vergleiche(m.name, strength) !== 'andere');
}
const reportedForms = (ms) =>
    [...new Set(ms.map((m) => formGroup(m.form)))].sort((a, b) => a.localeCompare(b, 'de'));
// Result of the choice: classified as everywhere (einordnung.js). „Meine ist nicht dabei“: only what cannot be assigned
// safely.
export function guideResult(f) {
    const a = { staerke: realChoice(f.staerke), form: realChoice(f.form) };
    const r = CLASSIFY.teile(
        reportsFor(f.w),
        { ...f.w, auswahl: a.staerke || a.form ? a : null },
        state.rules,
    );
    if (f.staerke === NOT_LISTED) {
        r.unklar = [...r.passt, ...r.unklar].filter(unclearStrength);
        r.passt = [];
    }
    if (f.form === NOT_LISTED) {
        const open = (m) => !m.form || formGroup(m.form) === 'Sonstige';
        r.unklar = [...r.passt, ...r.unklar].filter(open);
        r.passt = [];
    }
    r.betroffen = [...r.passt, ...r.unklar];
    return { a, r };
}
// Starts the guided choice for a substance, optionally with a preset form.
export function openGuide(w, preset = {}) {
    state.guide = {
        w,
        schritt: 'staerke',
        staerke: null,
        form: preset.form || null,
        formGefragt: false,
        offen: null,
    };
    renderGuide();
}
// Takes the chosen strength and moves on to the form question or the result.
function chooseStrength(x) {
    const f = state.guide;
    f.staerke = x;
    f.offen = null;
    const forms = reportedForms(toStrength(singleOf(f.w), x));
    if (f.form && (forms.includes(f.form) || f.form === NOT_LISTED || f.form === DONT_KNOW)) {
        f.formGefragt = false;
        f.schritt = 'liste';
    } else if (forms.length > 1 && x !== NOT_LISTED) {
        f.form = null;
        f.formGefragt = true;
        f.schritt = 'form';
    } else {
        f.form = x === NOT_LISTED ? null : forms[0] || null;
        f.formGefragt = false;
        f.schritt = 'liste';
    }
    renderGuide();
}
// Takes the chosen form and shows the result.
function chooseForm(x) {
    state.guide.form = x;
    state.guide.offen = null;
    state.guide.schritt = 'liste';
    renderGuide();
}
// Goes one step back in the guided choice, or back to the overview from the first step.
export function guideBack() {
    const f = state.guide;
    if (f.schritt === 'liste' && f.formGefragt) f.schritt = 'form';
    else if (f.schritt === 'liste' || f.schritt === 'form') {
        f.schritt = 'staerke';
        f.form = null;
    } else {
        toOverview();
        return;
    }
    renderGuide();
}
// Creates an option button of the guided choice; aria-pressed marks the active one.
const optionButton = (text, active, onclick) =>
    el(
        'button',
        {
            type: 'button',
            class: `knopf ${active ? '' : 'zweit'}`.trim(),
            'aria-pressed': String(!!active),
            onclick,
        },
        text,
    );
// Draws the current step of the guided choice: strength, form or the result.
// Last drawn guided choice: signature of the built content and its first element (#65).
let lastGuide = null;
export function renderGuide({ keepScroll = false, keepInputs = false } = {}) {
    const f = state.guide;
    const w = f.w;
    state.selected = null;
    state.pznNumber = null;
    state.newPzn = null;
    const core = $('#kern');
    // Built apart first: a redraw after new daily data replaces only what changed (#65).
    const fresh = el('div');
    const asOf = state.daily.abgerufen;
    if (f.schritt === 'staerke' || f.schritt === 'form') {
        const isStrength = f.schritt === 'staerke';
        const strengths = isStrength ? reportedStrengths(singleOf(w)) : [];
        const options = isStrength
            ? strengths.map((x) => [x.text, x.label])
            : reportedForms(toStrength(singleOf(w), f.staerke)).map((g) => [g, g]);
        const chosenOption = isStrength ? f.staerke : f.form;
        const choosing = isStrength ? chooseStrength : chooseForm;
        fresh.append(
            el(
                'div',
                { class: 'karte frage' },
                el(
                    'p',
                    { class: 'frage-wirkstoff' },
                    isStrength ? w.n : `${w.n} ${realChoice(f.staerke) || ''}`.trim(),
                ),
                el(
                    'h1',
                    { class: 'ueberschrift' },
                    t(isStrength ? 'staerkeFrage' : 'formFrageGefuehrt'),
                ),
                isStrength
                    ? el(
                          'p',
                          { class: 'leise' },
                          t(
                              strengths.some((x) => x.withoutUnit)
                                  ? 'staerkeFrageHilfeOhneEinheit'
                                  : 'staerkeFrageHilfe',
                          ),
                      )
                    : null,
                el(
                    'div',
                    {
                        class: 'chips wahl',
                        role: 'group',
                        'aria-label': t(isStrength ? 'staerkeFrage' : 'formFrageGefuehrt'),
                        // VoiceOver reads the explanation with the bare numbers (#22).
                        'aria-describedby': strengths.some((x) => x.withoutUnit)
                            ? 'staerke-ohne-einheit'
                            : null,
                    },
                    options.map(([amount, text]) =>
                        optionButton(text, chosenOption === amount, () => choosing(amount)),
                    ),
                    optionButton(t('nichtDabei'), chosenOption === NOT_LISTED, () =>
                        choosing(NOT_LISTED),
                    ),
                    optionButton(t('weissNicht'), chosenOption === DONT_KNOW, () =>
                        choosing(DONT_KNOW),
                    ),
                ),
                strengths.some((x) => x.withoutUnit) ? withoutUnitNote(w) : null,
                el(
                    'p',
                    { class: 'leise', ...dataAttrs('bfarm', asOf) },
                    t(isStrength ? 'staerkeFrageHinweis' : 'formFrageHinweis'),
                ),
                staleNotice(),
                isStrength ? ownStrengthPart(w) : null,
            ),
        );
    } else {
        fresh.append(...productList(f));
    }
    if (state.feedback) {
        fresh.append(feedbackLine(state.feedback));
        state.feedback = null;
    }
    // Compare with the last built content, not with the DOM (protectUnderBar() adds classes there afterwards).
    const sig = fresh.innerHTML;
    const unchanged =
        keepInputs &&
        lastGuide &&
        lastGuide.sig === sig &&
        core.firstElementChild === lastGuide.first;
    if (!unchanged) {
        if (keepInputs) replaceKeepingInput(core, fresh);
        else core.replaceChildren(...fresh.childNodes);
        lastGuide = { sig, first: core.firstElementChild };
    }
    renderView();
    if (!keepScroll) window.scrollTo(0, 0);
}
// „Alle überwachen“: save substance + strength + form like the previous choice.
export function watchAll() {
    const f = state.guide;
    const { a } = guideResult(f);
    const list = myList();
    let e = list.find((x) => !isPznEntry(x) && norm(x.n) === norm(f.w.n));
    if (!e) {
        e = { n: f.w.n, atc: f.w.atc, a: (f.w.a || []).slice(0, 8) };
        list.push(e);
    }
    e.auswahl = a.staerke || a.form ? { staerke: a.staerke, form: a.form, v: 3 } : null;
    if (f.form === DONT_KNOW || f.staerke === DONT_KNOW) e.formGefragt = true;
    saveSetting(STORAGE_KEYS.meine, list);
    markSeen(f.w);
    state.feedback = t('ueberwacht');
    showAfterSave();
}
// Returns to „Meine“ after saving and shows the feedback once.
export function showAfterSave() {
    const text = state.feedback;
    state.feedback = null;
    state.view = 'meine';
    // Back to the overview without navigation (history.back() would redraw once more afterwards and lose the feedback).
    if (history.state && history.state.ew === 'detail') history.replaceState(null, '');
    overview();
    window.scrollTo(0, 0);
    if (text) $('#kern').prepend(feedbackLine(text));
}
