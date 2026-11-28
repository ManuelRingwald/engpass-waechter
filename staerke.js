// Engpass-Wächter – reads the strength from the product name and compares it with the own input. Rules:
// stamm/regeln.json → abgleich.staerke and abgleich.auswahl. Runs in the browser (window.EWStaerke) and in Node
// (tools).
'use strict';
(function (globalRoot) {
    // Number: „40 000“ and „40.000“ = thousands, „0,25“ = decimal comma.
    const NUMBER = String.raw`\d{1,3}(?:[ .]\d{3})+(?![\d,])|\d+(?:,\d+)?`;
    const UNIT = String.raw`mikrogramm|microgramm|milligramm|mcg|µg|μg|mg|gramm|g|ml|mmol|mio\.?\s?(?:i\.\s?e\.|e\.?|einheiten)|i\.\s?e\.|ie|ph\.\s?eur\.-einheiten|einheiten|e\.|mega|%`;
    const BASIS = String.raw`h|stunden?|24\s?stunden|dosis|hub|sprühstoß|ml|tag`;
    const WITH_UNIT = new RegExp(
        String.raw`(?:^|[^\wäöüß])((?:${NUMBER})\s*(?:${UNIT})(?![a-zäöüß])(?:\s*\/\s*(?:(?:${NUMBER})\s*)?(?:${UNIT}|${BASIS})(?![a-zäöüß]))?)`,
        'i',
    );
    // Number without unit as a word of its own, e.g. „Thevier 100“, „Propranolol AL 80“, „BisoHEXAL plus 5/12,5“.
    const WITHOUT_UNIT = new RegExp(
        String.raw`(?:^|\s)((?:${NUMBER})(?:\/(?:${NUMBER}))?)(?=\s|-|$)`,
        'i',
    );
    // „1 A Pharma“ is a company name, not a strength
    const COMPANIES = /\b1\s?A Pharma\b|\bTS\s?-\s?1\b/gi;
    // First standalone number in the name and what directly follows it (for „unknown unit“).
    const FIRST_NUMBER = new RegExp(String.raw`(?:^|[\s(])(${NUMBER})`);
    // After the number an unknown abbreviation („Mio.E“, „Tbl.“) or something with a slash („xy/ml“) → unit unknown.
    const UNKNOWN_AFTER = /^\s*(?:[a-zäöüßµμ]{1,6}\.|[a-zäöüßµμ.]{1,8}\s*\/)/i;

    // Normalise units: „Mikrogramm“, „mcg“ → „µg“; „I.E.“ → „IE“; thousands without separator; comma = dot.
    function unify(s) {
        return String(s || '')
            .toLowerCase()
            .replace(
                /(?<![\d.,])(\d{1,3})(?:[ .](\d{3}))(?:[ .](\d{3}))?(?![\d,.])/g,
                (x, a, b, c) => (a === '0' ? x : a + b + (c || '')),
            )
            .replace(/,/g, '.')
            .replace(/mikrogramm|microgramm|mcg|μg/g, 'µg')
            .replace(/milligramm/g, 'mg')
            .replace(/gramm/g, 'g')
            .replace(/mio\.?\s?(?:i\.\s?e\.|e\.?|einheiten)(?![a-zäöüß])/g, 'mio ie')
            .replace(/ph\.\s?eur\.-einheiten/g, 'einheiten')
            .replace(/i\.\s?e\./g, 'ie')
            .replace(/(\d)\s*e\.(?=\s|\/|$)/g, '$1 einheiten')
            .replace(/24\s?stunden/g, '24 h')
            .replace(/\bstunden?\b/g, 'h')
            .replace(/\s*\/\s*/g, '/')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const withDecimalComma = (s) => s.replace(/(\d)\.(\d)/g, '$1,$2');
    // Result: { text: display, ohneEinheit, unsicher } or null (no number in the name). unsicher: the strength cannot
    // be read safely (unknown unit, only a volume, an earlier number before the strength). Then never take the next
    // best number, but „Stärke unklar“.
    const UNCERTAIN = { text: null, ohneEinheit: false, unsicher: true };
    // Reads the strength from a product name.
    function strengthOf(name) {
        const n = String(name || '').replace(COMPANIES, ' ');
        const firstMatch = n.match(FIRST_NUMBER);
        const firstPos = firstMatch ? firstMatch.index + firstMatch[0].indexOf(firstMatch[1]) : -1;
        const m = n.match(WITH_UNIT);
        if (m) {
            const position = m.index + m[0].indexOf(m[1]);
            // E.g. „Nivestim 30 Xy/0,5 ml“
            if (firstPos >= 0 && firstPos < position) return UNCERTAIN;
            const text = unify(m[1])
                .replace(/(\d)\s*([a-zµ%])/g, '$1 $2')
                .replace(/\bmio ie\b/g, 'Mio. I.E.')
                .replace(/\bie\b/g, 'I.E.')
                .replace(/\beinheiten\b/g, 'Einheiten')
                .replace(/\bmega\b/g, 'Mega');
            // A volume alone is no strength
            if (/^[\d.]+ ml$/.test(text)) return UNCERTAIN;
            return { text: withDecimalComma(text), ohneEinheit: false, unsicher: false };
        }
        const o = n.match(WITHOUT_UNIT);
        if (o) {
            const after = n.slice(o.index + o[0].length);
            // Unknown unit, e.g. „30 Mio.E/…“
            if (UNKNOWN_AFTER.test(after)) return UNCERTAIN;
            return { text: withDecimalComma(unify(o[1])), ohneEinheit: true, unsicher: false };
        }
        // Number directly followed by an unknown unit
        if (firstMatch) return UNCERTAIN;
        return null;
    }
    // Strength for display, with „Stärke unklar“ or „Einheit nicht angegeben“ when needed.
    const display = (st) =>
        !st
            ? null
            : st.unsicher
              ? 'Stärke unklar'
              : st.ohneEinheit
                ? `${st.text} (Einheit nicht angegeben)`
                : st.text;

    // Robust comparison (round 2): normalise and convert number and unit. Canonical spelling: units as fixed
    // abbreviations (µg, mg, g, ml, mmol, %, e = units/I.E., mioe = million units), reference h, 24h, dosis (puff,
    // spray, dose, inhalation), tag; decimal point; thousands without separator.
    function canonical(s) {
        return String(s || '')
            .toLowerCase()
            .replace(
                /(?<![\d.,])(\d{1,3})(?:[ .](\d{3}))(?:[ .](\d{3}))?(?![\d,.])/g,
                (x, a, b, c) => (a === '0' ? x : a + b + (c || '')),
            )
            .replace(/(\d),(\d)/g, '$1.$2')
            .replace(/mikrogramm|microgramm|mcg|μg|\bug\b|(\d)\s*ug\b/g, (x, z) =>
                z ? `${z} µg` : 'µg',
            )
            .replace(/milligramm/g, 'mg')
            .replace(/(\d)\s*gramm/g, '$1 g')
            .replace(/mio\.?\s?(?:i\.?\s?e\.?|ie|einheiten|e\.?)(?![a-zäöüß])/g, 'mioe')
            .replace(/(\d)\s*mega\b/g, '$1 mioe')
            .replace(
                /ph\.\s?eur\.-einheiten|internationale einheiten|einheiten|einheit|i\.\s?e\.?|\bie\b/g,
                'e',
            )
            .replace(/(\d)\s*e\.?(?=\s*\/|\s|$)/g, '$1 e')
            .replace(/24\s?(?:h|std\.?|stunden?)(?![a-zäöüß])/g, '24h')
            .replace(/(\/\s*)(?:stunden?|std\.?)(?![a-zäöüß])/g, '$1h')
            .replace(/sprühstoß|sprühstoss|einzeldosis|dosis|inhalation|hub/g, 'dosis')
            .replace(/\s*\/\s*/g, '/')
            .replace(/\s+/g, ' ')
            .trim();
    }
    const UNITS = {
        µg: ['masse', 1],
        mg: ['masse', 1e3],
        g: ['masse', 1e6],
        ml: ['volumen', 1],
        mmol: ['stoff', 1],
        '%': ['prozent', 1],
        e: ['einheiten', 1],
        mioe: ['einheiten', 1e6],
    };
    const BASES = ['ml', 'h', '24h', 'dosis', 'tag', 'g'];
    const SPLIT_PATTERN =
        /(\d+(?:\.\d+)?)\s*(µg|mg|g|ml|mmol|%|mioe|e)?(?![a-zäöüß\d])(?:\/(\d+(?:\.\d+)?)?\s*(µg|mg|g|ml|mmol|%|mioe|e|h|24h|dosis|tag)?(?![a-zäöüß]))?/;
    // Splits a strength (from a report or an input) into parts; null without a number. { teile: [{ roh, wert, dim }],
    // bezug: null | { typ, menge } } – wert in the base unit (µg, units, ml …), dim null = without unit.
    function split(text) {
        const m = canonical(text).match(SPLIT_PATTERN);
        if (!m) return null;
        // One part of a strength: raw number, value in the base unit and dimension.
        const part = (number, unit) => {
            const raw = Number(number);
            const e = unit && UNITS[unit];
            return { roh: raw, wert: e ? raw * e[1] : raw, dim: e ? e[0] : null };
        };
        const firstEntry = part(m[1], m[2]);
        const r = { teile: [firstEntry], bezug: null };
        if (m[3] !== undefined || m[4] !== undefined) {
            const secondIsAmount =
                m[3] !== undefined &&
                (!m[4] ||
                    (UNITS[m[4]] &&
                        m[4] !== 'ml' &&
                        !(m[4] === 'g' && firstEntry.dim === 'masse' && Number(m[3]) === 1)));
            if (secondIsAmount)
                // Combination, e.g. 160 mg/12,5 mg or 5/12,5
                r.teile.push(part(m[3], m[4]));
            else if (m[4] && BASES.includes(m[4]))
                // Per ml, per h, per puff …
                r.bezug = { typ: m[4], menge: m[3] !== undefined ? Number(m[3]) : 1 };
        }
        return r;
    }
    const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    const thousands = (a, b) => [1e3, 1e6, 1e-3, 1e-6].some((f) => same(a / b, f));

    // Compares the strength of a report (product name) with the own input → 'passt' | 'andere' | 'unklar'. Principle:
    // what cannot be assigned safely is 'unklar' (shown), never 'andere' (would be hidden).
    function compare(name, input) {
        if (!input) return 'passt';
        const U = split(input);
        // No number given → any strength
        if (!U) return 'passt';
        const st = strengthOf(name);
        // Strength of the report not (safely) readable
        if (!st || st.unsicher) return 'unklar';
        const M = split(st.text);
        if (!M) return 'unklar';
        const mt = M.teile;
        const ut = U.teile;
        if (mt.length > 1 && ut.length > 1) {
            // Both combinations: compare all parts
            if (mt.length !== ut.length) return 'unklar';
            const e = mt.map((m, i) => single(m, null, ut[i], null));
            return e.includes('andere') ? 'andere' : e.includes('unklar') ? 'unklar' : 'passt';
        }
        if (mt.length > 1 || ut.length > 1) {
            // Only one side is a combination
            const many = mt.length > 1 ? mt : ut;
            const singleSide = mt.length > 1 ? ut[0] : mt[0];
            // Sum of the parts (e.g. 960 for 800/160) → unklar
            if (
                same(
                    many.reduce((x, t) => x + t.roh, 0),
                    singleSide.roh,
                ) ||
                same(
                    many.reduce((x, t) => x + t.wert, 0),
                    singleSide.wert,
                )
            )
                return 'unklar';
            const firstEntry =
                mt.length > 1
                    ? single(mt[0], null, singleSide, U.bezug)
                    : single(singleSide, M.bezug, ut[0], null);
            if (firstEntry !== 'andere') return firstEntry;
            return many.slice(1).some((t) => same(t.roh, singleSide.roh)) ? 'unklar' : 'andere';
        }
        return single(mt[0], M.bezug, ut[0], U.bezug);
    }
    // Compares two single strengths (no combination) → 'passt' | 'andere' | 'unklar'.
    function single(m, mb, u, ub) {
        // Without a unit never „andere“
        if (!m.dim || !u.dim) return same(m.roh, u.roh) ? 'passt' : 'unklar';
        // E.g. mg against I.E.
        if (m.dim !== u.dim) return 'unklar';
        const e = compareAmount(m.wert, mb, u.wert, ub);
        if (e !== 'andere') return e;
        // Same number with another unit or factor 1000: rather a slip in the unit → unklar.
        if (same(m.roh, u.roh) || thousands(m.wert, u.wert)) return 'unklar';
        return 'andere';
    }
    // Compares two amounts with their reference (per ml, per h …) → 'passt' | 'andere' | 'unklar'.
    function compareAmount(mv, mb, uv, ub) {
        // E.g. per hour against per puff
        if (mb && ub && mb.typ !== ub.typ) return 'unklar';
        // „je Hub/Dosis“ is an amount, not a reference of its own
        const kind = (b) => (b && b.typ !== 'dosis' ? b : null);
        const a = kind(mb);
        const b = kind(ub);
        if (a && b) {
            if (a.typ !== b.typ) return 'unklar';
            if (a.typ === 'ml') return same(mv / a.menge, uv / b.menge) ? 'passt' : 'andere';
            if (!same(a.menge, b.menge)) return 'unklar';
            return same(mv, uv) ? 'passt' : 'andere';
        }
        if (a || b) {
            // Mass against concentration or rate: equal → passt, otherwise unklar (never „andere“).
            const x = a || b;
            if (same(mv, uv)) return 'passt';
            if (
                x.typ === 'ml' &&
                x.menge !== 1 &&
                same(a ? mv / x.menge : mv, a ? uv : uv / x.menge)
            )
                return 'passt';
            return 'unklar';
        }
        return same(mv, uv) ? 'passt' : 'andere';
    }

    // For the input: number as text (comma) and unit separately; unknown parts → null.
    const DISPLAY_UNIT = {
        µg: 'µg',
        mg: 'mg',
        g: 'g',
        ml: 'ml',
        mmol: 'mmol',
        '%': '%',
        e: 'I.E.',
        mioe: 'Mio. I.E.',
    };
    const DISPLAY_BASIS = { ml: 'ml', h: 'h', '24h': '24 h', dosis: 'Hub', tag: 'Tag', g: 'g' };
    const numberText = (x) => String(Number(x.toPrecision(12))).replace('.', ',');
    // Splits a strength into number text and unit for the input fields.
    function splitParts(text) {
        const z = split(text);
        if (!z) return null;
        const t0 = z.teile[0];
        const raw = (t) => numberText(t.roh);
        const canonicalUnit = (canonical(text).match(SPLIT_PATTERN) || [])[2];
        let unit = canonicalUnit ? DISPLAY_UNIT[canonicalUnit] : '';
        let number = raw(t0);
        if (z.teile.length > 1) {
            const z2 = (canonical(text).match(SPLIT_PATTERN) || [])[4];
            number = `${number}/${raw(z.teile[1])}`;
            if (!unit && z2) unit = DISPLAY_UNIT[z2] || '';
        }
        if (z.bezug)
            unit = `${unit}/${z.bezug.menge !== 1 ? `${numberText(z.bezug.menge)} ` : ''}${DISPLAY_BASIS[z.bezug.typ]}`;
        if (unit === 'I.E./ml') unit = 'Einheiten/ml';
        return { zahl: number, einheit: unit };
    }
    // Strength as text from number and unit, e.g. ('16', 'mg') → „16 mg“.
    const strengthText = (number, unit) =>
        [String(number || '').trim(), unit || ''].filter(Boolean).join(' ').trim() || null;

    const api = {
        staerkeVon: strengthOf,
        anzeige: display,
        einheitlich: unify,
        kanon: canonical,
        zerlege: split,
        vergleiche: compare,
        teileAuf: splitParts,
        staerkeText: strengthText,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else globalRoot.EWStaerke = api;
})(typeof window !== 'undefined' ? window : globalThis);
