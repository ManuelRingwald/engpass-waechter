// The view „Mehr“: explanation, sources and licences, appearance (#56).

import { state } from './state.js';
import { fetchJson } from './data.js';
import { $, el, t } from './dom.js';
import { protectUnderBar } from './navigation.js';
import { badge } from './ui.js';

// Binds a button that shows and hides a box, filling it when it opens.
export function bindToggle(buttonId, boxId, fill) {
    const button = $(buttonId);
    const box = $(boxId);
    button.addEventListener('click', () => {
        // Everything synchronous: no late jumping of the page.
        const expanded = box.hidden;
        if (expanded) fill(box);
        box.hidden = !expanded;
        button.setAttribute('aria-expanded', String(expanded));
        if (expanded) box.scrollIntoView({ block: 'nearest' });
        protectUnderBar();
    });
}
let contract = null;
const contractLoaded = fetchJson('pruefvertrag.json')
    .then((r) => {
        contract = r.json;
    })
    .catch(() => {});
// Fills the sources and licences from pruefvertrag.json.
export function fillLicenses(box) {
    box.textContent = '';
    // No heading repeating the button that opened this section (#22); the section is named by that button.
    if (!contract) {
        box.append(el('p', {}, 'Die Quellenliste wird geladen …'));
        contractLoaded
            .then(() => {
                if (!box.hidden && contract) fillLicenses(box);
            })
            .catch(() => {
                /* Page is being replaced: nothing more to do */
            });
        return;
    }
    const ul = el('ul', { class: 'quellen' });
    for (const q of contract.quellen) {
        ul.append(
            el(
                'li',
                {},
                el('strong', {}, q.name),
                el('br'),
                `Lizenz: ${q.lizenz}`,
                el('br'),
                el('a', { href: q.lizenzUrl, target: '_blank', rel: 'noopener' }, 'Lizenztext'),
                q.url ? ' · ' : null,
                q.url
                    ? el('a', { href: q.url, target: '_blank', rel: 'noopener' }, 'Quelle')
                    : null,
                q.hinweis ? el('p', { class: 'leise' }, q.hinweis) : null,
            ),
        );
    }
    box.append(ul);
    box.append(
        el(
            'p',
            { class: 'leise' },
            'Diese App ist ein privater Prototyp: keine Konten, keine Werbung, kein Tracking. Deine Medikamente und Einstellungen bleiben auf diesem Gerät. Die App lädt immer die vollständige Liste und vergleicht hier. Wie bei jeder Website sehen die Anbieter der Abrufe (GitHub für App und Tagesdaten, beim Zusatz auch für die RKI-Tabellen) IP-Adresse und Uhrzeit, aber keine Medikamente.',
        ),
    );
}
// Fills the explanation of the terms from regeln.json.
export function fillExplanation(box) {
    box.textContent = '';
    if (!state.rules) {
        box.append(el('p', {}, 'Die Erklärung wird geladen …'));
        return;
    }
    box.append(
        el(
            'p',
            {},
            'Hersteller melden dem Bundesinstitut für Arzneimittel und Medizinprodukte (BfArM), wenn sie ein Arzneimittel voraussichtlich länger als zwei Wochen nicht im üblichen Umfang ausliefern können.',
        ),
        el('p', {}, t('lieferVsVersorgung')),
        el('p', {}, badge('gut'), ' Für dein Medikament ist beim BfArM gerade nichts gemeldet.'),
        el('p', {}, badge('achtung'), ' Ein Hersteller hat einen Lieferengpass gemeldet.'),
        el('p', {}, badge('kritisch'), ` ${state.rules.einstufung['verskri (auch versrel)'].text}`),
        el(
            'p',
            {},
            badge('info'),
            ' Noch keine Tagesdaten, oder die Meldung lässt sich deiner Stärke nicht sicher zuordnen.',
        ),
        el('p', {}, badge('info', t('nurKombinationMarke')), ` ${t('nurKombinationErklaerung')}`),
        el('p', {}, t('luecken')),
        el(
            'p',
            {},
            'Diese Web-App kann dich nicht von sich aus benachrichtigen. Schau hinein, wenn du ein Rezept einlöst oder deine Packung zur Neige geht.',
        ),
        el('p', {}, t('keineBeratung')),
    );
}
const THEME_COLORS = { hell: '#faf6f0', dunkel: '#1a1714' };
export const systemDark = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
export let theme = 'auto';
// Applies the chosen appearance (light, dark or as the system) and marks its button.
export function setTheme(option) {
    theme = option === 'hell' || option === 'dunkel' ? option : 'auto';
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    for (const b of document.querySelectorAll('[data-thema]'))
        b.setAttribute('aria-pressed', String(b.dataset.thema === theme));
    const dark = theme === 'dunkel' || (theme === 'auto' && systemDark && systemDark.matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? THEME_COLORS.dunkel : THEME_COLORS.hell);
}
