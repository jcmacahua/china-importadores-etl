'use strict';
/**
 * src/etl/pentaLoader.js
 *
 * ETL de Penta-Transaction:
 *   Extract  → pentaClient.js (buscarClaves, solicitarExcel, descargarExcel)
 *   Transform → inline (muy ligero: solo mapeo de columnas xlsx)
 *   Load     → repository.js (saveSupplierKeys, insertJobLog, saveImports)
 *
 * Reanudable: omite los expositores que ya tienen job OK/NO_DATA en el período.
 * Devuelve { processed, errors }.
 */
const penta   = require('../scrapers/pentaClient');
const repo    = require('../db/repository');
const logger  = require('../utils/logger');
const config  = require('../../config');
const { sleep, elapsed } = require('../utils/helpers');

async function procesarExpositor(idExhibitor, nombre, idx, total) {
    const tag = `[${idx}/${total}] ${nombre}`;

    // Paso 2 ─ claves CN
    const claves = await penta.buscarClaves(nombre);
    logger.info(`${tag} — claves CN: ${claves.length}`);
    await repo.saveSupplierKeys(idExhibitor, claves);

    if (!claves.length) {
        await repo.insertJobLog(idExhibitor, 'NO_DATA', config.penta.periodStart, config.penta.periodEnd);
        return;
    }

    // Paso 3 ─ solicitar excel
    await sleep(5000);
    const excelInfo = await penta.solicitarExcel(claves);

    if (!excelInfo?.fileUrl) {        
        await repo.insertJobLog(idExhibitor, 'NO_DATA', config.penta.periodStart, config.penta.periodEnd,
            { trackingCode: excelInfo?.trackingCode });
        return;
    }

    // Paso 4 ─ descargar y parsear
    await sleep(config.penta.excelWaitMs);
    const rows = await penta.descargarExcel(excelInfo.fileUrl);
    logger.info(`${tag} — filas: ${rows.length}`);

    const idJob = await repo.insertJobLog(
        idExhibitor, 'OK',
        config.penta.periodStart, config.penta.periodEnd,
        { ...excelInfo, rowCount: rows.length }
    );

    if (rows.length) await repo.saveImports(idExhibitor, idJob, rows);
}

async function run() {
    logger.blank();
    logger.info('══ ETL PENTA-TRANSACTION ══════════════════════════════════════');
    logger.info(`Período: ${config.penta.periodStart} → ${config.penta.periodEnd}`);

    const pending = await repo.getPendingExhibitors(config.penta.periodStart, config.penta.periodEnd);
    logger.info(`Expositores CN pendientes: ${pending.length}`);

    if (!pending.length) {
        logger.ok('Penta: nada pendiente para este período.');
        return { processed: 0, errors: 0 };
    }

    const start   = Date.now();
    let processed = 0;
    let errors    = 0;

    for (let i = 0; i < pending.length; i++) {
        const ex = pending[i];        
        try {
            await procesarExpositor(ex.id_exhibitor, ex.exhibitor_name, i + 1, pending.length);
            processed++;
        } catch (err) {
            logger.error(`ERROR "${ex.exhibitor_name}": ${err.message}`);
            await repo.insertJobLog(
                ex.id_exhibitor, 'ERROR',
                config.penta.periodStart, config.penta.periodEnd,
                { errorMsg: err.message }
            );
            errors++;
        }

        await sleep(config.penta.delayMs);
    }

    logger.ok(`Penta listo en ${elapsed(start)} — ${processed} procesados, ${errors} errores`);
    return { processed, errors };
}

module.exports = { run };
