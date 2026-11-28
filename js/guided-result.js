// Guided choice (#18), last step: the reported products for the chosen strength and form, with „Mein Produkt über
// die PZN hinzufügen“ and, for „Meine ist nicht dabei“, the own input of the strength (#41).

import { CLASSIFY, state } from './state.js';
import { staleNotice } from './data.js';
import { selectionCard } from './detail-parts.js';
import { el, endText, plural, t } from './dom.js';
import { guideResult, renderGuide } from './guided-choice.js';
import { products, pznValid } from './matching.js';
import { NOT_LISTED } from './navigation.js';
import { openNewPzn } from './pzn.js';
import { badge, dataAttrs, levelOf, sym } from './ui.js';
import { myEntry } from './watchlist.js';

// Result: header card, reported products (per product and manufacturer), note, „Mein Produkt über die PZN hinzufügen“.
export function productList(f) {
    const w = f.w;
    const { a, r } = guideResult(f);
    const asOf = state.daily.abgerufen;
    const title = [w.n, [a.staerke, a.form].filter(Boolean).join(' · ')].filter(Boolean).join(' ');
    const u = CLASSIFY.urteil(r);
    const [level, word] = {
        betroffen: [levelOf(r.passt)],
        unklar: ['info', 'Bitte vergleichen'],
        nurKombination: ['info', t('nurKombinationMarke')],
        kein: ['gut'],
    }[u];
    // One entry per product (name and manufacturer) with all PZN.
    const byKey = new Map();
    for (const m of r.betroffen) {
        const k = `${m.name}|${m.inhaber}`;
        if (!byKey.has(k))
            byKey.set(k, {
                name: m.name,
                hersteller: m.inhaber || 'Hersteller nicht angegeben',
                meldungen: [],
                unklar: false,
            });
        const p = byKey.get(k);
        p.meldungen.push(m);
        if (r.unklar.includes(m)) p.unklar = true;
    }
    const products = [...byKey.values()];
    const makers = new Set(products.map((p) => p.hersteller)).size;
    const coreSentence = r.passt.length
        ? t('listeGemeldet', {
              anzahl: products.length,
              produktWort: plural(products.length, 'Produkt', 'Produkte'),
              hersteller: makers,
              herstellerWort: plural(makers, 'Hersteller', 'Herstellern'),
          }).replace('von 1 Hersteller ', 'von einem Hersteller ')
        : r.unklar.length
          ? t('listeUnklar')
          : t('listeNichts');
    const header = el(
        'div',
        { class: 'karte statuskarte' },
        el(
            'div',
            { class: 'kopfzeile' },
            el('h1', { class: 'ueberschrift' }, title),
            badge(level, word),
        ),
        staleNotice(),
        el('p', { class: 'status kernaussage', ...dataAttrs('bfarm', asOf) }, coreSentence),
        r.kombination.length
            ? el(
                  'p',
                  { class: 'leise' },
                  t('auchGetrennt', { produkte: guideProducts(r.kombination, w) }),
              )
            : null,
    );
    const parts = [header];
    if (products.length) {
        const ul = el('ul', { class: 'zeilen produkte' });
        products.forEach((p, i) => {
            const open = f.offen === i;
            const pzns = [
                ...new Set(p.meldungen.map((m) => m.pzn).filter((x) => x && pznValid(x))),
            ];
            const ends = [
                ...new Set(
                    p.meldungen
                        .map((m) => m.ende)
                        .filter(Boolean)
                        .map((x) => x.slice(0, 10)),
                ),
            ].sort();
            const meta = t('produktMeta', {
                hersteller: p.hersteller,
                anzahl: pzns.length || p.meldungen.length,
                packungWort: plural(pzns.length || p.meldungen.length, 'Packung', 'Packungsgrößen'),
            });
            const details = open
                ? el(
                      'div',
                      { class: 'produkt-details', id: `produkt-${i}` },
                      pzns.length ? el('p', {}, `PZN ${pzns.join(', ')}`) : null,
                      ends.length
                          ? el('p', { class: 'leise' }, ends.map(endText).join(' · '))
                          : null,
                      p.unklar ? el('p', { class: 'leise' }, t('produktUnklar')) : null,
                      el(
                          'button',
                          {
                              type: 'button',
                              class: 'knopf zweit',
                              onclick: () =>
                                  openNewPzn({
                                      pzn: pzns[0] || '',
                                      name: p.name,
                                      zurueck: () => renderGuide(),
                                  }),
                          },
                          t('dasIstMeins'),
                      ),
                  )
                : null;
            ul.append(
                el(
                    'li',
                    {},
                    el(
                        'button',
                        {
                            type: 'button',
                            class: 'zeile',
                            'aria-expanded': String(open),
                            'aria-controls': `produkt-${i}`,
                            onclick: () => {
                                // Only the row opens or closes (#22): no jump to the top, focus stays on it.
                                const focused = document.activeElement;
                                const hadFocus = focused && focused.closest('.produkte');
                                f.offen = open ? null : i;
                                renderGuide({ keepScroll: true });
                                const rows = document.querySelectorAll(
                                    '#kern .produkte button.zeile',
                                );
                                if (hadFocus && rows[i]) rows[i].focus({ preventScroll: true });
                            },
                        },
                        el(
                            'span',
                            { class: 'mitte' },
                            el('span', { class: 'name' }, p.name),
                            el('span', { class: 'meta' }, meta),
                            p.unklar ? badge('info', 'Bitte vergleichen') : null,
                        ),
                        sym('pfeil', open ? 'gedreht' : 'spiegeln'),
                    ),
                    details,
                ),
            );
        });
        parts.push(
            el(
                'div',
                { class: 'karte liste' },
                el('h2', { class: 'zwischentitel listen-titel' }, t('listeTitel')),
                ul,
            ),
        );
    }
    parts.push(el('p', { class: 'hinweis-info' }, sym('info'), el('span', {}, t('listeHinweis'))));
    parts.push(
        el(
            'p',
            { class: 'unter-liste' },
            el(
                'button',
                {
                    type: 'button',
                    class: 'link-knopf',
                    'data-testid': 'pzn-hinzufuegen',
                    onclick: () => openNewPzn({ zurueck: () => renderGuide() }),
                },
                t('pznHinzufuegen'),
            ),
        ),
    );
    // Strength not listed: enter exactly the own strength so that „Alle überwachen“ means it.
    if (f.staerke === NOT_LISTED) {
        const card = selectionCard(w, [], myEntry(w));
        card.querySelector('h2').textContent = t('selbstEingebenTitel');
        card.querySelector('p.leise').textContent = t('selbstEingebenNichtDabei');
        parts.push(card);
    }
    return parts;
}
const guideProducts = (ms, w) => products(ms, w, { pzn: false }, 3);
