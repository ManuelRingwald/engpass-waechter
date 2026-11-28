// Start of the app: loading the daily data, drawing everything, binding the controls (#56).

import { notices, state, STORAGE_KEYS } from './state.js';
import { choosePzn, toOverview } from './choose.js';
import {
    fetchDailyData,
    fetchJson,
    readFromCache,
    renderAsOf,
    renderNotices,
    validateDaily,
    validateHistory,
} from './data.js';
import { renderSubstance } from './detail.js';
import { $, announce, el, formatDateTime, readSetting, saveSetting, t } from './dom.js';
import { guideBack, renderGuide, watchAll } from './guided-choice.js';
import { loadInfections } from './infections.js';
import { buildIndex } from './matching.js';
import { overview } from './mine.js';
import { bindToggle, fillExplanation, fillLicenses, setTheme, systemDark, theme } from './more.js';
import { protectUnderBar, renderView, setupBars, setView } from './navigation.js';
import { openPharmacies } from './pharmacies.js';
import { renderMapChoice } from './pharmacies-entry.js';
import { renderPharmacies } from './pharmacies-view.js';
import { setupTileGestures } from './mine-gestures.js';
import { canScan, openScanner } from './scan.js';
import { loadTestData } from './testdata.js';
import { renderTestDataCard } from './testdata-view.js';
import { sym } from './ui.js';
import { refreshNewPzn, savePzn } from './pzn.js';
import { announceFirst, hitActions, renderHits } from './search.js';
import { migrateSelections, toggleWatch } from './watchlist.js';
import { whatsNew } from './whats-new.js';

