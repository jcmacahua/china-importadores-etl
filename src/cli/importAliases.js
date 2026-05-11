'use strict';
/**
 * src/cli/importAliases.js
 *
 * Importa el CSV buscar_como.csv a la tabla name_alias.
 * Solo corre una vez (o cuando actualizas el CSV).
 *
 * Uso:
 *   npm run import-aliases
 */
const fs      = require('fs');
const path    = require('path');
const { getPool, closePool, sql } = require('../db/connection');
const { runMigrations }           = require('../db/migrator');
const logger  = require('../utils/logger');

const CSV_PATH = path.join(__dirname, '../../data/buscar_como.csv');

function parseCsv(filePath) {
    const raw   = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split('\n');
    const rows  = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let searchTerm, exhibitorName;

        if (line.startsWith('"')) {
            const m = line.match(/^"([^"]*)",(.*)$/);
            if (!m) continue;
            searchTerm    = m[1].trim();
            exhibitorName = m[2].replace(/^"|"$/g, '').trim();
        } else {
            const idx = line.indexOf(',');
            if (idx === -1) continue;
            searchTerm    = line.substring(0, idx).trim();
            exhibitorName = line.substring(idx + 1).replace(/^"|"$/g, '').trim();
        }

        if (searchTerm && exhibitorName) {
            rows.push({ searchTerm, exhibitorName });
        }
    }
    return rows;
}

async function main() {
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('Importando aliases desde CSV → name_alias');

    if (!fs.existsSync(CSV_PATH)) {
        logger.error(`CSV no encontrado: ${CSV_PATH}`);
        process.exitCode = 1;
        return;
    }

    await runMigrations();

    const rows = parseCsv(CSV_PATH);
    logger.info(`Filas en CSV: ${rows.length}`);

    const pool   = await getPool();
    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;

    for (const { searchTerm, exhibitorName } of rows) {
        try {
            const r = await pool.request()
                .input('exhibitor_name', sql.NVarChar(300), exhibitorName)
                .input('search_term',   sql.NVarChar(300), searchTerm)
                .query(`
                    MERGE name_alias AS tgt
                    USING (SELECT @exhibitor_name AS exhibitor_name) AS src
                        ON tgt.exhibitor_name = src.exhibitor_name
                    WHEN MATCHED AND tgt.source = 'csv' THEN
                        UPDATE SET search_term = @search_term, loaded_at = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (exhibitor_name, search_term, source)
                        VALUES (@exhibitor_name, @search_term, 'csv');
                    SELECT @@ROWCOUNT AS affected;
                `);

            const affected = r.recordset[0].affected;
            if (affected > 0) inserted++;
            else skipped++;
        } catch (err) {
            logger.warn(`  Skipped "${exhibitorName}": ${err.message}`);
            skipped++;
        }
    }

    logger.ok(`Importación completa — insertados/actualizados: ${inserted} | sin cambios: ${skipped}`);
}

main()
    .catch(err => { logger.error(err.message); process.exitCode = 1; })
    .finally(() => closePool());
