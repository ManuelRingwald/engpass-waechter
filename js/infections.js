// Extra: infection figures of the RKI (influenza, RSV) in „Neuigkeiten → Allgemein“ (#56).

import { notices, state, STORAGE_KEYS } from './state.js';
import { fetchText, renderNotices } from './data.js';
import { el, plural, readSetting, saveSetting, t } from './dom.js';
import { dataAttrs } from './ui.js';

const RKI_SOURCES = {
    influenza: {
        name: 'Grippe (Influenza)',
        url: 'https://raw.githubusercontent.com/robert-koch-institut/Influenzafaelle_in_Deutschland/main/IfSG_Influenzafaelle.tsv',
    },
    rsv: {
        name: 'RSV',
        url: 'https://raw.githubusercontent.com/robert-koch-institut/Respiratorische_Synzytialvirusfaelle_in_Deutschland/main/IfSG_RSVfaelle.tsv',
    },
};

// Returns the Sunday of an ISO week („2025-W03“) as YYYY-MM-DD.
function isoWeekEnd(w) {
    const [j, k] = w.split('-W').map(Number);
    const jan4 = new Date(Date.UTC(j, 0, 4));
    const monday = new Date(
        jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 864e5 + (k - 1) * 7 * 864e5,
    );
    return new Date(monday.getTime() + 6 * 864e5).toISOString().slice(0, 10);
}
// „2026-W47“ as words (#22): „Kalenderwoche 47/2026“ – no abbreviation that VoiceOver spells out.
const weekText = (w) => {
    const [year, week] = w.split('-W');
    return t('kalenderwoche', { woche: Number(week), jahr: year });
};
// Reads the RKI table: cases of the last two weeks for the chosen region, all ages.
function evaluateRki(tsv, region) {
    const rows = tsv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const header = rows.shift().split('\t');
    const i = (n) => header.indexOf(n);
    const [iW, iR, iA, iF, iI] = [
        'Meldewoche',
        'Region',
        'Altersgruppe',
        'Fallzahl',
        'Inzidenz',
    ].map(i);
    if ([iW, iR, iA, iF, iI].some((x) => x < 0)) throw new Error('Format der RKI-Daten unbekannt');
    const regions = new Set();
    const series = [];
    for (const z of rows) {
        const f = z.split('\t');
        if (f[iA] !== '00+') continue;
        regions.add(f[iR]);
        if (f[iR] === region)
            series.push({ woche: f[iW], faelle: Number(f[iF]), inzidenz: Number(f[iI]) });
    }
    series.sort((a, b) => a.woche.localeCompare(b.woche));
    if (series.length < 2) throw new Error('Zu wenige RKI-Werte');
    return {
        laender: [...regions].sort((a, b) => a.localeCompare(b, 'de')),
        jetzt: series[series.length - 1],
        vorher: series[series.length - 2],
    };
}
let rkiText = null;
// Loads and checks the RKI figures for influenza and RSV.
export async function loadInfections() {
    try {
        const [inf, rsv] = await Promise.all([
            fetchText(RKI_SOURCES.influenza.url),
            fetchText(RKI_SOURCES.rsv.url),
        ]);
        // Check right away, even if „Neuigkeiten“ is not open: report broken data instead of silently dropping it.
        const region = readSetting(STORAGE_KEYS.land, 'Deutschland');
        evaluateRki(inf, region);
        evaluateRki(rsv, region);
        rkiText = { influenza: inf, rsv };
        notices.ausfall.delete('rki');
    } catch {
        rkiText = null;
        notices.ausfall.set('rki', t('ausfallInfekt'));
    }
    renderInfections();
    renderNotices();
}
// Draws the infection figures under „Neuigkeiten“ with source and date.
export function renderInfections() {
    const box = document.getElementById('zusatz');
    if (!box) return;
    box.textContent = '';
    box.append(el('h3', {}, t('infektTitel')));
    if (!rkiText) {
        box.append(
            el(
                'p',
                { class: 'leise' },
                notices.ausfall.has('rki')
                    ? t('ausfallInfekt')
                    : 'Die Infektdaten werden geladen …',
            ),
        );
        return;
    }
    const region = readSetting(STORAGE_KEYS.land, 'Deutschland');
    let values;
    try {
        values = Object.fromEntries(
            Object.entries(rkiText).map(([k, v]) => [k, evaluateRki(v, region)]),
        );
    } catch {
        notices.ausfall.set('rki', t('ausfallInfekt'));
        renderNotices();
        box.append(el('p', { class: 'leise' }, t('ausfallInfekt')));
        return;
    }
    const demand = state.daily
        ? state.daily.meldungen.filter((m) => m.grund === 'Erhöhte Nachfrage').length
        : null;
    const selection = el(
        'select',
        {
            id: 'land',
            onchange: (e) => {
                saveSetting(STORAGE_KEYS.land, e.target.value);
                renderInfections();
            },
        },
        values.influenza.laender.map((l) => el('option', { value: l, selected: l === region }, l)),
    );
    // One line per infection: this week compared with the week before.
    const row = (k) => {
        const { jetzt: now, vorher: previous } = values[k];
        const direction =
            now.faelle > previous.faelle
                ? 'mehr als'
                : now.faelle < previous.faelle
                  ? 'weniger als'
                  : 'genauso viele wie';
        return el(
            'p',
            dataAttrs('rki', isoWeekEnd(now.woche)),
            `${RKI_SOURCES[k].name}, ${weekText(now.woche)}: ${now.faelle.toLocaleString('de-DE')} ${plural(now.faelle, 'gemeldeter Fall', 'gemeldete Fälle')} – ${direction} in der Vorwoche (${previous.faelle.toLocaleString('de-DE')}).`,
        );
    };
    box.append(
        el('label', { class: 'feldtitel', for: 'land' }, 'Bundesland'),
        selection,
        row('influenza'),
        row('rsv'),
        el(
            'p',
            { class: 'leise' },
            `Quelle: Robert Koch-Institut, CC BY 4.0. ${t('rkiVeraendert')}`,
        ),
        demand !== null
            ? el('p', { class: 'leise' }, t('infektNachfrage', { anzahl: demand }))
            : null,
    );
}
