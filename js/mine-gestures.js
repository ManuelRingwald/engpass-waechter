// Gestures on the tiles in „Meine“ (#86), like lists in iOS:
// - swipe towards the start (left; right in right-to-left languages) opens „Entfernen“ at the end; a long swipe removes
//   at once;
// - press and hold (0.45 s) lifts a tile; dragging sorts it, at the edge of the screen the page scrolls along.
// Vertical moves stay normal scrolling; after a gesture a tap does not open the entry. Everything also works without
// gestures through „Bearbeiten“ (mine-tiles.js). Thresholds from the approved design concept.

import { $ } from './dom.js';
import { myList } from './watchlist.js';
import {
    entryKey,
    entryName,
    isEditing,
    moveEntry,
    removeEntry,
    swipeAction,
} from './mine-tiles.js';

const HOLD_MS = 450; // press and hold until the tile lifts
const SLOP = 8; // px of movement that still counts as holding still
// px the tile moves aside when „Entfernen“ is open: --wisch-breite (104 px) plus the gap --a-2 (8 px).
const OPEN = 112;
const OPEN_FROM = 56; // a swipe further than this opens „Entfernen“
const REMOVE_FROM = 240; // a swipe further than this removes at once
const EDGE = 72; // px from the top or the thumb bar where the page scrolls along while dragging
const SCROLL_STEP = 8; // px per frame while scrolling along

let gesture = null; // the gesture in progress
let openTile = null; // the tile whose „Entfernen“ is open
// Until then a click on the tile of the last gesture does not open it: the touch was a gesture.
let quietUntil = 0;
let quietTile = null;
// This touch closed an open „Entfernen“: its tap does nothing else.
let closedOnDown = false;

// +1 for left-to-right, -1 for right-to-left: a swipe „towards the start“ is negative after multiplying.
const direction = () => (getComputedStyle(document.documentElement).direction === 'rtl' ? -1 : 1);
const surface = (li) => li.querySelector('.kachel-flaeche');
const moveX = (li, x) => {
    surface(li).style.transform = x ? `translateX(${x * direction()}px)` : '';
};

// Closes an open „Entfernen“.
function closeOpen() {
    if (!openTile) return;
    const li = openTile;
    openTile = null;
    li.classList.remove('offen');
    moveX(li, 0);
    const behind = li.querySelector('.kachel-hinter');
    if (behind) behind.remove();
}
// The entry of a tile.
const entryOf = (li) => myList().find((e) => entryKey(e) === li.dataset.key);

