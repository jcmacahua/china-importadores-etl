'use strict';

/** Pausa fija */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Pausa con variación aleatoria — imita comportamiento humano.
 * Usa suma de 4 randoms para aproximar distribución gaussiana (TCL).
 *
 * @param {number} baseMs  tiempo base en ms
 * @param {number} jitter  variación máxima (default: 40% del base)
 *
 * Ejemplos:
 *   humanDelay(1200)     → entre ~720ms  y ~1680ms
 *   humanDelay(2500)     → entre ~1500ms y ~3500ms
 *   humanDelay(500, 100) → entre ~400ms  y ~600ms
 */
async function humanDelay(baseMs, jitter = null) {
    const j   = jitter ?? Math.round(baseMs * 0.4);
    const u   = (Math.random() + Math.random() + Math.random() + Math.random()) / 4;
    const noise = Math.round((u - 0.5) * 2 * j);
    const ms  = Math.max(200, baseMs + noise);
    await sleep(ms);
    return ms;
}

/**
 * Pausa larga ocasional (simula que el usuario está revisando algo).
 * @param {number} prob    probabilidad 0-1 de que ocurra (default 8%)
 * @param {number} minMs   mínimo de la pausa extra
 * @param {number} maxMs   máximo de la pausa extra
 */
async function occasionalLongPause(prob = 0.08, minMs = 4000, maxMs = 12000) {
    if (Math.random() < prob) {
        const ms = minMs + Math.round(Math.random() * (maxMs - minMs));
        await sleep(ms);
    }
}

function safeStr(val, max = 300) {
    if (val == null) return null;
    const s = String(val).trim().substring(0, max);
    return s.length ? s : null;
}

function safeNum(val) {
    if (val == null || val === '') return null;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? null : n;
}

function safeDate(val) {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function safeInt(val) {
    if (val == null || val === '') return null;
    const n = parseInt(val);
    return isNaN(n) ? null : n;
}

function elapsed(startMs) {
    const s = Math.round((Date.now() - startMs) / 1000);
    const m = Math.floor(s / 60);
    return m ? `${m}m ${s % 60}s` : `${s}s`;
}

module.exports = { sleep, humanDelay, occasionalLongPause, safeStr, safeNum, safeDate, safeInt, elapsed };