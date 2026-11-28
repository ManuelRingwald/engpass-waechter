// Engpass-Wächter – classifies a report against „my medicine“ (substance, optionally strength and form). Rules:
// stamm/regeln.json → abgleich.einordnung, abgleich.kurzname, formGruppen. Runs in the browser (window.EWEinordnung)
// and in Node (checks in tests/zusatz/). Principle: when in doubt „passt“ or „unklar“ (= show as affected); „nicht dein
// Produkt“ only when the data clearly says so (combination in the field „wirkstoffe“, another form group in the field
// „form“, another strength read safely).
'use strict';
(function (globalRoot) {
    const STRENGTH =
        typeof module !== 'undefined' && module.exports
            ? require('./staerke.js')
            : globalRoot.EWStaerke;

    // Normalises a name for comparing: lower case, without „(Ph. Eur.)“, single spaces.
    const norm = (s) =>
        (s || '')
            .toLowerCase()
            .replace(/\(ph\.\s*eur\.\)/g, '')
            .replace(/[\s ]+/g, ' ')
            .trim();

    // Parts of the field „wirkstoffe“ as reported (separated by „;“).
    const rawComponents = (m) =>
        String((m && m.wirkstoffe) || '')
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean);

    // Shorten salt and hydrate forms for display and counting: „Codeinphosphat-Hemihydrat“ → „Codein“,
    // „Perindopril-Arginin“ → „Perindopril“. Never shorten if only a counter-ion would remain („Natriumchlorid“ stays).
    function shortName(raw, rules) {
        let s = String(raw || '')
            .replace(/\s*\(\(?[^()]*\)?\)\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const endings = [
            ...rules.abgleich.salzEndungen,
            ...(rules.abgleich.kurzname.zusaetzlicheEndungen || []),
        ].sort((a, b) => b.length - a.length);
        const counterIons = new Set(rules.abgleich.kurzname.gegenionen);
        const pattern = new RegExp(`[\\s-]*(?:\\d+-)?(?:${endings.join('|')})$`, 'i');
        for (let i = 0; i < 4; i++) {
            const hits = s.match(pattern);
            if (!hits) break;
            const rest = s.slice(0, hits.index).replace(/[\s-]+$/, '');
            if (
                rest.length < rules.abgleich.kurzname.mindestLaenge ||
                counterIons.has(rest.toLowerCase())
            )
                break;
            s = rest;
        }
        return s;
    }
    // The shortened substance names of a report, each once.
    const shortNames = (m, rules) => [
        ...new Map(
            rawComponents(m).map((b) => {
                const k = shortName(b, rules);
                return [k.toLowerCase(), k];
            }),
        ).values(),
    ];

    // The form group of a dosage form (regeln.json → formGruppen); 'Sonstige' when none fits.
    function formGroup(form, rules) {
        const f = norm(form);
        if (f)
            for (const g of rules.formGruppen)
                if (g.muster.some((x) => f.includes(x))) return g.name;
        return 'Sonstige';
    }

    // Combination: the field „wirkstoffe“ names more than one (shortened, different) substance – unless the report
    // carries exactly the ATC code of the own entry (e.g. Cotrimoxazol J01EE01): then the combination is the own
    // medicine.
    function isCombination(m, mine, rules) {
        if (shortNames(m, rules).length < 2) return false;
        const atc = String(m.atc || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        if (atc.length === 1 && mine && (mine.atc || []).includes(atc[0])) return false;
        return true;
    }
    // The other substances of a combination (without the own one), shortened: ['Codein', 'Coffein'].
    function partner(m, mine, rules) {
        const own = [mine.n, ...(mine.a || [])]
            .map((x) => norm(shortName(x, rules)))
            .filter(Boolean);
        return shortNames(m, rules).filter((k) => {
            const n = norm(k);
            return !own.some((e) => n === e || n.startsWith(e) || e.startsWith(n));
        });
    }

    // Classification: 'passt' | 'unklar' | 'andereForm' | 'kombination' | 'andereStaerke'. mein: { n, a, atc, auswahl:
    // { staerke, form } | null }. Own strength with several numbers („2,5/0,625 mg“, „160/12,5“): the person takes a
    // combination product.
    const ownCombination = (a) => !!(a && a.staerke && /\d\s*\/\s*\d/.test(a.staerke));

    // Classifies one report against the own medicine.
    function classify(m, mine, rules) {
        const a =
            mine && mine.auswahl && (mine.auswahl.staerke || mine.auswahl.form)
                ? mine.auswahl
                : null;
        // The form first: another known form group is clearly not the own product, also for a combination (Paracetamol
        // tablet ↔ Azur compositum suppository).
        let unclear = false;
        if (a && a.form) {
            if (!m.form) unclear = true;
            else {
                const g = formGroup(m.form, rules);
                // A form outside the known groups („Kristallsuspension“) is not safely „andere“.
                if (g === 'Sonstige') unclear = true;
                else if (g !== a.form) return 'andereForm';
            }
        }
        // Combinations are separate only if the own input is not a combination product.
        if (!ownCombination(a) && isCombination(m, mine, rules)) return 'kombination';
        if (!a) return 'passt';
        if (a.staerke) {
            const p = STRENGTH.vergleiche(m.name, a.staerke);
            if (p === 'andere') return 'andereStaerke';
            if (p === 'unklar') unclear = true;
        }
        return unclear ? 'unklar' : 'passt';
    }
    // Sorts the reports of a substance into the classes of classify().
    function parts(ms, mine, rules) {
        const r = { passt: [], unklar: [], andereForm: [], kombination: [], andereStaerke: [] };
        for (const m of ms) r[classify(m, mine, rules)].push(m);
        return r;
    }

    // Overall verdict for badge and core statement (regeln.json → abgleich.marke): 'betroffen' (matching reports) ·
    // 'unklar' (only reports that cannot be assigned safely) · 'nurKombination' (otherwise only combinations: could be
    // the own product, so no check mark) · 'kein' (nothing reported or only clearly another form or strength).
    function verdict(r) {
        if (r.passt.length) return 'betroffen';
        if (r.unklar.length) return 'unklar';
        if (r.kombination.length) return 'nurKombination';
        return 'kein';
    }

    // Product to look for on the pack: „Azur compositum Zäpfchen“ (form only if it is not already in the name).
    function productName(m) {
        const name = String(m.name || '').trim();
        const form = String(m.form || '').trim();
        if (!form) return name;
        const stem =
            norm(form)
                .split(/[\s,]+/)
                .find((w) => w.length >= 4) || '';
        return norm(name).includes(stem.slice(0, 6)) ? name : `${name} ${form}`;
    }

    const api = {
        eigeneKombination: ownCombination,
        norm,
        bestandteileRoh: rawComponents,
        kurzName: shortName,
        kurzNamen: shortNames,
        formGruppe: formGroup,
        istKombination: isCombination,
        partner,
        einordnen: classify,
        teile: parts,
        urteil: verdict,
        produktName: productName,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else globalRoot.EWEinordnung = api;
})(typeof window !== 'undefined' ? window : globalThis);
