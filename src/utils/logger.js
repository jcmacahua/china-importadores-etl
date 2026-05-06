'use strict';
/**
 * src/utils/logger.js
 *
 * Logger minimalista que:
 *   - Imprime en consola con colores (INFO=cyan, OK=green, WARN=yellow, ERROR=red)
 *   - Escribe simultáneamente en logs/run-YYYY-MM-DD.log
 *   - No depende de librerías externas
 */
const fs   = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logFile = path.join(LOG_DIR, `run-${new Date().toISOString().slice(0, 10)}.log`);
const stream  = fs.createWriteStream(logFile, { flags: 'a' });

const COLORS = { INFO: '\x1b[36m', OK: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m' };
const RESET  = '\x1b[0m';

function write(level, msg) {
    const ts   = new Date().toISOString();
    const line = `[${ts}] [${level.padEnd(5)}] ${msg}`;
    stream.write(line + '\n');
    process.stdout.write(`${COLORS[level] ?? ''}${line}${RESET}\n`);
}

module.exports = {
    info:  msg => write('INFO',  String(msg)),
    ok:    msg => write('OK',    String(msg)),
    warn:  msg => write('WARN',  String(msg)),
    error: msg => write('ERROR', String(msg)),
    blank: ()  => { stream.write('\n'); process.stdout.write('\n'); },
};
