// The view „Meine“: overview of the watched substances and products with their status (#56).

import { CLASSIFY, notices, state, STORAGE_KEYS } from './state.js';
import { choose } from './choose.js';
import { staleNotice } from './data.js';
import { $, el, formatDate, plural, readSetting, saveSetting, t } from './dom.js';
import { dataReason } from './main.js';
import {
    formsToAsk,
    grouping,
    products,
    selectionOf,
    selectionText,
    unclearText,
} from './matching.js';
import { renderView } from './navigation.js';
import { groupBy, renderNews } from './news.js';
import { isPznEntry, pznRow } from './pzn.js';
import { editButton, endEditing, isEditing, sublineText, tile } from './mine-tiles.js';
import { arrow, badge, dataAttrs, levelFor, sym } from './ui.js';
import { lastSeenText, myEntry, myList, sinceLastSeen } from './watchlist.js';
import { showWhatsNewCard, whatsNewCard, whatsNewEntry } from './whats-new.js';

// Closes every detail page and draws the current main view.
export function overview() {
    state.selected = null;
    state.pznNumber = null;
    state.guide = null;
    state.newPzn = null;
    state.pharmacyView = null;
    if (state.view === 'neu') renderNews();
    else renderMine();
    renderView();
}
// Card shown when no daily data could be loaded yet.
export function noDataCard() {
    return el(
        'div',
        { class: 'karte' },
        el(
            'p',
            {},
            dataReason === 'defekt'
                ? t('datenFehlerhaftOhne')
                : notices.ausfall.size || notices.offline
                  ? t('datenFehlen')
                  : 'Die Tagesdaten werden geladen …',
        ),
    );
}
// Last drawn „Meine“: the signature of the built content and its first element, to tell whether it is still shown.
let lastMine = null;
// Draws „Meine“ – but only when the content really changed. Reloading the daily data redraws everything; replacing an
// unchanged list would drop a tap that is just landing on an entry (or the focus), so the old elements stay.
export function renderMine() {
    const core = $('#kern');
    const fresh = el('div');
    buildMine(fresh);
    // Compare with the last built content, not with the DOM (protectUnderBar() adds classes there afterwards).
    const sig = fresh.innerHTML;
    if (lastMine && lastMine.sig === sig && core.firstElementChild === lastMine.first) return;
    core.replaceChildren(...fresh.childNodes);
    lastMine = { sig, first: core.firstElementChild };
}
// Builds „Meine“ into a container: overall situation, the own substances and products with their status.
function buildMine(core) {
    const list = state.daily ? myList() : [];
    if (!list.length) endEditing();
    // Title over the full width; below it the number of entries and „Bearbeiten“ on the right (#86).
    core.append(
        el(
            'div',
            { class: 'meine-kopf' },
            el('h1', { class: 'titel' }, 'Meine Medikamente'),
            list.length
                ? el(
                      'div',
                      { class: 'meine-kopf-zeile' },
                      el('p', { class: 'leise unterzeile' }, sublineText(list.length)),
                      editButton(),
                  )
                : null,
        ),
    );
    if (showWhatsNewCard && whatsNewEntry) core.append(whatsNewCard());
    if (!state.daily) {
        core.append(noDataCard());
        return;
    }
    if (!list.length) {
        core.append(
            el(
                'div',
                { class: 'karte leer' },
                el('span', { class: 'bild' }, sym('lesezeichen')),
                el('h2', {}, 'Noch nichts gemerkt'),
                el('p', {}, t('meineLeer')),
            ),
        );
    } else {
        // role="list": Safari drops the role of a list without bullets; VoiceOver then says „Liste, 5 Objekte“.
        const ul = el('ul', {
            class: 'zeilen kacheln',
            role: 'list',
            'aria-label': t('meineListe'),
        });
        list.forEach((w, i) =>
            ul.append(tile(w, isPznEntry(w) ? pznRow(w) : row(w), i, list.length)),
        );
        core.append(
            el(
                'div',
                { class: 'karte meine-kacheln' },
                staleNotice(),
                isEditing() ? null : el('p', { class: 'kachel-hinweis' }, t('meineHinweis')),
                ul,
            ),
        );
    }
    core.append(overallStatus(list.length > 0));
}
// One row of an own substance: name, status, a second line if needed, badge and what is new since the last look.
function row(w) {
    const lastSeen = sinceLastSeen(w);
    const [level, word] = levelFor(w);
    const extra = myExtra(w);
    return el(
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
                    myStatus(w),
                ),
                extra ? el('span', { class: 'meta' }, extra) : null,
                badge(level, word),
                lastSeen ? el('span', { class: 'marke neu' }, lastSeenText(lastSeen)) : null,
            ),
            arrow(),
        ),
    );
}

