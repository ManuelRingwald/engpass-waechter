// Parts of the detail page: expected end per manufacturer, timeline and the card for the own strength/form (#56).

import { CLASSIFY, state, STRENGTH } from './state.js';
import { el, formatDate, isPast, plural, t } from './dom.js';
import { formGroup, matches, selectionText } from './matching.js';
import { historyOf } from './news.js';
import { openNewPzn } from './pzn.js';
import { canScan, openScanner } from './scan.js';
import { sym } from './ui.js';
import { saveSelection } from './watchlist.js';

// Expected end per manufacturer (regeln.json → abgleich.endeJeHersteller), not just the latest of the group.
export function endByMaker(reports) {
    const byKey = new Map();
    for (const m of reports) {
        const h = m.inhaber || 'Hersteller nicht angegeben';
        if (!byKey.has(h)) byKey.set(h, { enden: [], n: 0 });
        byKey.get(h).n++;
        if (m.ende) byKey.get(h).enden.push(m.ende);
    }
    const rows = [...byKey]
        .map(([h, { enden: ends, n }]) => {
            const e = [...new Set(ends.map((x) => x.slice(0, 10)))].sort();
            const until = (x) =>
                isPast(x) ? t('endeVorbei', { datum: formatDate(x) }) : `bis ${formatDate(x)}`;
            const when = !e.length
                ? 'kein Ende angegeben'
                : e.length === 1
                  ? until(e[0])
                  : `${until(e[0])} bzw. ${until(e[e.length - 1])}`;
            return [
                e[0] || '9999',
                el('li', {}, `${h}: ${when} (${n} ${plural(n, 'Meldung', 'Meldungen')})`),
            ];
        })
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((z) => z[1]);
    return el(
        'div',
        {},
        el('p', {}, t('endeHersteller')),
        el('ul', { class: 'hersteller-liste' }, rows),
    );
}
// Builds the timeline of postponed expected ends from the history of the reports.
export function timeline(reports) {
    const rows = [];
    for (const m of reports) {
        const v = historyOf(m);
        if (!v || v.endeVerlauf.length < 2) continue;
        for (let i = 1; i < v.endeVerlauf.length; i++) {
            rows.push([
                v.endeVerlauf[i][0],
                el(
                    'p',
                    { class: 'leise' },
                    t('verschiebung', {
                        von: formatDate(v.endeVerlauf[i - 1][1]),
                        nach: formatDate(v.endeVerlauf[i][1]),
                        am: formatDate(v.endeVerlauf[i][0]),
                    }),
                ),
            ]);
        }
    }
    return rows
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 4)
        .map((z) => z[1]);
}
// Own strength and form: own section, label above the field, option „weiß nicht“.
export function selectionCard(w, reports, entry) {
    const a = (entry && entry.auswahl) || {};
    const card = el(
        'div',
        { class: 'karte', id: 'auswahl' },
        el('h2', { class: 'zwischentitel' }, t('auswahlTitel')),
        el('p', { class: 'leise' }, t('auswahlHilfe')),
    );
    const suggestions = new Map();
    for (const m of reports.filter((x) => !CLASSIFY.istKombination(x, w, state.rules))) {
        const st = STRENGTH.staerkeVon(m.name);
        const fg = formGroup(m.form);
        if (st && !st.unsicher)
            suggestions.set(`${st.text}|${fg}`, { staerke: st.text, form: fg, v: 2 });
    }
    if (suggestions.size) {
        card.append(
            el('p', { class: 'feldtitel' }, 'Schnell wählen – aus den Meldungen:'),
            el(
                'div',
                { class: 'chips' },
                [...suggestions.values()].slice(0, 8).map((v) =>
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'knopf zweit',
                            onclick: () => saveSelection(w, v),
                        },
                        selectionText(v),
                    ),
                ),
            ),
        );
    }
    // Strength as a number plus a choice of unit (no free text any more, regeln.json → abgleich.eingabe).
    const suggestion =
        state.strengthHint && state.strengthHint.w === w && !a.staerke ? state.strengthHint : null;
    const previous = (a.staerke && STRENGTH.teileAuf(a.staerke)) ||
        (suggestion && STRENGTH.teileAuf(suggestion.staerke)) || { zahl: '', einheit: '' };
    const number = el('input', {
        type: 'text',
        id: 'eigene-zahl',
        inputmode: 'decimal',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: 'z. B. 16',
        value: previous.zahl,
    });
    const units = [...state.rules.abgleich.einheitenAuswahl];
    if (previous.einheit && !units.includes(previous.einheit)) units.push(previous.einheit);
    const unit = el(
        'select',
        { id: 'eigene-einheit' },
        el('option', { value: '' }, 'weiß nicht'),
        units.map((x) => el('option', { value: x, selected: x === previous.einheit }, x)),
    );
    const formValue = a.form || (suggestion && suggestion.form) || '';
    const form = el(
        'select',
        { id: 'eigene-form' },
        el('option', { value: '' }, 'weiß nicht'),
        state.rules.formGruppen.map((g) =>
            el('option', { value: g.name, selected: g.name === formValue }, g.name),
        ),
    );
    const error = el(
        'p',
        { class: 'rueckmeldung fehler', role: 'alert', hidden: true, id: 'eigene-zahl-fehler' },
        t('zahlUngueltig'),
    );
    // Checks the entered strength and saves it together with the chosen form.
    const store = () => {
        const z = number.value.trim();
        if (z && !/^\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?$/.test(z)) {
            error.hidden = false;
            // The field names its error (#22, WCAG 3.3.1).
            number.setAttribute('aria-invalid', 'true');
            number.setAttribute('aria-describedby', 'eigene-zahl-fehler');
            number.focus();
            return;
        }
        // The number field has no thousands separator: dot and comma are decimal marks („0.625“ = 0,625).
        saveSelection(w, {
            staerke: z
                ? STRENGTH.staerkeText(z.replace(/\s+/g, '').replace(/\./g, ','), unit.value)
                : null,
            form: form.value || null,
        });
    };
    card.append(
        el(
            'div',
            { class: 'eingabe-bereich' },
            el(
                'div',
                { class: 'zahl-einheit' },
                el(
                    'div',
                    {},
                    el('label', { class: 'feldtitel', for: 'eigene-zahl' }, 'Stärke (Zahl)'),
                    number,
                ),
                el(
                    'div',
                    {},
                    el('label', { class: 'feldtitel', for: 'eigene-einheit' }, 'Einheit'),
                    unit,
                ),
            ),
            error,
            el('label', { class: 'feldtitel', for: 'eigene-form' }, 'Darreichungsform'),
            form,
            el(
                'div',
                { class: 'knopfreihe' },
                el(
                    'button',
                    { type: 'button', class: 'knopf', onclick: store },
                    'Auswahl speichern',
                ),
                a.staerke || a.form
                    ? el(
                          'button',
                          {
                              type: 'button',
                              class: 'knopf zweit',
                              onclick: () => saveSelection(w, null),
                          },
                          'Auswahl löschen',
                      )
                    : null,
            ),
        ),
    );
    return card;
}

