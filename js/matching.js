// Matching reports to substances, strength and form (regeln.json → abgleich): search index, search and helpers that
// group reports (#56).

import { CLASSIFY, state, STRENGTH } from './state.js';
import { norm, plural, t } from './dom.js';

// Display, e.g. „70 µg/h“ or „100 (Einheit nicht angegeben)“
export const strengthOf = (name) => STRENGTH.anzeige(STRENGTH.staerkeVon(name));
// The normalised substance components of a report.
const components = (m) =>
    (m.wirkstoffe || '')
        .split(';')
        .map((s) => norm(s))
        .filter(Boolean);
const keyOf = (w) => [w.n, ...(w.a || [])].map(norm).filter((k) => k.length >= 5);
// True when a component starts with the substance name, followed by nothing, a non-letter or a salt form.
function startsWithName(b, k) {
    if (!b.startsWith(k)) return false;
    const rest = b.slice(k.length);
    return !rest || /^[^a-zäöüß]/.test(rest) || state.saltPattern.test(rest);
}
// True when a report belongs to a substance (by ATC code or by name).
export function matches(w, m) {
    if (m.atc && w.atc.includes(m.atc)) return true;
    const keys = keyOf(w);
    return components(m).some((b) => keys.some((k) => startsWithName(b, k)));
}
export const reportsFor = (w) =>
    state.daily ? state.daily.meldungen.filter((m) => matches(w, m)) : [];
// Form groups and own choice (regeln.json → formGruppen, abgleich.auswahl, abgleich.einordnung)
export const formGroup = (form) => CLASSIFY.formGruppe(form, state.rules);
export const selectionOf = (w) =>
    w && w.auswahl && (w.auswahl.staerke || w.auswahl.form) ? w.auswahl : null;
