// Shared building blocks of the interface: data attributes, symbols and status badges (always symbol and word) (#56).

import { CLASSIFY, state } from './state.js';
import { el, t } from './dom.js';
import { grouping, selectionOf } from './matching.js';

// Data attributes naming the source and date of a statement (read by the checks).
export const dataAttrs = (source, asOf) => ({
    'data-testid': 'daten',
    'data-quelle': source,
    'data-stand': asOf,
});
// Symbols: simple lines on a 24 grid, stroke 2 px, currentColor, hidden from screen readers. Each symbol is a list of
// SVG shapes [tag, attributes]; built with DOM methods, never as HTML (#51).
const SYMBOLS = {
    haken: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
    uhr: [
        ['circle', { cx: '12', cy: '12', r: '9' }],
        ['path', { d: 'M12 7v5l3 2' }],
    ],
    dreieck: [
        [
            'path',
            {
                d: 'M10.3 4.3L2.7 17.8A2 2 0 0 0 4.4 20.8h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z',
            },
        ],
        ['path', { d: 'M12 10v4M12 17.3v.01' }],
    ],
    info: [
        ['circle', { cx: '12', cy: '12', r: '9' }],
        ['path', { d: 'M12 11v6M12 7.5v.01' }],
    ],
    pfeil: [['path', { d: 'M9 5l7 7-7 7' }]],
    lesezeichen: [['path', { d: 'M6 3.5h12v17l-6-4-6 4z' }]],
    glocke: [
        ['path', { d: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z' }],
        ['path', { d: 'M10 21h4' }],
    ],
    lupe: [
        ['circle', { cx: '11', cy: '11', r: '7' }],
        ['path', { d: 'M20 20l-3.5-3.5' }],
    ],
    kamera: [
        ['path', { d: 'M4 8h3l2-2.5h6L17 8h3v11H4z' }],
        ['circle', { cx: '12', cy: '13', r: '3.5' }],
    ],
    papierkorb: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }]],
    ort: [
        ['path', { d: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z' }],
        ['circle', { cx: '12', cy: '9.5', r: '2.5' }],
    ],
};
const SVG_NS = 'http://www.w3.org/2000/svg';
// Creates an SVG symbol from the shape list above (hidden from screen readers).
export function sym(name, className = '') {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('class', `sym ${className}`.trim());
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    for (const [tag, attributes] of SYMBOLS[name]) {
        const shape = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
        s.append(shape);
    }
    return s;
}
// Status badges: always symbol and word, never colour alone.
const LEVELS = {
    gut: { sym: 'haken', wort: 'Kein Engpass gemeldet' },
    achtung: { sym: 'uhr', wort: 'Engpass gemeldet' },
    kritisch: { sym: 'dreieck', wort: 'Versorgungskritisch' },
    info: { sym: 'info', wort: 'Ohne Einstufung' },
};
export const badge = (level, word) =>
    el('span', { class: `marke ${level}` }, sym(LEVELS[level].sym), word || LEVELS[level].wort);
// Level of a list of reports: none → 'gut', any critical → 'kritisch', otherwise 'achtung'.
export const levelOf = (ms) =>
    !ms.length
        ? 'gut'
        : ms.some((m) => m.einstufung === 'verskri (auch versrel)')
          ? 'kritisch'
          : 'achtung';
// Level for a substance with an optional own choice: [level, word?]
export function levelFor(w) {
    if (!state.daily) return ['info'];
    const a = selectionOf(w);
    const e = grouping(w, a);
    // Check mark only if nothing or only clearly other forms/strengths are reported (regeln.json → abgleich.marke).
    return {
        betroffen: [levelOf(e.passt)],
        unklar: ['info', 'Bitte vergleichen'],
        nurKombination: ['info', t('nurKombinationMarke')],
        kein: ['gut'],
    }[CLASSIFY.urteil(e)];
}
export const arrow = () => sym('pfeil', 'spiegeln');