// The cards at the end of the detail page: history of the last 30 days, the terms explained, origin and date.
export function closingCards(w) {
    const cards = [];
    if (state.history && state.history.meldungen) {
        const limit = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const removed = Object.values(state.history.meldungen).filter(
            (v) => v.entferntAm && v.entferntAm >= limit && matches(w, v),
        ).length;
        cards.push(
            el(
                'div',
                { class: 'karte' },
                el('h2', { class: 'zwischentitel' }, 'Verlauf'),
                el('p', {}, t('nichtMehrGemeldet', { anzahl: removed })),
                el(
                    'p',
                    { class: 'leise' },
                    t('lageVerlaufStart', { seit: formatDate(state.history.seit) }),
                ),
            ),
        );
    }
    cards.push(
        el(
            'details',
            { class: 'karte aufklapp' },
            el('summary', {}, 'Was heißt „Lieferengpass“?'),
            el('p', {}, t('lieferVsVersorgung')),
            ...Object.values(state.rules.einstufung).map((e) =>
                el('p', { class: 'leise' }, el('strong', {}, `${e.kurz}: `), e.text),
            ),
        ),
    );
    cards.push(
        el(
            'div',
            { class: 'karte' },
            el('h2', { class: 'zwischentitel' }, 'Herkunft und Stand'),
            el('p', { class: 'leise' }, t('herkunft')),
            el('p', { class: 'leise' }, t('luecken')),
            el('p', { class: 'leise' }, t('keineBeratung')),
        ),
    );
    return cards;
}
// Way to „Mein Produkt hinzufügen“ by PZN (#77), for a substance without reports: scan the pack or type the PZN. back
// redraws the substance when „Zurück“ is tapped in the PZN entry.
export function pznWayCard(back) {
    const scan = canScan()
        ? el(
              'button',
              {
                  type: 'button',
                  class: 'knopf zweit',
                  'data-testid': 'detail-pzn-scannen',
                  onclick: () => openScanner((p) => openNewPzn({ pzn: p, zurueck: back }), scan),
              },
              sym('kamera'),
              t('scanKnopf'),
          )
        : null;
    return el(
        'div',
        { class: 'karte', 'data-testid': 'pzn-weg' },
        el('h2', { class: 'zwischentitel' }, t('pznWegTitel')),
        el('p', { class: 'leise' }, t('pznWegText')),
        // Both as second buttons in a row with room between them: the accent stays with the main action in the bar.
        el(
            'div',
            { class: 'knopfreihe' },
            scan,
            el(
                'button',
                {
                    type: 'button',
                    class: 'knopf zweit',
                    'data-testid': 'detail-pzn-eintippen',
                    onclick: () => openNewPzn({ zurueck: back }),
                },
                t('pznEintippen'),
            ),
        ),
    );
}
