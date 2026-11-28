// The detail page of a substance: status, reports, guidance (#56).

import { CLASSIFY, state } from './state.js';
import { staleNotice } from './data.js';
import { closingCards, endByMaker, pznWayCard, selectionCard, timeline } from './detail-parts.js';
import { $, el, endText, feedbackLine, formatDate, plural, t } from './dom.js';
import {
    andList,
    formsToAsk,
    grouping,
    products,
    reportsFor,
    selectionText,
    unclearText,
} from './matching.js';
import { affected } from './mine.js';
import { renderView } from './navigation.js';
import { groupBy, historyOf } from './news.js';
import { pharmacyEntry } from './pharmacies.js';
import { badge, dataAttrs, levelFor } from './ui.js';
import { formUnknown, lastSeenText, myEntry, saveSelection, sinceLastSeen } from './watchlist.js';

// Layout: status card (name + badge, core statement, classification, period) → what you can do → your strength and form
// → reports by strength and form → history → explanation (collapsed) → source and date. Back/save in the bar at the
// bottom.
export function renderSubstance(w) {
    state.selected = w;
    state.pznNumber = null;
    state.guide = null;
    state.newPzn = null;
    state.pharmacyView = null;
    const core = $('#kern');
    core.textContent = '';
    if (!state.daily) {
        core.append(
            el(
                'div',
                { class: 'karte statuskarte' },
                el(
                    'div',
                    { class: 'kopfzeile' },
                    el('h1', { class: 'ueberschrift' }, w.n),
                    badge('info'),
                ),
                el('p', {}, t('datenFehlen')),
            ),
        );
        renderView();
        return;
    }
    const reports = reportsFor(w);
    const asOf = state.daily.abgerufen;
    const entry = myEntry(w);
    const a =
        entry && entry.auswahl && (entry.auswahl.staerke || entry.auswahl.form)
            ? entry.auswahl
            : null;
    const [level, word] = levelFor({ ...w, auswahl: a });
    const header = el(
        'div',
        { class: 'karte statuskarte' },
        el(
            'div',
            { class: 'kopfzeile' },
            el('h1', { class: 'ueberschrift' }, w.n),
            badge(level, word),
        ),
    );
    const addPart = (...xs) => {
        for (const x of xs) if (x) header.append(x);
    };
    addPart(staleNotice());
    const lastSeen = entry ? sinceLastSeen(w) : null;
    if (lastSeen) addPart(el('p', { class: 'marke neu' }, lastSeenText(lastSeen)));
    const stored = (entry && entry.auswahl) || {};
    const v = state.strengthHint && state.strengthHint.w === w ? state.strengthHint : null;
    if (v && (v.staerke ? !stored.staerke : v.form && !stored.form)) {
        addPart(
            el(
                'div',
                { class: 'vorschlag', 'data-testid': 'staerke-vorschlag' },
                el('p', {}, t('staerkeVorschlag', { staerke: selectionText(v) })),
                el(
                    'button',
                    {
                        type: 'button',
                        class: 'knopf breit',
                        onclick: () =>
                            saveSelection(w, {
                                staerke: v.staerke || stored.staerke || null,
                                form: v.form || stored.form || null,
                            }),
                    },
                    v.staerke
                        ? t('staerkeUebernehmen', { staerke: selectionText(v) })
                        : t('formUebernehmen', { form: v.form }),
                ),
            ),
        );
    }
    // Core statement (bold): with an own choice first for that choice, otherwise for the substance (regeln.json →
    // abgleich.einordnung).
    const e = grouping(w, a);
    const relevant = e.betroffen;
    // Adds the bold core statement to the status card.
    const statement = (text) =>
        addPart(
            el(
                'p',
                {
                    class: `status kernaussage${a ? ' eigen' : ''}`,
                    ...dataAttrs('bfarm', asOf),
                },
                text,
            ),
        );
    // Combinations and other forms separately, with product and action (#13).
    const separatedText = () =>
        new Set(e.getrennt.map((m) => `${CLASSIFY.produktName(m)}|${m.wirkstoffe}`)).size === 1
            ? t('nurGetrenntEins', { produkt: products(e.getrennt, w), wirkstoff: w.n })
            : t('nurGetrenntMehrere', { produkte: products(e.getrennt, w), wirkstoff: w.n });
    if (a) {
        const { passt: fits, unklar: unclear } = e;
        if (fits.length) {
            // For the own choice only name the manufacturers; several strengths/forms only if the choice covers
            // several.
            const h = new Set(fits.map((m) => m.inhaber).filter(Boolean)).size;
            // With strength and form it is one item (even if a report does not name the unit).
            const makersText =
                !(a.staerke && a.form) && groupBy(fits).length > 1
                    ? affected(fits)
                    : `${h === 1 ? 'einem Hersteller' : `${h} Herstellern`} (${fits.length} ${plural(fits.length, 'Meldung', 'Meldungen')})`;
            statement(t('auswahlGemeldet', { auswahl: selectionText(a), hersteller: makersText }));
        }
        if (unclear.length) {
            statement(
                `${fits.length ? 'Dazu: ' : `${t('deineAuswahl', { auswahl: selectionText(a) })}: `}${unclearText(unclear, a, 'unklarDetail', { produkte: products(unclear, w), wirkstoff: w.n })}`,
            );
        }
        if (!fits.length && !unclear.length) {
            statement(
                t(e.kombination.length ? 'auswahlNurKombination' : 'auswahlNichts', {
                    auswahl: selectionText(a),
                }),
            );
            if (e.getrennt.length)
                addPart(
                    el('p', { class: 'getrennt', ...dataAttrs('bfarm', asOf) }, separatedText()),
                );
            if (e.andereStaerke.length)
                addPart(
                    el(
                        'p',
                        dataAttrs('bfarm', asOf),
                        t('auswahlAndere', { betroffen: affected(e.andereStaerke) }),
                    ),
                );
        } else if (e.getrennt.length) {
            addPart(
                el(
                    'p',
                    { class: 'leise' },
                    t('auchGetrennt', { produkte: products(e.getrennt, w) }),
                ),
            );
        }
        if (e.einzel.length)
            addPart(
                el(
                    'p',
                    dataAttrs('bfarm', asOf),
                    t('meldungen', { wirkstoff: w.n, betroffen: affected(e.einzel) }),
                ),
            );
    } else if (e.passt.length) {
        statement(t('meldungen', { wirkstoff: w.n, betroffen: affected(e.passt) }));
        if (e.getrennt.length)
            addPart(
                el(
                    'p',
                    { class: 'leise' },
                    t('auchGetrennt', { produkte: products(e.getrennt, w) }),
                ),
            );
    } else if (e.getrennt.length) {
        statement(t('keineMeldungEinzel', { wirkstoff: w.n }));
        addPart(el('p', { class: 'getrennt', ...dataAttrs('bfarm', asOf) }, separatedText()));
    } else {
        statement(t('keineMeldung', { wirkstoff: w.n }));
    }
    // Ask once for the form instead of calling everything „unklar“ (regeln.json → abgleich.formFrage).
    const forms = formsToAsk(w, entry, e);
    if (forms.length) {
        addPart(
            el(
                'div',
                { class: 'vorschlag', 'data-testid': 'form-frage' },
                el('p', {}, t('formFrage', { wirkstoff: w.n })),
                el(
                    'div',
                    { class: 'chips' },
                    forms.map((g) =>
                        el(
                            'button',
                            {
                                type: 'button',
                                class: 'knopf zweit',
                                onclick: () =>
                                    saveSelection(w, {
                                        staerke: a ? a.staerke : null,
                                        form: g,
                                    }),
                            },
                            g,
                        ),
                    ),
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'knopf zweit',
                            onclick: () => formUnknown(w),
                        },
                        'Weiß nicht',
                    ),
                ),
            ),
        );
    }
    if (entry && entry.auswahl && entry.auswahl.neuEingeben) {
        addPart(
            el(
                'p',
                { class: 'status eigen', 'data-testid': 'staerke-neu' },
                t('staerkeNeu', { alt: entry.auswahl.alt || '' }),
            ),
        );
    }
    // Classification
    if (relevant.length) {
        const rating = ['verskri (auch versrel)', 'versrel', 'weder versrel noch verskri'].find(
            (x) => relevant.some((m) => m.einstufung === x),
        );
        addPart(
            rating && state.rules.einstufung[rating]
                ? el('p', {}, state.rules.einstufung[rating].text)
                : null,
            el('p', { class: 'leise' }, t('herstellerUnbekannt', { wirkstoff: w.n })),
        );
    }
    // Period (small)
    const begin = relevant
        .map((m) => m.beginn)
        .filter(Boolean)
        .sort()[0];
    const end = relevant
        .map((m) => m.ende)
        .filter(Boolean)
        .sort()
        .pop();
    if (begin || end) {
        addPart(
            el(
                'p',
                { class: 'zeitraum' },
                [
                    begin ? t('gemeldetSeit', { datum: formatDate(begin) }) : null,
                    end ? endText(end) : null,
                ]
                    .filter(Boolean)
                    .join(' · '),
            ),
        );
    }
    if (w.atc && w.atc.length) addPart(el('p', { class: 'zeitraum' }, `ATC ${w.atc.join(', ')}`));
    if (state.feedback) {
        addPart(feedbackLine(state.feedback));
        state.feedback = null;
    }
    core.append(header);

    // What you can do
    core.append(
        el(
            'div',
            { class: 'karte' },
            el(
                'h2',
                { class: 'zwischentitel' },
                relevant.length ? 'Was du tun kannst' : 'Gut zu wissen',
            ),
            el('p', {}, relevant.length ? t('wasTun') : t('keineMeldungZusatz')),
            pharmacyEntry(!!relevant.length, () => renderSubstance(w)),
        ),
    );

    core.append(selectionCard(w, reports, entry));
    // Nothing reported for the substance (#77): the own pack can still be remembered by its PZN, typed or scanned.
    if (!reports.length) core.append(pznWayCard(() => renderSubstance(w)));

    if (reports.length) {
        const list = el(
            'div',
            { class: 'karte' },
            el('h2', { class: 'zwischentitel' }, 'Gemeldet nach Stärke und Darreichungsform'),
        );
        for (const g of groupBy(reports, w)) {
            const makers = [...new Set(g.meldungen.map((m) => m.inhaber).filter(Boolean))];
            const beginGroup = g.meldungen
                .map((m) => m.beginn)
                .filter(Boolean)
                .sort()[0];
            const postponements = g.meldungen.reduce((s, m) => {
                const v = historyOf(m);
                return s + (v ? Math.max(0, v.endeVerlauf.length - 1) : 0);
            }, 0);
            const combination = g.kombination;
            const alternative = g.meldungen
                .map((m) =>
                    (m.alternative || '').replace(/\s*-?\s*Einreichungsnummer:\s*\d+/gi, '').trim(),
                )
                .find(Boolean);
            const reasons = [...new Set(g.meldungen.map((m) => m.grund).filter(Boolean))];
            list.append(
                el(
                    'div',
                    { class: 'gruppe', ...dataAttrs('bfarm', asOf) },
                    el('h3', {}, g.titel),
                    el(
                        'p',
                        {},
                        `${makers.length} ${plural(makers.length, 'Hersteller', 'Hersteller')}: ${makers.join(', ')} (${g.meldungen.length} ${plural(g.meldungen.length, 'Meldung', 'Meldungen')})`,
                    ),
                    combination
                        ? el(
                              'p',
                              { class: 'leise' },
                              `${t('kombinationMit', { partner: andList(combination) })}. ${t('kombinationHinweis', { wirkstoff: w.n })}`,
                          )
                        : null,
                    endByMaker(g.meldungen),
                    beginGroup
                        ? el(
                              'p',
                              { class: 'leise' },
                              t('gemeldetSeit', { datum: formatDate(beginGroup) }),
                          )
                        : null,
                    el(
                        'p',
                        { class: 'leise' },
                        postponements
                            ? t('endeVerschoben', { anzahl: postponements })
                            : t('endeNieVerschoben'),
                    ),
                    ...timeline(g.meldungen),
                    reasons.length
                        ? el('p', { class: 'leise' }, `Grund laut Meldung: ${reasons.join(', ')}`)
                        : null,
                    alternative
                        ? el('p', { class: 'leise' }, `Hinweis des Herstellers: ${alternative}`)
                        : null,
                    el(
                        'p',
                        { class: 'leise' },
                        `Präparate: ${[...new Set(g.meldungen.map((m) => m.name))].slice(0, 4).join(' · ')}${g.meldungen.length > 4 ? ' …' : ''}`,
                    ),
                ),
            );
        }
        core.append(list);
    }

    core.append(...closingCards(w));
    renderView();
}
