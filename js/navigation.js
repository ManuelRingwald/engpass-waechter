// Navigation between Meine · Suchen · Neuigkeiten · Mehr and the thumb bar at the bottom (#56).

import { state } from './state.js';
import { $, t } from './dom.js';
import { pznValid } from './matching.js';
import { overview } from './mine.js';
import { leaveMine } from './mine-tiles.js';
import { renderHits, renderSearchEmpty } from './search.js';
import { isMine } from './watchlist.js';

// „Meine ist nicht dabei“
export const NOT_LISTED = 'nicht';
// „Weiß nicht“
export const DONT_KNOW = 'weiss';
// Which view is shown: a changed key means a new view (detail, step of the guided choice, PZN entry, pharmacies or a
// main view), the same key a redraw of the same view (e.g. after reloading the daily data).
function viewKey() {
    if (state.pharmacyView) return 'apotheken';
    if (state.newPzn) return 'pzn-neu';
    if (state.guide)
        return `auswahl:${state.guide.w ? state.guide.w.n : ''}:${state.guide.schritt}`;
    if (state.pznNumber) return `pzn:${state.pznNumber}`;
    if (state.selected) return `detail:${state.selected.n}`;
    return `tab:${state.view}`;
}
let shownView = null;
// The control that was tapped last, as a description that survives a redraw, and the view it was in.
let lastTap = null;
// The control that opened another view, per view it was in: going back puts the focus on it again (#22).
const openedFrom = new Map();
document.addEventListener(
    'click',
    (e) => {
        const c = e.target instanceof Element && e.target.closest('button, a, summary');
        if (!c || !c.closest('#inhalt')) return;
        lastTap = {
            view: viewKey(),
            id: c.id || null,
            testid: c.dataset.testid || null,
            text: c.textContent.trim(),
        };
    },
    true,
);
// Finds the control again after a redraw: by id, by test id or by its text.
function findControl(d) {
    if (d.id) return document.getElementById(d.id);
    const all = [...document.querySelectorAll('#inhalt button, #inhalt a, #inhalt summary')].filter(
        (c) => !c.closest('[hidden]'),
    );
    return (
        (d.testid &&
            all.find((c) => c.dataset.testid === d.testid && c.textContent.trim() === d.text)) ||
        all.find((c) => c.textContent.trim() === d.text) ||
        null
    );
}
// The heading that got the focus last; when a redraw replaces it, the new one takes the focus over.
let focusedHeading = null;
const APP_NAME = 'Engpass-Wächter';
// Text key (regeln.json) of the page title per kind of view.
const TITLES = {
    'tab:meine': 'titelMeine',
    'tab:suchen': 'titelSuchen',
    'tab:neu': 'titelNeu',
    'tab:mehr': 'titelMehr',
    detail: 'titelMedikament',
    pzn: 'titelPzn',
    auswahl: 'titelAuswahl',
    'pzn-neu': 'titelPznNeu',
    apotheken: 'titelApotheken',
};
// After a change of view the focus goes to its main heading (#22, WCAG 2.4.3), so VoiceOver continues there instead of
// at a random place. Not at the start, not on a redraw of the same view and not when switching tabs (the focus stays
// on the tab, as in iOS).
function focusOnViewChange() {
    const key = viewKey();
    const before = shownView;
    shownView = key;
    const heading = [...document.querySelectorAll('#inhalt h1')].find(
        (h) => !h.closest('[hidden]'),
    );
    // The page title names the kind of view (#22, WCAG 2.4.2) – never its content: in Safari the title goes into the
    // history and can be synced, so no substance, PZN or own name may appear in it.
    const kind = key.startsWith('tab:') ? key : key.split(':')[0];
    const name = state.rules && TITLES[kind] ? t(TITLES[kind]) : '';
    document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
    const lost = !document.activeElement || document.activeElement === document.body;
    // Same view redrawn (e.g. the pharmacies or the daily data arrived): keep the focus on its heading.
    const redrawn = before === key && focusedHeading && !focusedHeading.isConnected && lost;
    const changed =
        before !== null && before !== key && !(before.startsWith('tab:') && key.startsWith('tab:'));
    if (changed && lastTap && lastTap.view === before) openedFrom.set(before, lastTap);
    // Back to a view: the control that opened the other view gets the focus again, where it is (WCAG 2.4.3).
    const opener = changed && openedFrom.get(key);
    if (opener) {
        openedFrom.delete(key);
        const control = findControl(opener);
        if (control) {
            control.focus();
            return;
        }
    }
    if (!heading || !(changed || redrawn)) return;
    // A redraw of the same view never moves the page (#65); a new view brings its heading into sight.
    focusHeading(heading, { keepScroll: redrawn && !changed });
}
// Puts the focus on a heading; scrolls only when the heading is not on the screen (and never with keepScroll).
export function focusHeading(heading, { keepScroll = false } = {}) {
    heading.setAttribute('tabindex', '-1');
    const r = heading.getBoundingClientRect();
    const inSight = r.top >= 0 && r.bottom <= window.innerHeight;
    heading.focus({ preventScroll: keepScroll || inSight });
    focusedHeading = heading;
}
// Shows the boxes of the current view and marks the active tab of the thumb bar.
export function renderView() {
    const detail = !!(
        state.selected ||
        state.pznNumber ||
        state.guide ||
        state.newPzn ||
        state.pharmacyView
    );
    // Another view than „Meine“: „Rückgängig“ and the edit mode belong to „Meine“ and end here (review #88).
    if (detail || state.view !== 'meine') leaveMine();
    if (!(state.pharmacyView && state.pharmacyView.blatt)) {
        const b = document.getElementById('route-blatt');
        if (b) b.remove();
    }
    $('#kern').hidden = !detail && (state.view === 'suchen' || state.view === 'mehr');
    $('#mehr').hidden = detail || state.view !== 'mehr';
    $('#ansicht-suche').hidden = detail || state.view !== 'suchen';
    $('#stand').hidden = !detail && state.view === 'suchen';
    $('#suchleiste').hidden = detail || !(state.view === 'meine' || state.view === 'suchen');
    $('#aktionsleiste').hidden = !detail;
    $('#merken').hidden = !state.selected;
    // Main button of the guided choice or of „Mein Produkt hinzufügen“: „Alle überwachen“ or „Merken“.
    const mainButton = $('#haupt');
    const showMainButton = !!((state.guide && state.guide.schritt === 'liste') || state.newPzn);
    mainButton.hidden = !showMainButton;
    if (showMainButton) {
        mainButton.textContent = state.newPzn ? t('pznMerken') : t('alleUeberwachen');
        mainButton.disabled = !!(state.newPzn && !pznValid(state.newPzn.pzn));
    }
    if (state.selected) {
        const saved = isMine(state.selected);
        // The word says the state („Merken“ / „Gemerkt“); no aria-pressed on top, that would say it twice (#22).
        $('#merken').classList.toggle('gemerkt', saved);
        $('#merken-wort').textContent = saved ? 'Gemerkt' : 'Merken';
    }
    for (const tab of document.querySelectorAll('.tab')) {
        if (tab.dataset.tab === state.view) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
    }
    if (state.view === 'suchen' && state.rules) renderSearchEmpty();
    protectUnderBar();
    focusOnViewChange();
}
// Switches the main view; clears the search when leaving it, optionally focuses the search field.
export function setView(next, { fokus: focus = false } = {}) {
    const field = $('#suche');
    if (next !== 'suchen' && state.view === 'suchen' && field.value) {
        field.value = '';
        renderHits('');
    }
    state.view = next;
    state.selected = null;
    state.pznNumber = null;
    state.guide = null;
    state.newPzn = null;
    state.pharmacyView = null;
    if (state.rules) overview();
    else renderView();
    window.scrollTo(0, 0);
    if (focus) field.focus();
}
// Controls whose middle lies under the fixed bars are hidden (stil.css → .unter-leiste), so that a half-covered element
// is never tapped. They reappear when scrolling.
const INTERACTIVE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
// Hides controls whose middle lies under the fixed bars, so a half-covered one is never tapped.
export function protectUnderBar() {
    const dock = $('#dock');
    if (!dock) return;
    const top = dock.getBoundingClientRect().top;
    for (const e of $('#inhalt').querySelectorAll(INTERACTIVE)) {
        const r = e.getBoundingClientRect();
        const middle = r.top + r.height / 2;
        e.classList.toggle('unter-leiste', (r.width > 0 || r.height > 0) && middle > top - 0.5);
    }
}
// Large text (#22): from 135 % of the usual 17 px (Dynamic Type „sehr groß“ and the accessibility sizes) the tabs show
// only their symbols (stil.css → data-schrift). Measured on an invisible 1em box, so a change of the text size while
// the app is open counts too.
const LARGE_TEXT_PX = 17 * 1.35;
function watchTextSize() {
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.className = 'schrift-messung';
    document.body.append(probe);
    // Sets or removes the marker for large text from the current size of 1em.
    const check = () => {
        const large = probe.getBoundingClientRect().width >= LARGE_TEXT_PX;
        if (large) document.documentElement.dataset.schrift = 'gross';
        else delete document.documentElement.dataset.schrift;
    };
    if ('ResizeObserver' in window) new ResizeObserver(check).observe(probe);
    check();
}
// Keeps the height of the thumb bar in a CSS variable and the bars above the on-screen keyboard.
export function setupBars() {
    watchTextSize();
    const dock = $('#dock');
    // Measures the thumb bar and stores its height for the layout.
    const measure = () => {
        document.documentElement.style.setProperty(
            '--dock-hoehe',
            `${Math.ceil(dock.offsetHeight)}px`,
        );
        protectUnderBar();
    };
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(dock);
    measure();
    new MutationObserver(protectUnderBar).observe($('#inhalt'), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'open'],
    });
    window.addEventListener('scroll', protectUnderBar, { passive: true });
    window.addEventListener('resize', protectUnderBar);
    keepAboveKeyboard(dock);
}
// How much smaller the visible area must be before it counts as an open keyboard (px). Smaller changes come from the
// rubber band at the end of the page or from the address bar, not from a keyboard (#85).
const KEYBOARD_MIN = 100;
// Fields that open the on-screen keyboard.
const TYPING =
    'input:not([type]), input[type="text"], input[type="search"], input[type="number"], input[type="tel"], ' +
    'input[type="email"], input[type="url"], input[type="password"], textarea, [contenteditable="true"]';