// Grouping of the reports of a substance (einordnung.js): passt, unklar, andereForm, kombination, andereStaerke.
// betroffen = passt + unklar (show when in doubt); getrennt = combinations and other forms (name the product).
export function grouping(w, a = selectionOf(w)) {
    const r = CLASSIFY.teile(reportsFor(w), { ...w, auswahl: a }, state.rules);
    r.betroffen = [...r.passt, ...r.unklar];
    r.getrennt = [...r.kombination, ...r.andereForm];
    r.einzel = reportsFor(w).filter((m) => !CLASSIFY.istKombination(m, w, state.rules));
    return r;
}
const formUnclear = (m, a) => a.form && (!m.form || formGroup(m.form) === 'Sonstige');
// Text for reports that cannot be assigned safely, naming what is unclear (strength or form).
export function unclearText(unclear, a, template = 'auswahlUnklar', values = {}) {
    const withoutForm = unclear.some((m) => formUnclear(m, a));
    const strengthUnclear = unclear.some((m) => !formUnclear(m, a));
    const what =
        strengthUnclear && withoutForm ? 'Stärke oder Form' : withoutForm ? 'Form' : 'Stärke';
    // „erkennbare“ if the report names no strength; „sicher zuordenbare“ if it names one but the comparison is
    // uncertain.
    const unreadable = (m) => {
        const st = STRENGTH.staerkeVon(m.name);
        return !st || st.unsicher;
    };
    const kind = unclear.every((m) => unreadable(m) || formUnclear(m, a))
        ? 'erkennbare'
        : 'sicher zuordenbare';
    return t(template, {
        anzahl: unclear.length,
        meldungWort: plural(unclear.length, 'Meldung', 'Meldungen'),
        was: what,
        art: kind,
        ...values,
    });
}
// List „A, B und C“.
export const andList = (xs) =>
    xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`;
// Product to compare with the pack (#13): name, form, for a combination the other substances, PZN.
function productText(m, w, { pzn = true } = {}) {
    const details = [];
    if (CLASSIFY.istKombination(m, w, state.rules))
        details.push(
            t('kombinationMit', { partner: andList(CLASSIFY.partner(m, w, state.rules)) }),
        );
    if (pzn && m.pzn) details.push(`PZN ${m.pzn}`);
    return details.length
        ? `${CLASSIFY.produktName(m)} (${details.join(', ')})`
        : CLASSIFY.produktName(m);
}
// Name several reports of the same product (same name, form and substances) only once.
export function products(ms, w, opt, max = 4) {
    const byKey = new Map();
    for (const m of ms) {
        const k = `${CLASSIFY.produktName(m)}|${m.wirkstoffe}`;
        if (!byKey.has(k)) byKey.set(k, m);
    }
    const xs = [...byKey.values()].map((m) => productText(m, w, opt));
    return xs.length > max
        ? `${xs.slice(0, max).join('; ')} … (und ${xs.length - max} weitere)`
        : xs.join('; ');
}
// Without an own form and with single products in several form groups: ask once for the form (regeln.json →
// abgleich.formFrage).
export function formsToAsk(w, entry, e) {
    if (!entry || entry.formGefragt || (entry.auswahl && entry.auswahl.form)) return [];
    const g = [
        ...new Set(e.betroffen.map((m) => formGroup(m.form)).filter((x) => x !== 'Sonstige')),
    ];
    return g.length > 1 ? g : [];
}
export const selectionText = (a) => [a.staerke, a.form].filter(Boolean).join(' · ');
// Builds the search index of substances and trade names from the master data.
export function buildIndex() {
    const byNormKey = new Map();
    const entries = state.substanceList.map((w) => ({ typ: 'wirkstoff', w }));
    for (const e of entries)
        for (const k of keyOf(e.w)) if (!byNormKey.has(k)) byNormKey.set(k, e.w);
    // Finds the substance whose name starts the given normalised name (longest match first).
    const findSubstance = (b) => {
        for (let i = b.length; i >= 5; i--) {
            const k = b.slice(0, i);
            const w = byNormKey.get(k);
            if (w && startsWithName(b, k)) return w;
        }
        return null;
    };
    const newNames = new Map();
    const preparations = [];
    for (const m of state.daily ? state.daily.meldungen : []) {
        const parts = components(m);
        let target = null;
        for (const b of parts) {
            let w =
                findSubstance(b) ||
                state.substanceList.find(
                    (x) => m.atc && parts.length === 1 && x.atc.includes(m.atc),
                );
            if (!w) {
                w = newNames.get(b);
                if (!w) {
                    const original =
                        (m.wirkstoffe || '')
                            .split(';')
                            .map((s) => s.trim())
                            .find((s) => norm(s) === b) || b;
                    w = {
                        n: original.replace(/\s*\(Ph\.\s*Eur\.\)/i, ''),
                        atc: parts.length === 1 && m.atc ? [m.atc] : [],
                        a: [],
                        ausMeldung: true,
                    };
                    newNames.set(b, w);
                    byNormKey.set(b, w);
                }
            }
            target = target || w;
        }
        if (target && m.name) preparations.push({ typ: 'praeparat', name: m.name, w: target });
    }
    const additional = [...newNames.values()].map((w) => ({ typ: 'wirkstoff', w }));
    // Trade names (own compilation) → substance from the list (name or synonym).
    const byName = new Map();
    for (const e of [...entries, ...additional])
        for (const k of [e.w.n, ...(e.w.a || [])].map(norm)) if (!byName.has(k)) byName.set(k, e.w);
    const trade = [];
    for (const h of state.tradeNames)
        for (const z of h.wirkstoffe) {
            const w = byName.get(norm(z));
            if (w) trade.push({ typ: 'handelsname', name: h.name, w });
        }
    const seen = new Set();
    state.searchIndex = [
        ...entries,
        ...additional,
        ...trade,
        ...preparations.filter((p) => {
            const k = norm(p.name);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        }),
    ];
}
const compact = (s) => norm(s).replace(/[\s-]/g, '');
// Damerau-Levenshtein (restricted), for the typo tolerance (regeln.json → abgleich.tippfehler).
function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const k = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + k);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
}
// True when the input differs from the start of a name only by a typo (regeln.json → abgleich.tippfehler).
const similar = (q, name) => {
    const limit = q.length <= 7 ? 1 : 2;
    return [name.slice(0, q.length), name.slice(0, q.length + 1), name.slice(0, q.length - 1)].some(
        (x) => editDistance(q, x) <= limit,
    );
};
// „Candesartan 16 mg Tabletten“ → name „Candesartan“, strength „16 mg“, form „Tablette“ (regeln.json →
// abgleich.sucheMitStaerke).
const FORM_WORDS =
    /(?:^|\s)(?:filmtabletten?|retardtabletten?|brausetabletten?|tabletten?|tbl\.?|hartkapseln?|weichkapseln?|kapseln?|saft|sirup|tropfen|lösung|injektionslösung|spray|dosieraerosol|creme|salbe|gel|pflaster|zäpfchen|ampullen?|fertigspritzen?|pen|granulat|pulver|retard|comp|forte|mite|akut)(?=\s|$)/gi;
// Finds a form term in the input („Saft“, „Tabletten“) and returns its form.
function formTerm(q) {
    const words = norm(q)
        .split(/[^a-zäöüß]+/)
        .filter(Boolean);
    // True when a word is the form term, also in plural or as the end of a compound word.
    const fits = (w, b) =>
        w === b ||
        w === `${b}n` ||
        w === `${b}en` ||
        (b.length >= 4 && (w.endsWith(b) || w.endsWith(`${b}n`)));
    return (
        [...state.rules.abgleich.formBegriffe.liste]
            .sort((a, b) => b.wort.length - a.wort.length)
            .find((b) => words.some((w) => fits(w, b.wort))) || null
    );
}
// Splits a search input into name, strength and form.
export function splitQuery(q) {
    const raw = String(q || '').trim();
    const m = raw.match(/^(.*?\S)\s+(\d[\d.,]*(?:\s*\/\s*\d[\d.,]*)?(?:\s.*|[a-zA-Zµ%].*)?)$/);
    const name =
        (m ? m[1] : raw).replace(FORM_WORDS, ' ').replace(/\s+/g, ' ').trim() || (m ? m[1] : raw);
    const tt = m ? STRENGTH.teileAuf(m[2]) : null;
    // Form from form terms (regeln.json → abgleich.formBegriffe, also „Fiebersaft“), otherwise from the part after the
    // number.
    const term = formTerm(raw);
    const fg = term
        ? term.gruppe
        : formGroup(`${m ? m[2] : ''} ${(raw.match(FORM_WORDS) || []).join(' ')}`);
    return {
        name,
        staerke: tt ? STRENGTH.staerkeText(tt.zahl, tt.einheit) : null,
        form: fg !== 'Sonstige' ? fg : null,
        formWort: term ? term.anzeige : null,
    };
}
// Searches substances and products; returns the ranked hits.
export function search(input) {
    const q = splitQuery(input).name;
    const n = norm(q);
    const nk = compact(q);
    if (n.length < 2) return [];
    const list = [];
    for (const e of state.searchIndex) {
        let rank = null;
        let alias = null;
        if (e.typ === 'wirkstoff') {
            const name = norm(e.w.n);
            if (name === n) rank = 0;
            else if (name.startsWith(n)) rank = 1;
            else if (
                name.length >= 5 &&
                n.startsWith(name) &&
                /^[^a-zäöüß]/.test(n.slice(name.length))
            )
                // „Candesartan-ratiopharm“
                rank = 1.2;
            else if (name.length >= 5 && n.split(/[\s-]+/).includes(name))
                // Substance name as a word in the input
                rank = 1.3;
            else if (
                name.length >= 5 &&
                n.split(/[\s-]+/).some((word) => startsWithName(word, name))
            )
                // „Metoprololsuccinat“
                rank = 1.25;
            else {
                const a = (e.w.a || []).find((x) => norm(x).startsWith(n));
                if (a) {
                    rank = 2;
                    alias = a;
                } else if (n.length >= 4 && name.includes(n)) rank = 3;
            }
        } else if (e.typ === 'handelsname') {
            const name = compact(e.name);
            if (name === nk) rank = 0.5;
            else if (name.startsWith(nk)) rank = 1.5;
            else if (
                name.length >= 4 &&
                n
                    .split(/[\s-]+/)
                    .map(compact)
                    .includes(name)
            )
                rank = 1.6;
        } else {
            const name = norm(e.name);
            // Only at the start of the name, otherwise e.g. „Salbe“ or „Tabletten“ would match
            if (name.startsWith(n)) rank = 4;
        }
        if (rank !== null) list.push({ ...e, rang: rank, alias });
    }
    // Typos: only if hardly anything was found.
    if (nk.length >= 4 && !list.some((e) => e.typ !== 'praeparat')) {
        for (const e of state.searchIndex) {
            if (e.typ === 'praeparat' || list.some((x) => x.w === e.w)) continue;
            const names = e.typ === 'handelsname' ? [e.name] : [e.w.n, ...(e.w.a || [])];
            const hits = names.find((x) => similar(nk, compact(x)));
            if (hits)
                list.push({
                    ...e,
                    rang: 5,
                    alias: e.typ === 'wirkstoff' && hits !== e.w.n ? hits : null,
                    aehnlich: true,
                });
        }
    }
    // Substance before product: substances first (reported before not reported), then at most 3 products.
    const reported = new Map();
    // True when a substance has reports (cached per search).
    const has = (w) => {
        if (!reported.has(w)) reported.set(w, reportsFor(w).length > 0);
        return reported.get(w);
    };
    const len = (e) => (e.typ === 'wirkstoff' ? e.w.n : e.name).length;
    list.sort((x, y) => x.rang - y.rang || has(y.w) - has(x.w) || len(x) - len(y));
    // Only the best hit per substance (e.g. „Aspirin → Acetylsalicylsäure“ instead of also „Acetylsalicylsäure“).
    const duplicate = new Set();
    const unique = list.filter((e) => {
        const k = e.typ === 'praeparat' ? `p${norm(e.name)}` : e.w;
        if (duplicate.has(k)) return false;
        duplicate.add(k);
        return true;
    });
    const substanceHits = unique.filter((e) => e.typ !== 'praeparat').slice(0, 6);
    const product = unique
        .filter((e) => e.typ === 'praeparat' && !substanceHits.some((x) => x.w === e.w))
        .slice(0, 3);
    return [...substanceHits, ...product];
}
// Checks a PZN: 8 digits and the check digit (modulo 11).
export function pznValid(p) {
    if (!/^\d{8}$/.test(p) || /^0+$|^9+$/.test(p)) return false;
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += Number(p[i]) * (i + 1);
    const check = sum % 11;
    return check !== 10 && check === Number(p[7]);
}