// Counting: strengths or forms and manufacturers first, reports (packs) only in brackets.
export function affected(ms) {
    const g = groupBy(ms).length;
    const h = new Set(ms.map((m) => m.inhaber).filter(Boolean)).size;
    return t('betroffen', {
        gruppen: g,
        gruppenWort: plural(g, 'Stärke bzw. Form', 'Stärken bzw. Formen'),
        hersteller: h,
        herstellerWort: plural(h, 'Hersteller', 'Herstellern'),
        anzahl: ms.length,
        meldungWort: plural(ms.length, 'Meldung', 'Meldungen'),
    }).replace('von 1 Hersteller ', 'von einem Hersteller ');
}
// Explanation „Lieferengpass ≠ Versorgungsengpass“ (at most once per page): open in the first session, collapsible
// afterwards.
let explainedAtStart = null;
// Explanation „Lieferengpass ≠ Versorgungsengpass“: open the first time, collapsible afterwards.
export function reassurance() {
    if (explainedAtStart === null) explainedAtStart = readSetting(STORAGE_KEYS.erklaert, false);
    if (!explainedAtStart) {
        saveSetting(STORAGE_KEYS.erklaert, true);
        return el('p', {}, t('lieferVsVersorgung'));
    }
    return el(
        'details',
        { class: 'aufklapp' },
        el('summary', {}, t('wasHeisstDas')),
        el('p', {}, t('lieferVsVersorgung')),
    );
}
// Status line of an own entry, with a reminder when the strength must be entered again.
function myStatus(w) {
    const suffix = w.auswahl && w.auswahl.neuEingeben ? ` · ${t('staerkeNeuKurz')}` : '';
    return myStatusText(w) + suffix;
}
// Status text of an own entry, for the own choice of strength and form if there is one.
function myStatusText(w) {
    const a = selectionOf(w);
    const e = grouping(w, a);
    if (!a)
        return e.passt.length
            ? `Betroffen: ${affected(e.passt)}`
            : e.kombination.length
              ? t('nurKombinationStatus')
              : 'kein Lieferengpass gemeldet';
    const parts = [];
    if (e.passt.length) parts.push(`betroffen: ${affected(e.passt)}`);
    // Really unclear: with the product name next to it (#13). The sentence itself stays word for word (check 9).
    if (e.unklar.length)
        parts.push(`${unclearText(e.unklar, a)}: ${products(e.unklar, w, { pzn: false }, 2)}`);
    if (parts.length) return `${selectionText(a)} – ${parts.join('; ')}`;
    if (e.kombination.length) return `${selectionText(a)}: ${t('nurKombinationStatus')}`;
    const other = groupBy(e.andereStaerke).length;
    return `${selectionText(a)}: nichts gemeldet${other ? ` (betroffen sind andere Stärken: ${other})` : ''}`;
}
// Second line in „Meine“: what is reported separately („Gemeldet nur: Azur compositum Zäpfchen“) or the question for
// the form.
function myExtra(w) {
    const e = grouping(w);
    if (formsToAsk(w, myEntry(w), e).length) return t('formFrageKurz');
    if (!e.betroffen.length && e.getrennt.length)
        return t('meineNur', { produkte: products(e.getrennt, w, { pzn: false }, 2) });
    return null;
}
// Overall situation: number of affected substances and of critical reports.
function overallStatus(withList) {
    // Substances and reports kept apart (regeln.json → abgleich.gesamtlage).
    const criticalReports = state.daily.meldungen.filter(
        (m) => m.einstufung === 'verskri (auch versrel)',
    );
    // Substances by shortened name; combinations count for each component (regeln.json → abgleich.gesamtlage, #3).
    const tally = (ms) =>
        new Set(ms.flatMap((m) => CLASSIFY.kurzNamen(m, state.rules).map((k) => k.toLowerCase())))
            .size;
    const criticalSubstances = tally(criticalReports);
    const criticalText = t('lageKritisch', {
        kritischW: criticalSubstances.toLocaleString('de-DE'),
        wirkstoffWort: plural(criticalSubstances, 'Wirkstoff', 'Wirkstoffe'),
        kritischM: criticalReports.length.toLocaleString('de-DE'),
        meldungWort: plural(criticalReports.length, 'Meldung', 'Meldungen'),
    });
    const substances = tally(state.daily.meldungen);
    const number = t('gesamtlage', {
        wirkstoffe: substances.toLocaleString('de-DE'),
        anzahl: state.daily.anzahl.toLocaleString('de-DE'),
    });
    return el(
        'div',
        { class: 'karte' },
        el('h2', {}, t('lageTitel')),
        withList ? null : staleNotice(),
        // Number and sentence in one paragraph (#22): VoiceOver reads „282 Wirkstoffe betroffen …“ together.
        el(
            'p',
            { class: 'kennzahl-satz' },
            el(
                'span',
                { class: 'kennzahl', ...dataAttrs('bfarm', state.daily.abgerufen) },
                substances.toLocaleString('de-DE'),
            ),
            ' ',
            el('span', { class: 'status' }, number.replace(/^\S+\s/, '')),
        ),
        el('p', { class: 'leise' }, criticalText),
        historyRow(),
        reassurance(),
    );
}
// Line on the changes since the day before: new, no longer reported, expected end postponed.
export function historyRow() {
    const today =
        state.history && state.history.tage && state.history.tage[state.history.tage.length - 1];
    return state.history && state.history.tage && state.history.tage.length > 1
        ? el(
              'p',
              { class: 'leise' },
              t('lageVerlauf', {
                  neu: today.neu,
                  entfernt: today.entfernt,
                  verschoben: today.endeVerschoben,
              }),
          )
        : el(
              'p',
              { class: 'leise' },
              t('lageVerlaufStart', {
                  seit: formatDate(state.history ? state.history.seit : state.daily.abgerufen),
              }),
          );
}
