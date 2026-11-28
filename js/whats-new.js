// What is new (#32, docs/neu.json): the card after an update and the list under „Mehr“.

import { state, STORAGE_KEYS, usedBefore } from './state.js';
import { fetchJson } from './data.js';
import { $, el, formatDate, formatDateTime, readSetting, saveSetting, t } from './dom.js';
import { renderMine } from './mine.js';
import { focusHeading } from './navigation.js';

// Entry for the running version: exactly by „version“ (short commit), otherwise the newest with a „datum“ (UTC) not
// after the time of the version. Without a stamp (development build) the newest entry.
const whatsNewLoaded = fetchJson('neu.json')
    .then((r) => r.json)
    .catch(() => null);
export let whatsNewEntry = null;
export let showWhatsNewCard = false;
const whatsNewKey = (e) => e.version || e.datum;
// Finds the entry of neu.json for the running version.
function entryFor(notes, v) {
    const list = (notes && Array.isArray(notes.eintraege) ? notes.eintraege : []).filter((e) =>
        Array.isArray(e.punkte),
    );
    if (v.commit) {
        const exact = list.find((e) => e.version && v.commit.startsWith(e.version));
        if (exact) return exact;
    }
    const until = v.zeit ? v.zeit.getTime() : Infinity;
    return (
        list
            .filter((e) => e.datum && Date.parse(e.datum) <= until)
            .sort((a, b) => Date.parse(b.datum) - Date.parse(a.datum))[0] || null
    );
}
// Decides after start whether the card „Neu in dieser Version“ is shown.
export async function whatsNew(v) {
    const notes = await whatsNewLoaded;
    if (!notes || !state.rules || state.reloading) return;
    whatsNewEntry = entryFor(notes, v);
    fillWhatsNew(notes);
    if (!whatsNewEntry) return;
    const k = whatsNewKey(whatsNewEntry);
    const seen = readSetting(STORAGE_KEYS.neu, null);
    if (seen === k) return;
    // On the very first start there is nothing „new“: only remember, no card.
    if (seen === null && !usedBefore) {
        saveSetting(STORAGE_KEYS.neu, k);
        return;
    }
    whatsNewSince = sinceSeen(notes, seen);
    // Last seen is newer than this version (e.g. reset): show nothing
    if (!whatsNewSince.length) return;
    showWhatsNewCard = true;
    if (state.view === 'meine' && !state.selected && !state.pznNumber) renderMine();
}
// All entries from the last seen one up to the running version, newest first (#36). The stored key is a „datum“ or a
// „version“ from neu.json; if it is not (or no longer) found there, it counts as a point in time, otherwise only the
// entry of this version.
let whatsNewSince = [];
let whatsNewShowAll = false;
// Entries of neu.json with points, newest first.
const whatsNewValid = (notes) =>
    [...notes.eintraege]
        .filter((e) => Array.isArray(e.punkte))
        .sort((a, b) => Date.parse(b.datum || 0) - Date.parse(a.datum || 0));
// Entries between the last seen one and the running version.
function sinceSeen(notes, seen) {
    const list = whatsNewValid(notes);
    const from = list.indexOf(whatsNewEntry);
    let until = list.findIndex((e) => whatsNewKey(e) === seen);
    if (until < 0 && typeof seen === 'string' && !Number.isNaN(Date.parse(seen))) {
        until = list.findIndex((e) => Date.parse(e.datum) <= Date.parse(seen));
        // Older than all entries: everything is new
        if (until < 0) until = list.length;
    }
    if (from < 0 || until < 0) return whatsNewEntry ? [whatsNewEntry] : [];
    return list.slice(from, until);
}
// The card „Neu in dieser Version“ in „Meine“, closable.
export function whatsNewCard() {
    // Closes the card and remembers the entry as seen.
    const close = () => {
        saveSetting(STORAGE_KEYS.neu, whatsNewKey(whatsNewEntry));
        showWhatsNewCard = false;
        whatsNewShowAll = false;
        renderMine();
        // The focused button is gone with the card (#22): continue on the heading of „Meine“.
        const heading = $('#kern h1');
        if (heading) focusHeading(heading);
    };
    const entries = whatsNewSince.length ? whatsNewSince : [whatsNewEntry];
    const max = state.rules.neuKarte.eintraegeZuerst;
    const visible = whatsNewShowAll ? entries : entries.slice(0, max);
    const several = entries.length > 1;
    const card = el(
        'div',
        { class: 'karte neu-karte', 'data-testid': 'neu-karte' },
        el('h2', { class: 'zwischentitel' }, t(several ? 'neuTitelMehrere' : 'neuTitel')),
    );
    for (const e of visible) {
        if (several) card.append(el('h3', { class: 'neu-datum' }, entryTitle(e, entries)));
        card.append(
            el(
                'ul',
                { class: 'neu-punkte' },
                e.punkte.map((p) => el('li', {}, p)),
            ),
        );
    }
    if (entries.length > visible.length) {
        card.append(
            el(
                'button',
                {
                    type: 'button',
                    class: 'link-knopf',
                    'data-testid': 'neu-mehr',
                    onclick: () => {
                        whatsNewShowAll = true;
                        renderMine();
                        // Continue reading at the card, now with all entries (#22).
                        const title = $('[data-testid="neu-karte"] h2');
                        if (title) focusHeading(title);
                    },
                },
                t('neuMehr', { anzahl: entries.length - visible.length }),
            ),
        );
    }
    card.append(
        el('p', { class: 'leise' }, t('neuSpaeter')),
        el('button', { type: 'button', class: 'link-knopf', onclick: close }, t('neuSchliessen')),
    );
    return card;
}
// Title of an entry: its date, with the time when another entry has the same date – headings must be unique (#22).
function entryTitle(e, entries) {
    const day = formatDate(e.datum);
    return entries.some((o) => o !== e && formatDate(o.datum) === day)
        ? formatDateTime(e.datum)
        : day;
}
// Under „Mehr“: all entries, newest first, the running version marked.
function fillWhatsNew(notes) {
    const box = $('#was-neu-liste');
    if (!box) return;
    box.textContent = '';
    const list = [...notes.eintraege]
        .filter((e) => Array.isArray(e.punkte))
        .sort((a, b) => Date.parse(b.datum || 0) - Date.parse(a.datum || 0));
    for (const e of list) {
        box.append(
            el(
                'h3',
                { class: 'zwischentitel' },
                `${entryTitle(e, list)}${e === whatsNewEntry ? ` · ${t('neuDieseVersion')}` : ''}`,
            ),
            el(
                'ul',
                { class: 'neu-punkte' },
                e.punkte.map((p) => el('li', {}, p)),
            ),
        );
    }
    $('#was-neu').hidden = !list.length;
}
