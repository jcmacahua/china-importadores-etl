'use strict';
/**
 * src/etl/amsLoader.js
 *
 * ETL de Automechanika:
 *   Extract  → scraper/automechanika.js (genera registros paginados)
 *   Transform → ya hecho en el scraper (parseHit)
 *   Load     → repository.js (upsertExhibitor, replaceCategories, replaceStands)
 *
 * Devuelve { saved, skipped }.
 */
const scraper  = require('../scrapers/automechanika');
const repo     = require('../db/repository');
const logger   = require('../utils/logger');
const { sleep, elapsed } = require('../utils/helpers');

async function run() {
    logger.blank();
    logger.info('══ ETL AUTOMECHANIKA ══════════════════════════════════════════');

    const start   = Date.now();
    let saved     = 0;
    let skipped   = 0;
    let page      = 0;
    let totalPages = '?';

    for await (const event of scraper.fetchAll()) {
        switch (event.type) {

            case 'meta':
                logger.info(`Total expositores en API: ${event.hitsTotal} | Páginas: ${event.totalPages}`);
                totalPages = event.totalPages;
                break;

            case 'record': {
                const rec = event.data;
                const id  = await repo.upsertExhibitor(rec);
                await repo.replaceCategories(id, rec.categories);
                await repo.replaceStands(id, rec.stands);
                saved++;
                break;
            }

            case 'skipped':
                skipped++;
                break;

            case 'page':
                page = event.page;
                logger.info(`  Página ${page}/${totalPages} — acumulados: ${saved} guardados, ${skipped} saltados`);
                await sleep(400); // pausa cortés
                break;
        }
    }

    logger.ok(`Automechanika listo en ${elapsed(start)} — ${saved} guardados, ${skipped} saltados`);
    return { saved, skipped };
}

module.exports = { run };
