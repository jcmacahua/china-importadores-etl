'use strict';
/**
 * src/db/connection.js
 *
 * Pool singleton de SQL Server. El mismo pool se reutiliza en toda la app.
 * Se conecta lazy (primera vez que se llama a getPool()).
 */
const sql    = require('mssql');
const config = require('../../config');
const logger = require('../utils/logger');

let _pool = null;

async function getPool() {
    if (_pool) return _pool;
    logger.info(`DB: conectando a ${config.db.server}/${config.db.database}...`);
    _pool = await sql.connect(config.db);
    logger.ok('DB: conexión establecida.');
    return _pool;
}

async function closePool() {
    if (!_pool) return;
    await _pool.close();
    _pool = null;
    logger.info('DB: conexión cerrada.');
}

module.exports = { getPool, closePool, sql };