// Starts a gesture on a tile (not in the edit mode, not on the „Entfernen“ behind it).
function down(e) {
    if (isEditing() || gesture || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('.kachel-hinter')) return;
    const li = e.target.closest('li.kachel');
    closedOnDown = !!openTile && openTile !== li && !e.target.closest('.kachel-hinter');
    if (closedOnDown) closeOpen();
    if (!li || !surface(li)) return;
    gesture = {
        li,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastY: e.clientY,
        mode: null,
        base: openTile === li ? -OPEN : 0,
        dx: 0,
    };
    gesture.timer = setTimeout(lift, HOLD_MS);
}
// Press and hold: the tile lifts and can be dragged.
function lift() {
    if (!gesture || gesture.mode) return;
    closeOpen();
    const tiles = [...gesture.li.parentElement.children];
    gesture.mode = 'drag';
    gesture.from = tiles.indexOf(gesture.li);
    gesture.to = gesture.from;
    gesture.tiles = tiles;
    gesture.scroll = window.scrollY;
    gesture.rects = tiles.map((t) => {
        const r = t.getBoundingClientRect();
        return { top: r.top + window.scrollY, height: r.height };
    });
    gesture.li.classList.add('angehoben');
    gesture.li.parentElement.classList.add('sortieren');
    // The pointer is captured only once the tile really moves: a slow tap stays a tap on the entry.
}
// Keeps the pointer on the tile while it moves (not possible for every pointer – then it simply goes on).
function capture() {
    try {
        gesture.li.setPointerCapture(gesture.id);
    } catch {
        /* No capture: the gesture still works while the finger stays on the list */
    }
}
// Follows the pointer: decides swipe or scroll, moves the tile.
function move(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    gesture.lastY = e.clientY;
    if (!gesture.mode) {
        if (Math.abs(dx) <= SLOP && Math.abs(dy) <= SLOP) return;
        clearTimeout(gesture.timer);
        if (Math.abs(dy) >= Math.abs(dx)) {
            // Vertical: normal scrolling, the gesture is over.
            gesture = null;
            return;
        }
        gesture.mode = 'swipe';
        capture();
        if (!gesture.li.querySelector('.kachel-hinter')) {
            const entry = entryOf(gesture.li);
            if (entry) gesture.li.append(swipeAction(gesture.li.dataset.key, entryName(entry)));
        }
        gesture.li.classList.add('wischen');
    }
    if (gesture.mode === 'swipe') {
        gesture.dx = Math.min(0, gesture.base + dx * direction());
        moveX(gesture.li, gesture.dx);
    } else if (gesture.mode === 'drag') {
        e.preventDefault();
        if (!gesture.dragged && Math.abs(dy) > SLOP) {
            gesture.dragged = true;
            capture();
        }
        drag();
        edgeScroll();
    }
}
// Moves the lifted tile with the pointer and makes room at the place where it would land.
function drag() {
    const dy = gesture.lastY - gesture.y + (window.scrollY - gesture.scroll);
    const own = gesture.rects[gesture.from];
    const middle = own.top + own.height / 2 + dy;
    let to = 0;
    gesture.rects.forEach((r, i) => {
        if (i !== gesture.from && r.top + r.height / 2 < middle) to += 1;
    });
    gesture.to = to;
    const gap =
        gesture.rects.length > 1
            ? Math.abs(gesture.rects[1].top - gesture.rects[0].top - gesture.rects[0].height)
            : 0;
    const room = own.height + gap;
    gesture.tiles.forEach((t, i) => {
        let y = 0;
        if (i === gesture.from) y = dy;
        else if (i > gesture.from && i <= to) y = -room;
        else if (i < gesture.from && i >= to) y = room;
        t.style.transform = y ? `translateY(${y}px)` : '';
    });
}
// Near the top of the screen or the thumb bar the page scrolls along while dragging.
function edgeScroll() {
    if (gesture.scrolling) return;
    const step = () => {
        if (!gesture || gesture.mode !== 'drag') return;
        const bottom = window.innerHeight - ($('#dock') ? $('#dock').offsetHeight : 0);
        const by =
            gesture.lastY < EDGE ? -SCROLL_STEP : gesture.lastY > bottom - EDGE ? SCROLL_STEP : 0;
        if (!by) {
            gesture.scrolling = false;
            return;
        }
        const before = window.scrollY;
        window.scrollBy(0, by);
        if (window.scrollY !== before) drag();
        gesture.scrolling = requestAnimationFrame(step);
    };
    gesture.scrolling = requestAnimationFrame(step);
}
// Ends a gesture: open, close or remove after a swipe; sort after dragging.
function up(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    clearTimeout(gesture.timer);
    const done = gesture;
    gesture = null;
    if (!done.mode) return;
    // Lifted but not moved (e.g. a slow tap): the tap opens the entry as usual.
    if (!(done.mode === 'drag' && !done.dragged)) {
        quietUntil = Date.now() + 400;
        quietTile = done.li;
    }
    const li = done.li;
    li.classList.remove('wischen');
    if (done.mode === 'swipe') {
        if (done.dx <= -REMOVE_FROM) removeEntry(li.dataset.key);
        else if (done.dx <= -OPEN_FROM) {
            openTile = li;
            li.classList.add('offen');
            moveX(li, -OPEN);
        } else {
            openTile = li;
            closeOpen();
        }
        return;
    }
    cancelAnimationFrame(done.scrolling);
    for (const t of done.tiles) t.style.transform = '';
    li.classList.remove('angehoben');
    li.parentElement.classList.remove('sortieren');
    if (done.to !== done.from) moveEntry(li.dataset.key, done.to);
}
// The browser took over (e.g. scrolling): back to the start, nothing changes.
function cancel(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    clearTimeout(gesture.timer);
    const done = gesture;
    gesture = null;
    if (done.mode === 'drag') {
        cancelAnimationFrame(done.scrolling);
        for (const t of done.tiles) t.style.transform = '';
        done.li.classList.remove('angehoben');
        done.li.parentElement.classList.remove('sortieren');
    } else if (done.mode === 'swipe') {
        done.li.classList.remove('wischen');
        if (openTile === done.li) moveX(done.li, -OPEN);
        else {
            openTile = done.li;
            closeOpen();
        }
    }
}
// A tap on a tile right after a gesture does not open it; a tap on a tile while „Entfernen“ is open only closes it.
// Other buttons (e.g. „Bearbeiten“) work as usual and close an open „Entfernen“ on the way.
function click(e) {
    // „Entfernen“ behind a tile is always a tap of its own.
    if (e.target.closest('.kachel-hinter')) return;
    const onTile = e.target.closest('li.kachel');
    // The click that ends the gesture itself: nothing else happens (the tile stays open if it was swiped open).
    if (onTile && onTile === quietTile && Date.now() < quietUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    const wasOpen = !!openTile || closedOnDown;
    closedOnDown = false;
    closeOpen();
    if (onTile && wasOpen) {
        e.preventDefault();
        e.stopPropagation();
    }
}
// Binds the gestures once to the content area (the tiles are drawn again and again).
export function setupTileGestures() {
    const core = $('#kern');
    core.addEventListener('pointerdown', down);
    core.addEventListener('pointermove', move);
    core.addEventListener('pointerup', up);
    core.addEventListener('pointercancel', cancel);
    core.addEventListener('click', click, true);
    // While a tile is lifted, the finger moves it instead of the page (touch-action alone cannot change mid-touch).
    core.addEventListener(
        'touchmove',
        (e) => {
            if (gesture && gesture.mode === 'drag' && e.cancelable) e.preventDefault();
        },
        { passive: false },
    );
    // A long press must not open the context menu of the system on a tile.
    core.addEventListener('contextmenu', (e) => {
        if (e.target.closest('li.kachel')) e.preventDefault();
    });
    // „Entfernen“ closes when the view is redrawn or left.
    new MutationObserver(() => {
        if (openTile && !openTile.isConnected) openTile = null;
    }).observe(core, { childList: true });
}