// On-screen keyboard (iOS): keeps the thumb bar above the keyboard – but only while a field has the focus and the
// visible area is clearly smaller. Without that, iOS leaves the bar floating after the keyboard closed or while the
// page bounces at its end (#85).
function keepAboveKeyboard(dock) {
    const vv = window.visualViewport;
    if (!vv) return;
    let shift = 0;
    // Moves the bar by value px (0 = at the bottom), only when it changes.
    const apply = (value) => {
        if (value === shift) return;
        shift = value;
        dock.style.transform = value ? `translateY(${-value}px)` : '';
        protectUnderBar();
    };
    // Moves the bar for an open keyboard, otherwise back to the bottom.
    const adjust = () => {
        const field = document.activeElement;
        const typing = !!field && field.matches(TYPING);
        const hidden = window.innerHeight - vv.height;
        if (!typing || hidden <= KEYBOARD_MIN) {
            apply(0);
            return;
        }
        const bottom = Math.round(hidden - Math.max(0, vv.offsetTop));
        apply(bottom > 1 ? bottom : 0);
    };
    vv.addEventListener('resize', adjust);
    vv.addEventListener('scroll', adjust);
    document.addEventListener('focusin', adjust);
    // The keyboard closes: back to the bottom at once, then check again when the focus has settled.
    document.addEventListener('focusout', () => {
        apply(0);
        setTimeout(adjust, 0);
    });
    // At the end of scrolling (iOS has no reliable „scrollend“): check again.
    let timer = 0;
    window.addEventListener(
        'scroll',
        () => {
            clearTimeout(timer);
            timer = setTimeout(adjust, 150);
        },
        { passive: true },
    );
}
