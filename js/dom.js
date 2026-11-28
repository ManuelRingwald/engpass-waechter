// DOM and text helpers: creating elements, texts from regeln.json, dates, normalising names and reading/writing
// settings in localStorage (#56).

import { state } from './state.js';

export const $ = (s) => document.querySelector(s);
// Creates an element with attributes, event handlers and children; texts are always set as text, never as HTML.
export function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of children.flat())
        if (k !== null && k !== undefined && k !== false)
            e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
}
export const t = (key, values = {}) =>
    (state.rules.texte[key] || key).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);
// Formats an ISO date as DD.MM.YYYY.
export const formatDate = (iso) => {
    if (!iso) return '–';
    const [j, m, d] = iso.slice(0, 10).split('-');
    return `${d}.${m}.${j}`;
};
// Formats an ISO timestamp as a German date with time.
export const formatDateTime = (iso) =>
    new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
// Normalises a name for comparing: lower case, without „(Ph. Eur.)“, single spaces.
export const norm = (s) =>
    (s || '')
        .toLowerCase()
        .replace(/\(ph\.\s*eur\.\)/g, '')
        .replace(/[\s ]+/g, ' ')
        .trim();
// Reads a stored setting; the fallback when it is missing or storage is not usable.
export const readSetting = (k, fallback) => {
    try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : fallback;
    } catch {
        return fallback;
    }
};
// Stores a setting on this device; silently does nothing when storage is not usable.
export const saveSetting = (k, v) => {
    try {
        localStorage.setItem(k, JSON.stringify(v));
    } catch {
        /* Storage not usable */
    }
};
// Says a short feedback through the permanent status region (#22, WCAG 4.1.3): it exists from the start and is empty,
// so screen readers announce what is written into it. Cleared first, so the same text is announced again.
let announceTimer = null;
export function announce(text) {
    const region = document.getElementById('ansage');
    if (!region) return;
    region.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
        region.textContent = text || '';
        // Empty again after a while, so an old message is not read later in the flow of the page (#22).
        announceTimer = setTimeout(() => {
            region.textContent = '';
        }, 7000);
    }, 60);
}
// A visible feedback line (e.g. „Gemerkt.“) that is also announced once through the status region.
export function feedbackLine(text) {
    announce(text);
    return el('p', { class: 'rueckmeldung' }, text);
}
// Removes a setting from this device; silently does nothing when storage is not usable.
export const removeSetting = (k) => {
    try {
        localStorage.removeItem(k);
    } catch {
        /* Storage not usable */
    }
};
export const plural = (n, one, many) => (n === 1 ? one : many);
// Today as YYYY-MM-DD in local time; an expected end before that is past (regeln.json → abgleich.endeVorbei, #4).
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isPast = (iso) => !!iso && iso.slice(0, 10) < today();
// Text for the expected end of a shortage; marked as past when the date is before today.
export const endText = (iso) =>
    isPast(iso)
        ? t('endeVorbei', { datum: formatDate(iso) })
        : t('ende', { datum: formatDate(iso) });
// Replaces the content of a container but keeps what was typed into its fields, the cursor and the focus (#65): used
// when a view is redrawn with reloaded daily data while someone is working in it.
export function replaceKeepingInput(target, fresh) {
    const fields = new Map();
    for (const f of target.querySelectorAll('input[id], select[id], textarea[id]'))
        fields.set(f.id, { value: f.value, start: f.selectionStart, end: f.selectionEnd });
    const active = document.activeElement;
    const focused = active && active.id && target.contains(active) ? active.id : null;
    target.replaceChildren(...fresh.childNodes);
    for (const [id, kept] of fields) {
        const f = target.querySelector(`#${CSS.escape(id)}`);
        if (f) f.value = kept.value;
    }
    const again = focused && target.querySelector(`#${CSS.escape(focused)}`);
    if (again) {
        again.focus({ preventScroll: true });
        const kept = fields.get(focused);
        if (kept && kept.start !== null && typeof again.setSelectionRange === 'function') {
            try {
                again.setSelectionRange(kept.start, kept.end);
            } catch {
                /* Field without a text cursor (e.g. a select) */
            }
        }
    }
}
