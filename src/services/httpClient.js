'use strict';
/**
 * src/services/httpClient.js
 *
 * Cliente HTTP compartido basado en axios.
 * Añade reintentos automáticos con backoff exponencial.
 * Todos los módulos usan éste; nadie importa axios directamente.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

const MAX_RETRIES = 3;
const BASE_DELAY  = 3000; // ms (se multiplica por intento)

async function withRetry(fn, label) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isLast = attempt === MAX_RETRIES;
            if (isLast) throw err;
            const wait = BASE_DELAY * attempt;
            logger.warn(`${label} — intento ${attempt} fallido (${err.message}). Reintentando en ${wait}ms...`);
            await sleep(wait);
        }
    }
}

async function get(url, options = {}) {
    return withRetry(
        () => axios.get(url, { timeout: 50_000, ...options }),
        `GET ${url.slice(0, 80)}`
    );
}

async function post(url, data, options = {}) {
    return withRetry(
        () => axios.post(url, data, { timeout: 60_000, ...options }),
        `POST ${url.slice(0, 80)}`
    );
}

async function getBinary(url, options = {}) {
    return withRetry(
        () => axios.get(url, { timeout: 60_000, responseType: 'arraybuffer', ...options }),
        `GET(bin) ${url.slice(0, 80)}`
    );
}

module.exports = { get, post, getBinary };
