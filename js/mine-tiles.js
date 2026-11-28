// Tiles in „Meine“ (#86): every own entry is a tile. Tapping opens it; „Bearbeiten“ shows „Nach oben“, „Nach unten“
// and „Entfernen“ for each tile (the way without gestures, also for VoiceOver); removing shows „Rückgängig“ for 10 s.
// The order is the order of the stored list (ew.meine) and stays on the device. The gestures are in mine-gestures.js.

import { STORAGE_KEYS } from './state.js';
import { announce, el, norm, saveSetting, t } from './dom.js';
import { renderMine } from './mine.js';
import { isPznEntry } from './pzn.js';
import { sym } from './ui.js';
import { myList } from './watchlist.js';

// How long „Rückgängig“ stays (ms): 10 s, decided after the review on accessibility (the concept had 5 s).
const UNDO_MS = 10000;
// Edit mode („Bearbeiten“ pressed).
let editing = false;
export const isEditing = () => editing;

// A stable key of an entry: a PZN entry by its PZN, a substance by its normalised name.
export const entryKey = (e) => (isPznEntry(e) ? `p:${e.pzn}` : `w:${norm(e.n)}`);
// The name shown for an entry.
export const entryName = (e) => (isPznEntry(e) ? e.name : e.n);

// Saves the list and draws „Meine“ again.
function store(list) {
    saveSetting(STORAGE_KEYS.meine, list);
    renderMine();
}
// Puts the focus on an element of the redrawn view, found by a selector.
function focusLater(selector, fallback) {
    const target =
        document.querySelector(selector) || (fallback && document.querySelector(fallback));
    if (target) target.focus();
}
// Moves an entry to another place (index in the list) and says where it is now.
export function moveEntry(key, to, { focus = null } = {}) {
    const list = myList();
    const from = list.findIndex((e) => entryKey(e) === key);
    if (from < 0) return;
    const target = Math.max(0, Math.min(list.length - 1, to));
    if (target === from) return;
    const [entry] = list.splice(from, 1);
    list.splice(target, 0, entry);
    store(list);
    announce(
        t('meineVerschoben', {
            name: entryName(entry),
            platz: target + 1,
            anzahl: list.length,
        }),
    );
    // Keep the focus on the same action of the moved tile; at the top or bottom that action is off, so the other.
    if (focus) {
        const tile = `#kern li.kachel[data-key="${CSS.escape(key)}"]`;
        focusLater(
            `${tile} [data-aktion="${focus}"]:not([disabled])`,
            `${tile} [data-aktion]:not([disabled])`,
        );
    }
}
// Removes an entry from „Meine“ and offers „Rückgängig“. focusUndo: the focus goes to „Rückgängig“ (when the removed
// tile had it, e.g. from the edit mode).
export function removeEntry(key, { focusUndo = false } = {}) {
    const list = myList();
    const index = list.findIndex((e) => entryKey(e) === key);
    if (index < 0) return;
    const [entry] = list.splice(index, 1);
    store(list);
    showUndo(entry, index, focusUndo);
}

let undo = null;
// Shows „<Name> entfernt.“ with „Rückgängig“ above the thumb bar for 10 s and announces it once. The bar stands before
// the thumb bar in the reading order; while it is shown, the page keeps room for it, so nothing focused hides below.
function showUndo(entry, index, focusUndo) {
    hideUndo(false);
    const text = t('meineEntfernt', { name: entryName(entry) });
    const button = el(
        'button',
        {
            type: 'button',
            class: 'rueckgaengig-knopf',
            'data-testid': 'rueckgaengig',
            // „Ibuprofen entfernt.“ is read with the button, also when the announcement is cut off.
            'aria-describedby': 'rueckgaengig-text',
            onclick: () => restore(entry, index),
        },
        t('rueckgaengig'),
    );
    const bar = el(
        'div',
        { class: 'rueckgaengig', id: 'rueckgaengig' },
        el('span', { id: 'rueckgaengig-text' }, text),
        button,
    );
    const current = { bar, timer: 0 };
    const restart = () => {
        clearTimeout(current.timer);
        current.timer = setTimeout(() => {
            if (undo === current) hideUndo(true);
        }, UNDO_MS);
    };
    // While the focus or a finger is on „Rückgängig“ the time stands still (WCAG 2.2.1), afterwards it starts again.
    const hold = () => clearTimeout(current.timer);
    bar.addEventListener('focusin', hold);
    bar.addEventListener('pointerdown', hold);
    bar.addEventListener('pointerenter', hold);
    bar.addEventListener('focusout', () => undo === current && restart());
    bar.addEventListener('pointerleave', () => {
        if (undo === current && !bar.contains(document.activeElement)) restart();
    });
    const dock = document.getElementById('dock');
    if (dock) dock.before(bar);
    else document.body.append(bar);
    undo = current;
    document.documentElement.style.setProperty(
        '--rueckgaengig-hoehe',
        `calc(${bar.offsetHeight}px + var(--a-3))`,
    );
    restart();
    announce(`${text} ${t('meineRueckgaengigHinweis')}`);
    if (focusUndo) button.focus();
}
// Hides „Rückgängig“; a focus inside goes back to „Bearbeiten“ (or the title) so it is never lost.
function hideUndo(keepFocus) {
    if (!undo) return;
    const { bar, timer } = undo;
    undo = null;
    clearTimeout(timer);
    const hadFocus = bar.contains(document.activeElement);
    bar.remove();
    document.documentElement.style.removeProperty('--rueckgaengig-hoehe');
    if (keepFocus && hadFocus) focusLater('#meine-bearbeiten', '#kern h1');
}
// Puts a removed entry back at its old place.
function restore(entry, index) {
    hideUndo(false);
    const list = myList();
    if (list.some((e) => entryKey(e) === entryKey(entry))) return;
    list.splice(Math.min(index, list.length), 0, entry);
    store(list);
    announce(t('meineWiederDa', { name: entryName(entry) }));
    focusLater(
        `#kern li.kachel[data-key="${CSS.escape(entryKey(entry))}"] button:not([disabled])`,
        '#meine-bearbeiten',
    );
}

