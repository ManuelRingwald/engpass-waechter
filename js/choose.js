// Opening a substance or a PZN and going back to the overview (#56).

import { state } from './state.js';
import { staleNotice } from './data.js';
import { renderSubstance } from './detail.js';
import { $, el, endText, feedbackLine, t } from './dom.js';
import { openGuide, singleOf } from './guided-choice.js';
import { matches, pznValid } from './matching.js';
import { overview, reassurance } from './mine.js';
import { renderView } from './navigation.js';
import { pharmacyEntry } from './pharmacies.js';
import {
    markSeenPzn,
    myPzn,
    openNewPzn,
    removePzn,
    renamePzn,
    reportForPzn,
    testProductCard,
} from './pzn.js';
import { testProduct } from './testdata.js';
import { badge, dataAttrs, levelOf } from './ui.js';
import { markSeen, myEntry } from './watchlist.js';

// Goes back to the overview; through the browser history when a detail page was pushed.
export function toOverview() {
    if (history.state && history.state.ew === 'detail') history.back();
    else {
        overview();
        window.scrollTo(0, 0);
    }
}
// Opens a substance: the guided choice when there is something to choose, otherwise the detail page.
export function choose(w) {
    $('#suche').blur();
    if (!(history.state && history.state.ew === 'detail')) history.pushState({ ew: 'detail' }, '');
    // Guided choice (#18) when there is something to choose: single products reported, no own choice saved yet and no
    // strength from the search. Otherwise straight to the detail page as before.
    const entry = myEntry(w);
    const suggestion = state.strengthHint && state.strengthHint.w === w ? state.strengthHint : null;
    if (
        state.daily &&
        state.rules &&
        !(suggestion && suggestion.staerke) &&
        !(entry && entry.auswahl) &&
        singleOf(w).length
    ) {
        openGuide(w, { form: suggestion ? suggestion.form : null });
        return;
    }
    renderSubstance(w);
    markSeen(w);
    window.scrollTo(0, 0);
}
// Opens the detail page of a product saved by its PZN.
export function choosePzn(p) {
    $('#suche').blur();
    if (!(history.state && history.state.ew === 'detail')) history.pushState({ ew: 'detail' }, '');
    const core = $('#kern');
    core.textContent = '';
    state.selected = null;
    state.pznNumber = p;
    state.guide = null;
    state.newPzn = null;
    state.pharmacyView = null;
    const saved = myPzn(p);
    const card = el(
        'div',
        { class: 'karte statuskarte' },
        el(
            'div',
            { class: 'kopfzeile' },
            el('h1', { class: 'ueberschrift' }, saved ? saved.name : `PZN ${p}`),
        ),
        saved ? el('p', { class: 'leise' }, t('pznMeta', { pzn: p })) : null,
        staleNotice(),
    );
    const headerRow = card.firstChild;
    if (!pznValid(p)) {
        card.append(
            el(
                'p',
                {},
                'Diese PZN ist nicht gültig, die Prüfziffer passt nicht. Schau bitte noch einmal auf die 8 Ziffern auf der Packung.',
            ),
        );
    } else {
        const m = state.daily && state.daily.meldungen.find((x) => x.pzn === p);
        if (!state.daily) {
            headerRow.append(badge('info'));
            card.append(el('p', {}, t('datenFehlen')));
        } else if (!m) {
            headerRow.append(badge('gut'));
            card.append(
                el(
                    'p',
                    { class: 'status kernaussage', ...dataAttrs('bfarm', state.daily.abgerufen) },
                    `Für PZN ${p} ist beim BfArM derzeit kein Lieferengpass gemeldet.`,
                ),
                el('p', { class: 'leise' }, t('keineMeldungZusatz')),
            );
        } else {
            const w = state.searchIndex.find((e) => e.typ === 'wirkstoff' && matches(e.w, m));
            headerRow.append(badge(levelOf([m])));
            card.append(
                el(
                    'p',
                    { class: 'status kernaussage', ...dataAttrs('bfarm', state.daily.abgerufen) },
                    `${m.name}: Lieferengpass beim BfArM gemeldet.`,
                ),
                m.ende ? el('p', { class: 'zeitraum' }, endText(m.ende)) : null,
                reassurance(),
                w
                    ? el(
                          'div',
                          { class: 'knopfreihe' },
                          el(
                              'button',
                              {
                                  type: 'button',
                                  class: 'knopf zweit',
                                  onclick: () => choose(w.w),
                              },
                              `Alle Meldungen zu ${w.w.n}`,
                          ),
                      )
                    : null,
            );
        }
    }
    core.append(card);
    // No report for this pack: the product from the test data of this device, if there is one (#79).
    const tp = pznValid(p) && !reportForPzn(p) ? testProduct(p) : null;
    if (tp) core.append(el('div', { class: 'karte' }, testProductCard(p, tp, true)));
    // Pharmacies (#15): asking is possible here too; highlighted when a pack is reported.
    if (state.daily && pznValid(p))
        core.append(
            el(
                'div',
                { class: 'karte' },
                pharmacyEntry(!!reportForPzn(p), () => choosePzn(p)),
            ),
        );
    // My product (#18): rename and remove without touching other entries; otherwise „Als mein Produkt merken“.
    if (saved) {
        markSeenPzn(p);
        const field = el('input', {
            type: 'text',
            id: 'pzn-umbenennen',
            autocomplete: 'off',
            value: saved.name,
        });
        core.append(
            el(
                'div',
                { class: 'karte' },
                el('label', { class: 'feldtitel', for: 'pzn-umbenennen' }, t('pznName')),
                field,
                el(
                    'div',
                    { class: 'knopfreihe' },
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'knopf',
                            onclick: () => renamePzn(p, field.value),
                        },
                        t('pznUmbenennen'),
                    ),
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'knopf zweit',
                            onclick: () => removePzn(p),
                        },
                        t('pznEntfernen'),
                    ),
                ),
            ),
        );
    } else if (state.daily && pznValid(p)) {
        const m = state.daily.meldungen.find((x) => x.pzn === p);
        core.append(
            el(
                'div',
                { class: 'knopfreihe' },
                el(
                    'button',
                    {
                        type: 'button',
                        class: 'knopf zweit',
                        onclick: () =>
                            openNewPzn({
                                pzn: p,
                                name: m ? m.name : '',
                                zurueck: () => choosePzn(p),
                            }),
                    },
                    t('pznAlsMeins'),
                ),
            ),
        );
    }
    if (state.feedback) {
        core.append(feedbackLine(state.feedback));
        state.feedback = null;
    }
    renderView();
    window.scrollTo(0, 0);
}
