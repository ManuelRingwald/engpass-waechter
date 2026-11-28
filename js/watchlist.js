// The personal list „Meine“: stored entries, watching a substance, saving a strength/form and what was new since the
// last look (#56).

import { state, STORAGE_KEYS } from './state.js';
import { renderSubstance } from './detail.js';
import { formatDate, norm, readSetting, saveSetting, t } from './dom.js';
import { grouping, selectionOf } from './matching.js';

export function myList() {
    return readSetting(STORAGE_KEYS.meine, []);
}
// Once at start (regeln.json → abgleich.eingabe): earlier free-text strengths („16 mg Tabletten“) are not guessed but
// dropped; the app asks for a new input as number and unit. Values from the number field (v: 2) stay, a decimal point
// becomes a comma. Result: marker v: 3.
export function migrateSelections() {
    const list = myList();
    let changed = false;
    for (const e of list) {
        const a = e.auswahl;
        if (!a || a.v === 3) continue;
        if (a.v === 2) a.staerke = a.staerke ? a.staerke.replace(/(\d)\.(\d)/g, '$1,$2') : null;
        else if (a.staerke) {
            a.alt = a.staerke;
            a.staerke = null;
            a.neuEingeben = true;
        }
        a.v = 3;
        if (!a.staerke && !a.form && !a.neuEingeben) e.auswahl = null;
        changed = true;
    }
    if (changed) saveSetting(STORAGE_KEYS.meine, list);
}
export const myEntry = (w) => myList().find((x) => norm(x.n) === norm(w.n)) || null;
export function isMine(w) {
    return !!myEntry(w);
}
let lastToggle = 0;
// Adds a substance to „Meine“ or removes it.
export function toggleWatch(w) {
    // An accidental double tap must not remove what was just saved.
    if (Date.now() - lastToggle < 800) return;
    lastToggle = Date.now();
    state.feedback = isMine(w) ? t('entfernt') : t('hinzugefuegt');
    const list = myList();
    const i = list.findIndex((x) => norm(x.n) === norm(w.n));
    if (i >= 0) list.splice(i, 1);
    else list.push({ n: w.n, atc: w.atc, a: (w.a || []).slice(0, 8), auswahl: null });
    saveSetting(STORAGE_KEYS.meine, list);
    markSeen(w);
    renderSubstance(w);
}
// Saves the own strength and form for a substance in „Meine“.
export function saveSelection(w, selection) {
    const list = myList();
    let e = list.find((x) => norm(x.n) === norm(w.n));
    if (!e) {
        e = { n: w.n, atc: w.atc, a: (w.a || []).slice(0, 8) };
        list.push(e);
    }
    e.auswahl =
        selection && (selection.staerke || selection.form)
            ? { staerke: selection.staerke || null, form: selection.form || null, v: 3 }
            : null;
    if (state.strengthHint && state.strengthHint.w === w) state.strengthHint = null;
    saveSetting(STORAGE_KEYS.meine, list);
    markSeen(w);
    // „Auswahl speichern“ confirms it (#22, WCAG 3.3.1/4.1.3): visible and announced once.
    state.feedback = t('auswahlGespeichert');
    renderSubstance(w);
}
// „Weiß nicht“ to the question for the form: remember it, do not ask again.
export function formUnknown(w) {
    const list = myList();
    const e = list.find((x) => norm(x.n) === norm(w.n));
    if (e) {
        e.formGefragt = true;
        saveSetting(STORAGE_KEYS.meine, list);
    }
    renderSubstance(w);
}
// Affected reports of an own substance under its own choice: the basis for „Seit deinem letzten Blick“
// (regeln.json → abgleich.seitLetztemBlick), stored only on the device.
function ownReports(w) {
    const e = myEntry(w);
    return grouping(w, selectionOf(e)).betroffen;
}
// Remembers which reports of an own substance were seen now.
export function markSeen(w) {
    if (!state.daily || !isMine(w)) return;
    const g = readSetting(STORAGE_KEYS.gesehen, {});
    const ms = ownReports(w);
    g[norm(w.n)] = {
        am: new Date().toISOString(),
        ids: ms.map((m) => m.id),
        enden: Object.fromEntries(ms.map((m) => [m.id, m.ende])),
    };
    saveSetting(STORAGE_KEYS.gesehen, g);
}
// What changed for an own substance since the last look; null when nothing.
export function sinceLastSeen(w) {
    const g = readSetting(STORAGE_KEYS.gesehen, {})[norm(w.n)];
    if (!g || !state.daily) return null;
    const ms = ownReports(w);
    const now = new Set(ms.map((m) => m.id));
    const added = ms.filter((m) => !g.ids.includes(m.id)).length;
    const removed = g.ids.filter((id) => !now.has(id)).length;
    const postponed = ms.filter((m) => g.ids.includes(m.id) && g.enden[m.id] !== m.ende).length;
    return added || removed || postponed
        ? { am: g.am, neu: added, weg: removed, verschoben: postponed }
        : null;
}
// Text for the changes since the last look.
export function lastSeenText(b) {
    const parts = [];
    if (b.neu) parts.push(`${b.neu} neu gemeldet`);
    if (b.weg) parts.push(`${b.weg} nicht mehr gemeldet`);
    if (b.verschoben) parts.push(`${b.verschoben} × erwartetes Ende verschoben`);
    return `${t('seitBlick', { datum: formatDate(b.am) })} ${parts.join(', ')}.`;
}