// „Bearbeiten“ / „Fertig“ next to the title.
export function editButton() {
    return el(
        'button',
        {
            type: 'button',
            class: 'link-knopf bearbeiten',
            id: 'meine-bearbeiten',
            'data-testid': 'meine-bearbeiten',
            onclick: () => {
                editing = !editing;
                renderMine();
                focusLater('#meine-bearbeiten');
            },
        },
        editing ? t('meineFertig') : t('meineBearbeiten'),
    );
}
// Leaves the edit mode without drawing (when the list becomes empty).
export function endEditing() {
    editing = false;
}
// „Meine“ is left for another view: „Rückgängig“ disappears and the edit mode ends, so neither can draw „Meine“ over
// the other view.
export function leaveMine() {
    editing = false;
    hideUndo(false);
}
// The line under the title: number of entries, or what the edit mode is for.
export const sublineText = (n) =>
    editing
        ? t('meineBearbeitenZeile')
        : n === 1
          ? t('meineAnzahlEins')
          : t('meineAnzahl', { anzahl: n });

// Turns a row of the list (li with a button) into a tile. In the edit mode the row is no button but plain content,
// with „Nach oben“, „Nach unten“ and „Entfernen“ below.
export function tile(entry, row, index, count) {
    const key = entryKey(entry);
    const name = entryName(entry);
    const button = row.querySelector('button.zeile');
    const li = el('li', { class: 'kachel', 'data-key': key });
    if (!editing) {
        li.append(el('div', { class: 'kachel-flaeche' }, button));
        return li;
    }
    // The same content without the arrow, not clickable.
    const content = el('div', { class: 'zeile ruhig' }, button.querySelector('.mitte'));
    // One button of the edit mode: visible word, kind (for the focus), name for VoiceOver, action, off at the edge.
    const action = (word, kind, label, onclick, disabled) =>
        el(
            'button',
            {
                type: 'button',
                class: `knopf ${kind === 'entfernen' ? 'umgekehrt' : 'zweit'}`,
                'data-aktion': kind,
                'aria-label': label,
                disabled,
                onclick,
            },
            word,
        );
    li.append(
        el('div', { class: 'kachel-flaeche' }, content),
        el(
            'div',
            { class: 'kachel-aktionen' },
            action(
                t('nachOben'),
                'hoch',
                t('nachObenName', { name }),
                () => moveEntry(key, index - 1, { focus: 'hoch' }),
                index === 0,
            ),
            action(
                t('nachUnten'),
                'runter',
                t('nachUntenName', { name }),
                () => moveEntry(key, index + 1, { focus: 'runter' }),
                index === count - 1,
            ),
            action(
                t('meineEntfernen'),
                'entfernen',
                t('meineEntfernenName', { name }),
                () => removeEntry(key, { focusUndo: true }),
                false,
            ),
        ),
    );
    return li;
}
// The action behind a swiped tile: dark area with trash can and word (no red: it is an action, not a status).
export function swipeAction(key, name) {
    return el(
        'div',
        { class: 'kachel-hinter' },
        el(
            'button',
            {
                type: 'button',
                class: 'wisch-entfernen',
                'data-testid': 'wisch-entfernen',
                'aria-label': t('meineEntfernenName', { name }),
                // From the keyboard (no pointer, detail 0) the focus goes on to „Rückgängig“.
                onclick: (e) => removeEntry(key, { focusUndo: e.detail === 0 }),
            },
            sym('papierkorb'),
            el('span', {}, t('meineEntfernen')),
        ),
    );
}
