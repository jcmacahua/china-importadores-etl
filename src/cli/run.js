#!/usr/bin/env node
'use strict';
/**
 * src/cli/run.js  —  Interfaz de línea de comandos
 *
 * Comandos:
 *   node src/cli/run.js migrate               → aplica migraciones pendientes
 *   node src/cli/run.js migrate --fresh        → borra todo y recrea
 *   node src/cli/run.js scrape --source automechanika
 *   node src/cli/run.js scrape --source penta
 *   node src/cli/run.js pipeline               → migrate + ams + penta
 *   node src/cli/run.js status                 → estadísticas de la BD
 *
 * Scripts npm (package.json):
 *   npm run migrate | npm run scrape:ams | npm run scrape:penta
 *   npm run pipeline | npm run status
 */

const { runMigrations } = require('../db/migrator');
const { closePool }     = require('../db/connection');
const amsLoader         = require('../etl/amsLoader');
const pentaLoader       = require('../etl/pentaLoader');
const repo              = require('../db/repository');
const logger            = require('../utils/logger');
const { elapsed }       = require('../utils/helpers');

// ── Parseo de argumentos ──────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const command = args[0];
const flags   = Object.fromEntries(
    args.slice(1)
        .filter((_, i, a) => a[i - 1]?.startsWith('--') || a[i]?.startsWith('--'))
        .reduce((pairs, tok, i, arr) => {
            if (tok.startsWith('--')) pairs.push([tok.slice(2), arr[i + 1] ?? true]);
            return pairs;
        }, [])
);

// ── Handlers ──────────────────────────────────────────────────────────────────
async function cmdMigrate() {
    logger.info(`Migraciones${flags.fresh ? ' (fresh)' : ''}...`);
    await runMigrations({ fresh: !!flags.fresh });
}

async function cmdScrape() {
    const src = flags.source;
    if (!src) { logger.error('Falta --source (automechanika | penta)'); process.exitCode = 1; return; }

    if (src === 'automechanika') {
        //await runMigrations();          // garantiza que las tablas existan
        await amsLoader.run();
    } else if (src === 'penta') {
        await pentaLoader.run();
    } else {
        logger.error(`Source desconocido: ${src}`);
        process.exitCode = 1;
    }
}

async function cmdPipeline() {
    const t = Date.now();
    logger.info('══ PIPELINE COMPLETO ══════════════════════════════════════════');
    await runMigrations();
    await amsLoader.run();
    await pentaLoader.run();
    logger.ok(`Pipeline completo en ${elapsed(t)}`);
}

async function cmdStatus() {
    const s = await repo.getStats();
    logger.blank();
    logger.info('══ ESTADO DE LA BASE DE DATOS ═════════════════════════════════');
    logger.info(`  Expositores totales       : ${s.total_exhibitors}`);
    logger.info(`  Expositores China (CHN)   : ${s.cn_exhibitors}`);
    logger.info(`  Jobs Penta OK             : ${s.jobs_ok}`);
    logger.info(`  Jobs Penta sin datos      : ${s.jobs_no_data}`);
    logger.info(`  Jobs Penta con error      : ${s.jobs_error}`);
    logger.info(`  Registros de importación  : ${s.total_imports}`);
    logger.info(`  Importadores MX únicos    : ${s.unique_importers}`);
    logger.info(`  USD CIF total             : $${Number(s.total_usd_cif).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    logger.blank();
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
const COMMANDS = { migrate: cmdMigrate, scrape: cmdScrape, pipeline: cmdPipeline, status: cmdStatus };

async function main() {
    logger.info('china-importadores-etl');
    logger.info('═══════════════════════════════════════════════════════════════');

    const handler = COMMANDS[command];
    if (!handler) {
        logger.error(`Comando desconocido: "${command}"`);
        logger.info('Comandos disponibles: migrate | scrape | pipeline | status');
        process.exitCode = 1;
        return;
    }

    try {
        await handler();
    } catch (err) {
        logger.error(`Error fatal: ${err.message}`);
        logger.error(err.stack);
        process.exitCode = 1;
    } finally {
        await closePool();
    }
}

main();