// Reason for the notices: null | 'netz' | 'http' | 'defekt' (see fetchDailyData).
export let dataReason = null;
// Loads, checks and takes over the daily data; sets the notices for the reasons.
async function loadDailyData() {
    const previous = state.daily;
    const previousHistory = state.history;
    const [a, v] = await Promise.all([
        fetchDailyData('daten/aktuell.json', (j) => validateDaily(j, previous)),
        fetchDailyData('daten/verlauf.json', (j) => validateHistory(j, previousHistory)),
    ]);
    if (a.json) state.daily = a.json;
    if (v.json) state.history = v.json;
    dataReason = a.grund;
    notices.ausfall.delete('bfarm');
    notices.offline = null;
    if (a.grund === 'defekt')
        notices.ausfall.set(
            'bfarm',
            state.daily
                ? t('datenFehlerhaft', { datum: formatDateTime(state.daily.abgerufen) })
                : t('datenFehlerhaftOhne'),
        );
    else if (a.grund === 'http')
        notices.ausfall.set(
            'bfarm',
            state.daily
                ? t('ausfallTagesdatenAlt', { datum: formatDateTime(state.daily.abgerufen) })
                : t('ausfallTagesdaten'),
        );
    else if (a.grund === 'netz' && !state.daily)
        notices.ausfall.set('bfarm', t('ausfallTagesdaten'));
    if ((a.grund === 'netz' && state.daily) || !navigator.onLine) notices.offline = t('offline');
    renderNotices();
}
// Redraws the current page after new data, without losing the search input.
function renderAll() {
    try {
        buildIndex();
        renderAsOf();
        if (state.selected) renderSubstance(state.selected);
        else if (state.pznNumber) choosePzn(state.pznNumber);
        // A view the person is working in stays open (#61) and shows the reloaded data in place (#65): the guided
        // choice is redrawn only where it changed, keeping inputs, focus and scroll position; the PZN entry redraws
        // its result below the typed PZN. The pharmacies do not depend on the daily data.
        else if (state.guide) renderGuide({ keepScroll: true, keepInputs: true });
        else if (state.newPzn) refreshNewPzn();
        else if (!state.pharmacyView) overview();
        const field = $('#suche');
        if (field.value) renderHits(field.value);
    } catch {
        // Unexpected data must never lead to an empty page.
        $('#kern').textContent = '';
        $('#kern').append(el('div', { class: 'karte' }, el('p', {}, t('darstellungFehler'))));
    }
}
// „Packung scannen“ right at the search field (#77, PZN first): the scanned PZN lands in the search like a typed one.
// Only when the camera can be used; typing always stays possible.
function addSearchScan() {
    if (!canScan() || $('#suche-scannen')) return;
    const field = $('#suche');
    const button = el(
        'button',
        {
            type: 'button',
            class: 'knopf zweit scan-suche',
            id: 'suche-scannen',
            'data-testid': 'suche-scannen',
            // The visible word is part of the name (WCAG 2.5.3): „Scannen“ in „Packung scannen“.
            'aria-label': t('scanKnopf'),
            onclick: () =>
                openScanner((p) => {
                    // Same PZN again: the list does not change, so say it right away; otherwise before the hits.
                    if (field.value === p) announce(t('ansagePznErkannt'));
                    else announceFirst(t('ansagePznErkannt'));
                    field.value = p;
                    field.dispatchEvent(new Event('input'));
                    field.focus();
                }, button),
        },
        sym('kamera'),
        el('span', {}, t('scanKurz')),
    );
    $('#suchleiste').append(button);
}
// Binds all fixed controls of index.html (thumb bar, search, theme, toggles).
function bindControls() {
    setupBars();
    setupTileGestures();
    setTheme(readSetting(STORAGE_KEYS.thema, 'auto'));
    for (const b of document.querySelectorAll('[data-thema]')) {
        b.addEventListener('click', () => {
            setTheme(b.dataset.thema);
            saveSetting(STORAGE_KEYS.thema, theme);
        });
    }
    if (systemDark && systemDark.addEventListener)
        systemDark.addEventListener('change', () => setTheme(theme));
    for (const tab of document.querySelectorAll('.tab')) {
        tab.addEventListener('click', () =>
            setView(tab.dataset.tab, { fokus: tab.dataset.tab === 'suchen' }),
        );
    }
    $('#zurueck').addEventListener('click', () => {
        if (state.pharmacyView) {
            if (state.pharmacyView.blatt) {
                state.pharmacyView.blatt = null;
                renderPharmacies();
                return;
            }
            const z = state.pharmacyView.zurueck;
            state.pharmacyView = null;
            if (z) z();
            else toOverview();
        } else if (state.guide) guideBack();
        else if (state.newPzn) {
            const z = state.newPzn.zurueck;
            state.newPzn = null;
            if (z) z();
            else toOverview();
        } else toOverview();
    });
    $('#haupt').addEventListener('click', () => {
        if (state.newPzn) savePzn();
        else if (state.guide) watchAll();
    });
    $('#merken').addEventListener('click', () => {
        if (state.selected) toggleWatch(state.selected);
    });
    const field = $('#suche');
    // The search form never submits (no inline handler, so the Content-Security-Policy needs none) (#51).
    $('#suchleiste').addEventListener('submit', (e) => e.preventDefault());
    $('#suche-loeschen').addEventListener('click', () => {
        field.value = '';
        renderHits('');
        field.focus();
    });
    field.addEventListener('input', () => {
        if (field.value && state.view !== 'suchen') {
            state.view = 'suchen';
            renderView();
            window.scrollTo(0, 0);
        }
        renderHits(field.value);
        protectUnderBar();
    });
    field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const b = $('#treffer button');
            if (b) b.click();
        }
    });
    $('#treffer').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-nr]');
        if (b && $('#treffer').contains(b)) {
            const fn = hitActions[Number(b.dataset.nr)];
            if (fn) fn();
        }
    });
    bindToggle('#lizenzen-oeffnen', '#lizenzen', fillLicenses);
    // Pharmacies (#15): entry under „Mehr“ and choice of the map app for „Route“.
    $('#apotheken-oeffnen').addEventListener('click', () => {
        if (state.rules)
            openPharmacies({
                zurueck: () => {
                    state.view = 'mehr';
                    overview();
                },
            });
    });
    renderMapChoice();
    for (const b of document.querySelectorAll('[data-karte]'))
        b.addEventListener('click', () => {
            saveSetting(STORAGE_KEYS.karte, b.dataset.karte);
            renderMapChoice();
        });
    bindToggle('#erklaerung-oeffnen', '#erklaerung', fillExplanation);
}
// Starts the app: rules and master data, then the stored and the fresh daily data.
export async function start() {
    // Bind the controls right away – not only after the rules and daily data are loaded.
    bindControls();
    try {
        state.rules = (await fetchJson('stamm/regeln.json')).json;
        state.substanceList = (await fetchJson('stamm/wirkstoffe.json')).json.wirkstoffe;
        state.tradeNames = await fetchJson('stamm/handelsnamen.json')
            .then((r) => r.json.eintraege)
            .catch(() => []);
        state.saltPattern = new RegExp(`^(?:${state.rules.abgleich.salzEndungen.join('|')})`);
        addSearchScan();
        migrateSelections();
        if (state.lastVersion)
            whatsNew(state.lastVersion).catch(() => {
                /* No card this time (#39: never an unhandled rejection) */
            });
    } catch {
        state.rules = null;
        $('#kern').textContent = '';
        $('#kern').append(
            el(
                'div',
                { class: 'karte' },
                el(
                    'p',
                    {},
                    'Die App konnte nicht vollständig geladen werden. Öffne sie bitte später noch einmal.',
                ),
            ),
        );
        notices.ausfall.set('app', 'Die App konnte nicht vollständig geladen werden.');
        renderNotices();
        return;
    }
    window.addEventListener('online', () => {
        if (notices.offline) {
            loadDailyData()
                .then(() => {
                    buildIndex();
                    renderAsOf();
                    if (
                        !state.selected &&
                        !state.pznNumber &&
                        !state.guide &&
                        !state.newPzn &&
                        !state.pharmacyView
                    )
                        overview();
                })
                .catch(() => {
                    /* next time */
                });
        }
    });
    window.addEventListener('offline', () => {
        notices.offline = t('offline');
        renderNotices();
    });
    window.addEventListener('popstate', () => {
        if (
            state.selected ||
            state.pznNumber ||
            state.guide ||
            state.newPzn ||
            state.pharmacyView
        ) {
            overview();
            window.scrollTo(0, 0);
        }
    });
    // First show the last stored daily data at once (fast start, also without network), then refresh from the network.
    // If nothing is stored yet (first start), load right away.
    const [oldDaily, oldHistory] = await Promise.all([
        readFromCache('daten/aktuell.json', (j) => validateDaily(j, null)),
        readFromCache('daten/verlauf.json', (j) => validateHistory(j, null)),
    ]);
    if (oldDaily) {
        state.daily = oldDaily;
        state.history = oldHistory;
    }
    renderAll();
    // Test data of this device (#79): read after the first drawing, so the start is never slower; then the views that
    // use it are drawn again.
    if (state.rules) {
        renderTestDataCard();
        loadTestData()
            .then((data) => {
                renderTestDataCard();
                if (data) renderAll();
            })
            .catch(() => {
                /* No test data */
            });
    }
    // Never let an error while refreshing end as an unhandled error (#39: WebKit reports „Context is stopped“ when the
    // page is being replaced while a request or cache access is still running).
    const refreshData = async () => {
        await loadDailyData();
        renderAll();
        await loadInfections();
    };
    // Refreshes the daily data from the network in the background.
    const reload = () => {
        refreshData().catch(() => {
            /* Page is being replaced: nothing more to do */
        });
    };
    if (state.daily) setTimeout(reload, 1200);
    else reload();
}
