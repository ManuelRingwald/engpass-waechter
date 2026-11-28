// Engpass-Wächter – reads opening hours from OpenStreetMap (opening_hours) and determines the status „now“ (issue #15).
// A small parser of its own for the common patterns; everything else counts as „unknown – call“ (never wrongly „open“).
// Rules: stamm/regeln.json → apotheken.oeffnungszeiten. Runs in the browser (window.EWOeffnungszeiten) and in Node
// (checks). Understood: „24/7“; rules separated by „;“, later rules override earlier ones for the same days; days Mo Tu
// We Th Fr Sa Su, ranges („Mo-Fr“, also across Sunday „Fr-Mo“), lists („Mo,We,Fr“), „PH“ (public holiday); several time
// windows („08:00-12:30,14:00-18:30“); across midnight („22:00-02:00“), „24:00“ as end; „off“/„closed“. A rule without
// days applies to all days. Public holidays: the nationwide statutory holidays are built in. On a public holiday the
// app only claims „open“ if the data says so explicitly („24/7“ or a rule with „PH“); otherwise „Heute ist Feiertag –
// Notdienst nutzen oder anrufen“.
'use strict';
(function (globalRoot) {
    const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const DAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    // Public holidays (nationwide)
    function easterSunday(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }
    const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const holidayCache = new Map();
    // The nationwide public holidays of a year (cached per year).
    function holidaysIn(year) {
        if (holidayCache.has(year)) return holidayCache.get(year);
        const o = easterSunday(year);
        const plus = (n) => new Date(o.getFullYear(), o.getMonth(), o.getDate() + n);
        const list = [
            [new Date(year, 0, 1), 'Neujahr'],
            [plus(-2), 'Karfreitag'],
            [plus(1), 'Ostermontag'],
            [new Date(year, 4, 1), 'Tag der Arbeit'],
            [plus(39), 'Christi Himmelfahrt'],
            [plus(50), 'Pfingstmontag'],
            [new Date(year, 9, 3), 'Tag der Deutschen Einheit'],
            [new Date(year, 11, 25), '1. Weihnachtstag'],
            [new Date(year, 11, 26), '2. Weihnachtstag'],
        ];
        const m = new Map(list.map(([d, n]) => [dateKey(d), n]));
        holidayCache.set(year, m);
        return m;
    }
    const holiday = (date) => holidaysIn(date.getFullYear()).get(dateKey(date)) || null;

    // Reading
    const time = (s) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(s);
        if (!m) return null;
        const h = +m[1];
        const mi = +m[2];
        return h > 24 || mi > 59 || (h === 24 && mi) ? null : h * 60 + mi;
    };
    // Reads time windows („08:00-12:30,14:00-18:30“) as minutes; null when not understood.
    function times(text) {
        const slots = [];
        for (const part of text.split(/\s*,\s*/)) {
            const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(part);
            if (!m) return null;
            const a = time(m[1]);
            let b = time(m[2]);
            if (a === null || b === null || a >= 1440) return null;
            // Across midnight
            if (b <= a) b += 1440;
            slots.push([a, b]);
        }
        return slots.sort((x, y) => x[0] - y[0]);
    }
    // Reads days, ranges, lists and „PH“; null when not understood.
    function days(text) {
        const r = { tage: new Set(), ph: false };
        for (const part of text.split(/\s*,\s*/)) {
            if (part === 'PH') {
                r.ph = true;
                continue;
            }
            const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part);
            if (!m) return null;
            const a = DAYS.indexOf(m[1]);
            const b = m[2] ? DAYS.indexOf(m[2]) : a;
            for (let i = a; ; i = (i + 1) % 7) {
                r.tage.add(i);
                if (i === b) break;
            }
        }
        return r;
    }
    // Result: { immer: true } | { woche: [7 × list of [from, to] in minutes], ph: null | list } | null (cannot be
    // evaluated)
    function parse(text) {
        const s = String(text || '').trim();
        if (!s) return null;
        if (/^24\s*\/\s*7$/.test(s)) return { immer: true };
        if (s.includes('||') || /"/.test(s)) return null;
        const week = Array.from({ length: 7 }, () => []);
        let ph = null;
        for (const rule of s.split(/\s*;\s*/).filter(Boolean)) {
            const m =
                /^(?:((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+)?(.+)$/.exec(
                    rule,
                );
            if (!m) return null;
            const t = m[1] ? days(m[1]) : { tage: new Set([0, 1, 2, 3, 4, 5, 6]), ph: false };
            if (!t) return null;
            const rest = m[2].trim();
            const slots = /^(off|closed)$/i.test(rest) ? [] : times(rest);
            if (!slots) return null;
            for (const d of t.tage) week[d] = slots;
            if (t.ph) ph = slots;
        }
        if (week.every((f) => f.length === 1 && f[0][0] === 0 && f[0][1] === 1440))
            return { immer: true };
        return { woche: week, ph };
    }

    // Status now
    const hhmm = (min) => {
        const m = ((min % 1440) + 1440) % 1440;
        return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    };
    // 0 = Monday
    const weekday = (d) => (d.getDay() + 6) % 7;
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    // Time windows of a calendar day (minutes from the start of the day), public holidays considered; null = no
    // statement possible for that day.
    function slotsOn(o, date) {
        // Without a „PH“ rule: no statement
        if (holiday(date)) return o.ph;
        return o.woche[weekday(date)];
    }
    const TEXT = {
        unbekannt: 'Öffnungszeiten unbekannt – ruf an',
        feiertag: 'Heute ist Feiertag – Notdienst nutzen oder anrufen',
        immer: 'Rund um die Uhr geöffnet',
    };
    // Result: { art: 'offen' | 'zu' | 'unbekannt' | 'feiertag', offen: bool, text }
    function status(text, now = new Date()) {
        const o = parse(text);
        if (!o) return { art: 'unbekannt', offen: false, text: TEXT.unbekannt };
        if (o.immer) return { art: 'offen', offen: true, text: TEXT.immer };
        const today = startOfDay(now);
        const m = now.getHours() * 60 + now.getMinutes();
        // Window started yesterday across midnight?
        const yesterday = slotsOn(o, addDays(today, -1));
        for (const [, b] of yesterday || [])
            if (b > 1440 && m < b - 1440)
                return { art: 'offen', offen: true, text: `Jetzt geöffnet bis ${hhmm(b)}` };
        const todaySlots = slotsOn(o, today);
        if (todaySlots === null) return { art: 'feiertag', offen: false, text: TEXT.feiertag };
        for (const [a, b] of todaySlots)
            if (m >= a && m < b)
                return { art: 'offen', offen: true, text: `Jetzt geöffnet bis ${hhmm(b)}` };
        // Next opening in the coming 7 days (days without a safe statement, e.g. public holidays, are skipped).
        for (let n = 0; n <= 7; n++) {
            const f = slotsOn(o, addDays(today, n));
            if (!f) continue;
            const next = f.find(([a]) => n > 0 || a > m);
            if (!next) continue;
            const when =
                n === 0 ? 'heute' : n === 1 ? 'morgen' : DAYS_DE[weekday(addDays(today, n))];
            return {
                art: 'zu',
                offen: false,
                text: `Geschlossen – öffnet ${when} ${hhmm(next[0])}`,
            };
        }
        return { art: 'zu', offen: false, text: 'Geschlossen' };
    }

    // Readable week overview
    const slotsText = (f) =>
        f.length
            ? f.map(([a, b]) => `${hhmm(a)}–${b === 1440 ? '24:00' : hhmm(b)}`).join(', ')
            : 'geschlossen';
    // Week overview as text lines, days with the same times combined.
    function readable(text) {
        const o = parse(text);
        if (!o) return null;
        if (o.immer) return ['Rund um die Uhr (24/7)'];
        const rows = [];
        for (let i = 0; i < 7;) {
            const t = slotsText(o.woche[i]);
            let j = i;
            while (j + 1 < 7 && slotsText(o.woche[j + 1]) === t) j++;
            rows.push(`${i === j ? DAYS_DE[i] : `${DAYS_DE[i]}–${DAYS_DE[j]}`} ${t}`);
            i = j + 1;
        }
        rows.push(`Feiertage ${o.ph ? slotsText(o.ph) : 'nicht angegeben – ruf an'}`);
        return rows;
    }

    const api = {
        lies: parse,
        status,
        lesbar: readable,
        feiertag: holiday,
        ostersonntag: easterSunday,
        TEXT,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else globalRoot.EWOeffnungszeiten = api;
})(typeof window !== 'undefined' ? window : globalThis);
