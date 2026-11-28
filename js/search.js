// The search view: empty state, hit list and the status shown for each hit (#56).

import { CLASSIFY, state } from './state.js';
import { choose } from './choose.js';
import { $, announce, el, norm, t } from './dom.js';
import { andList, grouping, matches, search, splitQuery } from './matching.js';
import { affected } from './mine.js';
import { buildPznHits, pznDigits } from './pzn-search.js';
import { arrow, badge, levelOf, sym } from './ui.js';

// Shows the hints of the empty search, built once.
export function renderSearchEmpty() {
    const box = $('#such-leer');
    const empty = !$('#suche').value.trim();
    box.hidden = !empty;
    if (!empty || box.childElementCount) return;
    box.append(
        el(
            'div',
            { class: 'karte leer' },
            el('span', { class: 'bild' }, sym('lupe')),
            el('h2', {}, 'Wonach suchst du?'),
            el('p', {}, t('sucheHinweis')),
            el(
                'p',
                { class: 'leise' },
                'Die Suche läuft nur auf deinem Gerät. Was du eintippst, wird nicht verschickt.',
            ),
        ),
    );
}
// Status of a search hit (#5): with a form term only that form; combinations and other forms marked.
function hitStatus(w, a, formWord) {
    const e = grouping(w, a);
    const basis = a && a.form && formWord ? t('trefferFormBezug', { form: formWord }) : '';
    if (e.betroffen.length)
        return [
            `${basis}betroffen: ${affected(e.betroffen)}`,
            e.passt.length ? levelOf(e.passt) : ['info', 'Bitte vergleichen'],
        ];
    const forms = [...new Set(e.getrennt.map((m) => m.form).filter(Boolean))]
        .slice(0, 3)
        .join(', ');
    // Only combinations: could be the own product, so a neutral badge instead of a check mark (regeln.json →
    // abgleich.marke).
    const onlyCombination = ['info', t('nurKombinationMarke')];
    const partner = [...new Set(e.kombination.flatMap((m) => CLASSIFY.partner(m, w, state.rules)))];
    const partnerText = andList(
        partner.length > 3 ? [...partner.slice(0, 3), 'weiteren'] : partner,
    );
    if (e.kombination.length && !e.andereForm.length)
        return [
            `${basis}${t('trefferNurKombination', { partner: partnerText, formen: forms })}`,
            onlyCombination,
        ];
    if (e.andereForm.length && !e.kombination.length)
        return [`${basis}${t('trefferNurAndereForm', { formen: forms })}`, 'gut'];
    if (e.getrennt.length)
        return [`${basis}${t('trefferNurGetrennt', { formen: forms })}`, onlyCombination];
    if (e.andereStaerke.length) return [`${basis}${t('trefferNurAndereStaerke')}`, 'gut'];
    return [`${basis}${t('trefferKeine')}`, 'gut'];
}
// The umbrella term matching the input (e.g. „Blutdrucksenker“) with its affected substances; null if none.
function umbrellaTerm(name) {
    const n = norm(name);
    if (n.length < 5) return null;
    const o = state.rules.oberbegriffe.liste.find((x) =>
        x.begriffe.some((b) => b.startsWith(n) || n === b),
    );
    if (!o) return null;
    // True when a report belongs to one of the ATC groups of the umbrella term.
    const inGroup = (m) =>
        String(m.atc || '')
            .split(',')
            .some((c) => o.atc.some((p) => c.trim().startsWith(p)));
    const ws = new Map();
    for (const m of state.daily.meldungen) {
        if (!inGroup(m) || CLASSIFY.kurzNamen(m, state.rules).length !== 1) continue;
        const e = state.searchIndex.find((x) => x.typ === 'wirkstoff' && matches(x.w, m));
        if (e && !ws.has(e.w) && grouping(e.w, null).passt.length) ws.set(e.w, true);
    }
    return {
        name: o.name,
        einleitung: o.einleitung,
        ws: [...ws.keys()].sort((a, b) => a.n.localeCompare(b.n, 'de')),
    };
}
// Hit list: the actions of the buttons live in hitActions (one click handler on #treffer, data-nr). When new daily data
// arrives while the list is open, it is only replaced if its content changes – otherwise the buttons stay and only the
// actions are renewed. That way a tap at this moment is not lost.
export let hitActions = [];
// Draws the hit list; keeps the buttons when the content did not change.
export function renderHits(q) {
    const ul = $('#treffer');
    $('#suche-loeschen').hidden = !q;
    if (state.rules && state.view === 'suchen') renderSearchEmpty();
    const fresh = document.createElement('ul');
    const actions = [];
    const said = state.rules
        ? buildHits(q, fresh, (fn) => ({ 'data-nr': actions.push(fn) - 1 }))
        : null;
    // Compare with the last built content (not with the DOM: protectUnderBar() adds classes there afterwards).
    const sig = fresh.innerHTML;
    if (ul.dataset.sig !== sig) {
        ul.replaceChildren(...fresh.childNodes);
        ul.dataset.sig = sig;
        announceHits(q, actions.length, said);
    }
    hitActions = actions;
}
// Says the number of hits once typing pauses (#22, WCAG 4.1.3): „3 Treffer“ or „Keine Treffer“ – never per keystroke.
// For a PZN the list gives its own text (counter, suggestions, check digit).
let hitsTimer = null;
// Said once before the next announcement (e.g. „PZN erkannt.“ after a scan, #77).
let nextPrefix = '';
export const announceFirst = (text) => {
    nextPrefix = text;
};
function announceHits(q, count, said) {
    clearTimeout(hitsTimer);
    if (!q.trim() || !state.rules) return;
    hitsTimer = setTimeout(() => {
        const text =
            said || (count ? t('ansageTreffer', { anzahl: count }) : t('ansageKeineTreffer'));
        announce(nextPrefix ? `${nextPrefix} ${text}` : text);
        nextPrefix = '';
    }, 800);
}
// Builds the hits for an input: PZN, umbrella term, substances and products.
function buildHits(q, ul, action) {
    // PZN first (#77): digits (with or without „PZN“) are a PZN from the first digit on.
    const digits = pznDigits(q);
    if (digits) return buildPznHits(digits, ul, action);
    const part = splitQuery(q);
    const hits = search(q);
    if (part.staerke && hits.length) {
        ul.append(
            el(
                'li',
                { class: 'leise' },
                t('staerkeErkannt', {
                    staerke: [part.staerke, part.form].filter(Boolean).join(' · '),
                }),
            ),
        );
    }
    const searchSelection =
        part.staerke || part.form ? { staerke: part.staerke, form: part.form } : null;
    // One hit as a button with name, status and badge.
    const button = (w, title, extra, onclick) => {
        const [meta, level] = state.daily
            ? hitStatus(w, searchSelection, part.formWort)
            : ['Tagesdaten fehlen', 'info'];
        return el(
            'li',
            {},
            el(
                'button',
                { type: 'button', 'data-testid': 'such-treffer', ...action(onclick) },
                el(
                    'span',
                    { class: 'mitte' },
                    title,
                    el('span', { class: 'meta' }, extra + meta),
                    badge(...[].concat(level)),
                ),
                arrow(),
            ),
        );
    };
    // Umbrella term („Blutdrucksenker“): affected substances of these ATC groups (#6, regeln.json → oberbegriffe).
    const umbrella = state.daily ? umbrellaTerm(part.name) : null;
    if (umbrella) {
        ul.append(
            el(
                'li',
                { class: 'leise hinweis-ober' },
                t(umbrella.ws.length ? 'oberbegriffGemeldet' : 'oberbegriffKeine', {
                    einleitung: umbrella.einleitung,
                }),
            ),
        );
        const max = state.rules.oberbegriffe.anzeigenHoechstens;
        for (const w of umbrella.ws.slice(0, max))
            ul.append(
                button(w, w.n, '', () => {
                    state.strengthHint = null;
                    choose(w);
                }),
            );
        if (umbrella.ws.length > max)
            ul.append(
                el(
                    'li',
                    { class: 'leise' },
                    t('oberbegriffMehr', { anzahl: umbrella.ws.length - max }),
                ),
            );
    }
    for (const e of hits) {
        const w = e.w;
        const [meta, level] = !state.daily
            ? ['Tagesdaten fehlen', 'info']
            : e.typ === 'praeparat'
              ? ['Präparat mit gemeldetem Lieferengpass', null]
              : hitStatus(w, searchSelection, part.formWort);
        const title = e.typ === 'wirkstoff' ? w.n : e.name;
        const extra =
            (e.aehnlich ? `${t('aehnlich')} · ` : '') +
            (e.typ === 'wirkstoff'
                ? e.alias
                    ? `auch: ${e.alias} · `
                    : ''
                : `Wirkstoff: ${w.n} · `);
        ul.append(
            el(
                'li',
                {},
                el(
                    'button',
                    {
                        type: 'button',
                        'data-testid': 'such-treffer',
                        ...action(() => {
                            state.strengthHint = searchSelection ? { w, ...searchSelection } : null;
                            choose(w);
                        }),
                    },
                    el(
                        'span',
                        { class: 'mitte' },
                        title,
                        el('span', { class: 'meta' }, extra + meta),
                        level ? badge(...[].concat(level)) : null,
                    ),
                    arrow(),
                ),
            ),
        );
    }
    if (!ul.querySelector('button') && !umbrella && norm(q).length >= 2) {
        ul.append(el('li', { class: 'leise' }, t('nichtsGefunden')));
    }
}
