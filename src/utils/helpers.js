'use strict';
/**
 * src/utils/helpers.js
 *
 * Funciones puras de transformación de datos.
 * No tienen efectos secundarios ni dependencias externas.
 */

/** Pausa asíncrona */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Trunca y limpia un string. Devuelve null si está vacío. */
function safeStr(val, max = 300) {
    if (val == null) return null;
    const s = String(val).trim().substring(0, max);
    return s.length ? s : null;
}

/** Parsea un número. Devuelve null si no es válido. */
function safeNum(val) {
    if (val == null || val === '') return null;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? null : n;
}

/** Parsea una fecha. Devuelve null si no es válida. */
function safeDate(val) {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

/** Parsea un entero. Devuelve null si no es válido. */
function safeInt(val) {
    if (val == null || val === '') return null;
    const n = parseInt(val);
    return isNaN(n) ? null : n;
}

/** Cronómetro legible: devuelve "2m 34s" o "47s" */
function elapsed(startMs) {
    const s = Math.round((Date.now() - startMs) / 1000);
    const m = Math.floor(s / 60);
    return m ? `${m}m ${s % 60}s` : `${s}s`;
}

module.exports = { sleep, safeStr, safeNum, safeDate, safeInt, elapsed };
