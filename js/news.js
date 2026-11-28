// The view „Neuigkeiten“: what changed in the reports, grouped by week, with the history (#56).

import { CLASSIFY, state } from './state.js';
import { choose } from './choose.js';
import { staleNotice } from './data.js';
import { $, el, plural, t } from './dom.js';
import { renderInfections } from './infections.js';
import { matches, strengthOf } from './matching.js';
import { historyRow, noDataCard } from './mine.js';
import { isPznEntry, pznRow, sinceLastSeenPzn } from './pzn.js';
import { arrow, badge, dataAttrs, levelFor, sym } from './ui.js';
import { lastSeenText, myList, sinceLastSeen } from './watchlist.js';

// Draws „Neuigkeiten“: what changed in the reports and the infection figures.
export function renderNews() {
    const core = $('#kern');
    core.textContent = '';
    core.append(el('h1', { class: 'titel' }, 'Neuigkeiten'));
    if (!state.daily) {
        core.append(noDataCard());
        return;
    }
    core.append(el('h2', { class: 'abschnitt-titel' }, 'Für deine Medikamente'));
    const list = myList();
    if (!list.length) {
        core.append(
            el(
                'div',
                { class: 'karte leer' },
                el('span', { class: 'bild' }, sym('glocke')),
                el('p', {}, t('neuLeer')),
            ),
        );
    } else {
        const changed = list
            .map((w) => [w, isPznEntry(w) ? sinceLastSeenPzn(w.pzn) : sinceLastSeen(w)])
            .filter(([, b]) => b);
        if (!changed.length) {
            core.append(
                el(
                    'div',
                    { class: 'karte leer' },
                    el('span', { class: 'bild' }, sym('haken')),
                    el('p', {}, t('neuNichts')),
                ),
            );
        } else {
            const ul = el('ul', { class: 'zeilen' });
            for (const [w, b] of changed) {
                if (isPznEntry(w)) {
                    ul.append(pznRow(w, b));
                    continue;
                }
                const [level, word] = levelFor(w);
                ul.append(
                    el(
                        'li',
                        {},
                        el(
                            'button',
                            { type: 'button', class: 'zeile', onclick: () => choose(w) },
                            el(
                                'span',
                                { class: 'mitte' },
                                el('span', { class: 'name' }, w.n),
                                el(
                                    'span',
                                    { class: 'meta', ...dataAttrs('bfarm', state.daily.abgerufen) },
                                    lastSeenText(b),
                                ),
                                badge(level, word),
                            ),
                            arrow(),
                        ),
                    ),
                );
            }
            core.append(el('div', { class: 'karte liste' }, staleNotice(), ul));
        }
    }
    const general = el(
        'details',
        { class: 'karte aufklapp', open: state.generalOpen },
        // „Allgemein“ is a heading of its own (#22): the lists and figures inside belong to it, not to „Für deine
        // Medikamente“.
        el('summary', {}, el('h2', { class: 'aufklapp-titel' }, 'Allgemein')),
        historyRow(),
        historyWeek() || el('p', { class: 'leise' }, t('neuVerlaufFehlt')),
        el('div', { id: 'zusatz', class: 'abschnitt' }),
    );
    general.addEventListener('toggle', () => {
        state.generalOpen = general.open;
    });
    core.append(general);
    renderInfections();
}
// History of the last 7 days (requirement 3): new, no longer reported, end postponed – with a jump to the substance.
function historyWeek() {
    if (
        !state.history ||
        !state.history.meldungen ||
        !state.history.tage ||
        state.history.tage.length < 2
    )
        return null;
    const limit = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const entries = Object.values(state.history.meldungen);
    const added = entries.filter(
        (v) => v.erstGesehen > state.history.seit && v.erstGesehen >= limit,
    );
    const removed = entries.filter((v) => v.entferntAm && v.entferntAm >= limit);
    const shifted = entries.filter(
        (v) => v.endeVerlauf.length > 1 && v.endeVerlauf[v.endeVerlauf.length - 1][0] >= limit,
    );
    const box = el(
        'div',
        {},
        el(
            'p',
            {},
            t('letzteTage', {
                neu: added.length,
                entfernt: removed.length,
                verschoben: shifted.length,
            }),
        ),
    );
    // A titled list of at most 6 substances with their number of reports; null when empty.
    const list = (title, vs) => {
        if (!vs.length) return null;
        const names = new Map();
        for (const v of vs) {
            const target = state.searchIndex.find((e) => e.typ === 'wirkstoff' && matches(e.w, v));
            const k = target ? target.w.n : v.wirkstoffe || v.name;
            if (!names.has(k)) names.set(k, { w: target && target.w, n: 0 });
            names.get(k).n++;
        }
        const ul = el('ul', { class: 'zeilen' });
        for (const [name, { w, n }] of [...names].slice(0, 6)) {
            const count = `${n} ${plural(n, 'Meldung', 'Meldungen')}`;
            ul.append(
                el(
                    'li',
                    {},
                    w
                        ? el(
                              'button',
                              { type: 'button', class: 'zeile', onclick: () => choose(w) },
                              el(
                                  'span',
                                  { class: 'mitte' },
                                  el('span', { class: 'name' }, name),
                                  el('span', { class: 'meta' }, count),
                              ),
                              arrow(),
                          )
                        : el('p', { class: 'zeile' }, `${name} (${count})`),
                ),
            );
        }
        return el(
            'div',
            {},
            el('h3', { class: 'abschnitt' }, title),
            ul,
            names.size > 6 ? el('p', { class: 'leise' }, `… und ${names.size - 6} weitere`) : null,
        );
    };
    box.append(
        list('Neu gemeldet', added) || '',
        list('Nicht mehr gemeldet', removed) || '',
        list('Erwartetes Ende verschoben', shifted) || '',
    );
    return box;
}
// Groups by strength and form; with w also combinations separately („Kombination mit Codein und Coffein“).
export function groupBy(reports, w = null) {
    const groups = new Map();
    for (const m of reports) {
        const st = strengthOf(m.name) || 'Stärke nicht angegeben';
        const form = m.form || 'Darreichungsform nicht angegeben';
        const partner =
            w && CLASSIFY.istKombination(m, w, state.rules)
                ? CLASSIFY.partner(m, w, state.rules)
                : null;
        const k = `${st} · ${form}${partner ? ` · ${partner.join('+')}` : ''}`;
        if (!groups.has(k))
            groups.set(k, {
                titel: partner ? `${st} · ${form} · Kombination` : `${st} · ${form}`,
                meldungen: [],
                kombination: partner,
            });
        groups.get(k).meldungen.push(m);
    }
    return [...groups.values()].sort(
        (a, b) => !!a.kombination - !!b.kombination || b.meldungen.length - a.meldungen.length,
    );
}
export function historyOf(m) {
    return state.history && state.history.meldungen ? state.history.meldungen[m.id] : null;
}
