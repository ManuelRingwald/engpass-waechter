// „Testdaten“ under „Mehr“ (#79): load a file „PZN → Produkt“ from this device, see what is loaded, remove it. Only
// on this iPhone, only for testing; the file never leaves the device.

import { state } from './state.js';
import { $, announce, el, t } from './dom.js';
import { importTestData, removeTestData } from './testdata.js';
import { sym } from './ui.js';

let message = null;
// After loading or removing: success is announced and the focus stays on „Datei laden“; a problem gets the focus
// itself, so VoiceOver surely reads it (an announcement next to a focus change can get lost).
function settle(msg) {
    if (msg.ok) {
        announce(msg.text);
        const load = document.getElementById('testdaten-laden');
        if (load) load.focus();
    } else {
        const shown = document.getElementById('testdaten-meldung');
        if (shown) shown.focus();
    }
}
// Draws the card „Testdaten“ into „Mehr“ (once; redrawn after loading or removing).
export function renderTestDataCard() {
    if (!state.rules) return;
    const more = $('#mehr');
    let card = document.getElementById('testdaten');
    const fresh = el('div', { class: 'karte', id: 'testdaten', 'data-testid': 'testdaten' });
    const input = el('input', {
        type: 'file',
        accept: '.json,application/json',
        id: 'testdaten-datei',
        // Not shown and not in the tab order: „Datei laden“ opens it (a hidden field is no tiny touch target).
        hidden: '',
    });
    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        const r = await importTestData(file);
        message = r.error
            ? { text: t(r.error), ok: false }
            : { text: t('testdatenGespeichert'), ok: true };
        renderTestDataCard();
        settle(message);
    });
    const data = state.testData;
    fresh.append(
        el('h2', { class: 'zwischentitel', id: 'testdaten-titel' }, t('testdatenTitel')),
        el('p', { class: 'hinweis-info' }, sym('info'), el('span', {}, t('testdatenHinweis'))),
        el('p', { class: 'leise' }, t('testdatenErklaerung')),
        el(
            'p',
            { class: 'status', 'data-testid': 'testdaten-stand' },
            data
                ? t('testdatenGeladen', {
                      anzahl: data.anzahl.toLocaleString('de-DE'),
                      quellen: Object.values(data.quellen).join(', ') || '–',
                  })
                : t('testdatenKeine'),
        ),
        message
            ? el(
                  'p',
                  {
                      class: `hinweis-info ${message.ok ? 'gut' : 'achtung'}`,
                      id: 'testdaten-meldung',
                      'data-testid': 'testdaten-meldung',
                      tabindex: '-1',
                  },
                  sym(message.ok ? 'haken' : 'dreieck'),
                  el('span', {}, message.text),
              )
            : null,
        input,
        el(
            'div',
            { class: 'knopfreihe' },
            el(
                'button',
                {
                    type: 'button',
                    class: 'knopf zweit',
                    id: 'testdaten-laden',
                    'data-testid': 'testdaten-laden',
                    onclick: () => input.click(),
                },
                t('testdatenLaden'),
            ),
            data
                ? el(
                      'button',
                      {
                          type: 'button',
                          class: 'knopf zweit',
                          'data-testid': 'testdaten-entfernen',
                          onclick: async () => {
                              const removed = await removeTestData();
                              message = {
                                  text: t(removed ? 'testdatenEntfernt' : 'testdatenNichtEntfernt'),
                                  ok: removed,
                              };
                              renderTestDataCard();
                              settle(message);
                          },
                      },
                      t('testdatenEntfernen'),
                  )
                : null,
        ),
    );
    if (card) card.replaceWith(fresh);
    else {
        // Before the list with pharmacies, explanation and licences.
        const list = more.querySelector('.karte.liste');
        more.insertBefore(fresh, list);
    }
    card = fresh;
}
