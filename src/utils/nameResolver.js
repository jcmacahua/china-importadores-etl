'use strict';
/**
 * src/utils/nameResolver.js
 *
 * Genera candidatos de búsqueda para un nombre de expositor.
 * Fuente principal: tabla name_alias en BD (vía dbAlias que pasa pentaClient).
 * Fallback:         derivación automática del nombre.
 *
 * El CSV ya no se lee aquí — se importó a BD con: npm run import-aliases
 */
const STOPWORDS = new Set([
    'co', 'ltd', 'limited', 'inc', 'corp', 'corporation', 'company',
    'the', 'and', 'for', 'group', 'industry', 'industrial',
    'international', 'trading', 'import', 'export', 'manufacture',
    'manufacturing', 'technology', 'tech', 'auto', 'automotive',
    'parts', 'products', 'equipment', 'new', 'china',
]);

function normalize(str) {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[()[\]{}&.,\-_'/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function removeLegalSuffixes(str) {
    return str
        .replace(/\b(co\.?,?\s*ltd\.?|limited|incorporated|inc\.?|corp\.?|corporation|srl|bvba|gmbh|pvt\.?\s*ltd\.?|pty\.?\s*ltd\.?|llc|llp|plc|s\.?a\.?|s\.?r\.?o\.?|a\.?s\.?)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Genera candidatos de búsqueda en orden de precisión.
 *
 * @param {string}      exhibitorName  nombre del expositor (de ams_exhibitor)
 * @param {string|null} dbAlias        alias de BD (repo.getAlias) — null si no existe
 * @returns {string[]}
 */
function getSearchCandidates(exhibitorName, dbAlias = null) {
    const candidates = [];
    const seen = new Set();

    const add = (term) => {
        const t = (term ?? '').trim();
        if (t && t.length >= 3 && !seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            candidates.push(t);
        }
    };

    // 1. Alias de BD (source: 'csv' | 'manual' | 'learned') — máxima prioridad
    if (dbAlias) add(dbAlias);

    // 2. Nombre completo original
    add(exhibitorName);

    // 3. Sin sufijos legales
    const noSuffix = removeLegalSuffixes(normalize(exhibitorName));
    add(noSuffix);

    // 4. Palabras significativas (de mayor a menor)
    const words = normalize(exhibitorName)
        .split(' ')
        .filter(w => w.length >= 4 && !STOPWORDS.has(w));

    if (words.length >= 3) add(words.slice(0, 3).join(' '));
    if (words.length >= 2) add(words.slice(0, 2).join(' '));
    if (words.length >= 1) add(words[0]);

    return candidates;
}

module.exports = { getSearchCandidates, normalize };
