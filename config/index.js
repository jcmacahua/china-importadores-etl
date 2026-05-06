'use strict';
/**
 * config/index.js
 *
 * Carga las variables de entorno desde .env (vía dotenv) y las expone
 * como un objeto tipado. Si falta una variable obligatoria, falla rápido
 * con un mensaje claro antes de que la app haga cualquier otra cosa.
 */
require('dotenv').config();

function req(key) {
    const v = process.env[key];
    if (!v) throw new Error(`[config] Variable de entorno requerida no definida: ${key}`);
    return v;
}

function opt(key, fallback) {
    return process.env[key] ?? fallback;
}

module.exports = Object.freeze({

    db: {
        server:   req('DB_SERVER'),
        port:     parseInt(opt('DB_PORT', '1433')),
        database: req('DB_NAME'),
        user:     req('DB_USER'),
        password: req('DB_PASS'),
        options: {
            encrypt:                opt('DB_ENCRYPT',    'false') === 'true',
            trustServerCertificate: opt('DB_TRUST_CERT', 'true')  !== 'false',
        },
    },

    ams: {
        apiKey:        req('AMS_API_KEY'),
        pageSize:      parseInt(opt('AMS_PAGE_SIZE', '90')),
        filterCountry: opt('AMS_FILTER_COUNTRY', '').toUpperCase(),
    },

    penta: {
        user:         req('PENTA_USER'),
        pass:         req('PENTA_PASS'),
        version:      opt('PENTA_VERSION',      '6.4.2_4'),
        periodStart:  opt('PENTA_PERIOD_START', '2023-01-01'),
        periodEnd:    opt('PENTA_PERIOD_END',   '2023-12-31'),
        delayMs:      parseInt(opt('PENTA_DELAY_MS',      '5000')),
        excelWaitMs:  parseInt(opt('PENTA_EXCEL_WAIT_MS', '5000')),
        key:          opt('PENTA_KEY', 'MTMxODIwNDg=')
    },

});
