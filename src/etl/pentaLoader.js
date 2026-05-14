'use strict';
/**
 * src/etl/pentaLoader.js
 *
 * ETL de Penta-Transaction con delays humanizados.
 * Tiempos variables (no fijos) para evitar detección de bot.
 */
const penta   = require('../scrapers/pentaClient');
const repo    = require('../db/repository');
const logger  = require('../utils/logger');
const config  = require('../../config');
const { humanDelay, occasionalLongPause, elapsed } = require('../utils/helpers');

async function procesarExpositor(idExhibitor, nombre, idx, total) {
    const tag = `[${idx}/${total}] ${nombre}`;

    // Paso 2 — buscar claves CN
    const claves = await penta.buscarClaves(nombre);
    logger.info(`${tag} — claves CN: ${claves.length}`);
    await repo.saveSupplierKeys(idExhibitor, claves);

    if (!claves.length) {
        await repo.insertJobLog(idExhibitor, 'NO_DATA',
            config.penta.periodStart, config.penta.periodEnd);
        return;
    }

    // Pausa humanizada antes de solicitar el excel (simula que el usuario
    // seleccionó los proveedores y está haciendo clic en "Exportar")
    await humanDelay(900, 350);

    // Paso 3 — solicitar generación del excel
    const excelInfo = await penta.solicitarExcel(claves);

    if (!excelInfo?.fileUrl) {
        await repo.insertJobLog(idExhibitor, 'NO_DATA',
            config.penta.periodStart, config.penta.periodEnd,
            { trackingCode: excelInfo?.trackingCode });
        return;
    }

    // Pausa humanizada esperando que Penta genere el archivo
    // (simula tiempo de lectura de resultados antes de descargar)
    await humanDelay(config.penta.excelWaitMs, 800);

    // Paso 4 — descargar y parsear
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

    const pending = await repo.getPendingExhibitors(
        config.penta.periodStart, config.penta.periodEnd);
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
            await procesarExpositor(ex.id_exhibitor, ex.exhibitor_name,
                i + 1, pending.length);
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

        // Pausa principal entre empresas — variable y humana
        await humanDelay(config.penta.delayMs);

        // ~8% de probabilidad de pausa larga (4-12s) — simula distracción del usuario
        await occasionalLongPause(0.08, 4000, 12000);
    }

    logger.ok(`Penta listo en ${elapsed(start)} — ${processed} procesados, ${errors} errores`);
    return { processed, errors };
}

module.exports = { run };