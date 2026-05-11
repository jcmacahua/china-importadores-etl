'use strict';
/**
 * src/db/repository.js
 *
 * Todas las operaciones de escritura a SQL Server.
 * Los scrapers y el ETL sólo llaman funciones de este módulo;
 * nunca construyen SQL directamente.
 */
const { getPool, sql } = require('./connection');
const { safeStr, safeNum, safeDate, safeInt } = require('../utils/helpers');

// =============================================================================
//  AMS — expositores
// =============================================================================

/** MERGE exhibitor: inserta o actualiza. Devuelve id_exhibitor (INT). */
async function upsertExhibitor(rec) {
    const pool = await getPool();
    const r = await pool.request()
        .input('exhibitor_id',          sql.NVarChar(200), rec.exhibitor_id)
        .input('score',                 sql.Float,         rec.score          ?? null)
        .input('jump_label_id',         sql.NVarChar(10),  safeStr(rec.jump_label_id, 10))
        .input('rewrite_id',            sql.NVarChar(200), safeStr(rec.rewrite_id))
        .input('exhibitor_name',        sql.NVarChar(300), safeStr(rec.exhibitor_name))
        .input('sort_key',              sql.NVarChar(300), safeStr(rec.sort_key))
        .input('href',                  sql.NVarChar(500), safeStr(rec.href, 500))
        .input('logo',                  sql.NVarChar(500), safeStr(rec.logo, 500))
        .input('address_street',        sql.NVarChar(300), safeStr(rec.address_street))
        .input('address_city',          sql.NVarChar(200), safeStr(rec.address_city, 200))
        .input('address_zip',           sql.NVarChar(20),  safeStr(rec.address_zip, 20))
        .input('address_tel',           sql.NVarChar(50),  safeStr(rec.address_tel, 50))
        .input('address_country_iso3',  sql.NVarChar(5),   safeStr(rec.address_country_iso3, 5))
        .input('address_country_label', sql.NVarChar(100), safeStr(rec.address_country_label, 100))
        .input('address_email',         sql.NVarChar(300), safeStr(rec.address_email))
        .query(`
            MERGE ams_exhibitor AS tgt
            USING (SELECT @exhibitor_id AS exhibitor_id) AS src ON tgt.exhibitor_id = src.exhibitor_id
            WHEN MATCHED THEN UPDATE SET
                score                 = @score,
                jump_label_id         = @jump_label_id,
                rewrite_id            = @rewrite_id,
                exhibitor_name        = @exhibitor_name,
                sort_key              = @sort_key,
                href                  = @href,
                logo                  = @logo,
                address_street        = @address_street,
                address_city          = @address_city,
                address_zip           = @address_zip,
                address_tel           = @address_tel,
                address_country_iso3  = @address_country_iso3,
                address_country_label = @address_country_label,
                address_email         = @address_email,
                loaded_at             = GETDATE()
            WHEN NOT MATCHED THEN INSERT (
                exhibitor_id, score, jump_label_id, rewrite_id, exhibitor_name,
                sort_key, href, logo, address_street, address_city, address_zip,
                address_tel, address_country_iso3, address_country_label, address_email
            ) VALUES (
                @exhibitor_id, @score, @jump_label_id, @rewrite_id, @exhibitor_name,
                @sort_key, @href, @logo, @address_street, @address_city, @address_zip,
                @address_tel, @address_country_iso3, @address_country_label, @address_email
            );
            SELECT id_exhibitor FROM ams_exhibitor WHERE exhibitor_id = @exhibitor_id;
        `);
    return r.recordset[0].id_exhibitor;
}

async function replaceCategories(idExhibitor, categories) {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, idExhibitor)
        .query('DELETE FROM ams_category WHERE id_exhibitor = @id');
    for (const c of categories) {
        await pool.request()
            .input('id_exhibitor',    sql.Int,          idExhibitor)
            .input('category_id',     sql.NVarChar(100),safeStr(c.category_id, 100))
            .input('category_name',   sql.NVarChar(300),safeStr(c.category_name))
            .input('subcategory_id',  sql.NVarChar(100),safeStr(c.subcategory_id, 100))
            .input('subcategory_name',sql.NVarChar(500),safeStr(c.subcategory_name, 500))
            .query(`INSERT INTO ams_category (id_exhibitor,category_id,category_name,subcategory_id,subcategory_name)
                    VALUES (@id_exhibitor,@category_id,@category_name,@subcategory_id,@subcategory_name)`);
    }
}

async function replaceStands(idExhibitor, stands) {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, idExhibitor)
        .query('DELETE FROM ams_stand WHERE id_exhibitor = @id');
    for (const s of stands) {
        await pool.request()
            .input('id_exhibitor',          sql.Int,          idExhibitor)
            .input('presentation_name',     sql.NVarChar(300),safeStr(s.presentation_name))
            .input('exhibitor_url_rewrite', sql.NVarChar(300),safeStr(s.exhibitor_url_rewrite))
            .input('hall_and_level',        sql.NVarChar(20), safeStr(s.hall_and_level, 20))
            .input('first_booth_number',    sql.NVarChar(20), safeStr(s.first_booth_number, 20))
            .query(`INSERT INTO ams_stand (id_exhibitor,presentation_name,exhibitor_url_rewrite,hall_and_level,first_booth_number)
                    VALUES (@id_exhibitor,@presentation_name,@exhibitor_url_rewrite,@hall_and_level,@first_booth_number)`);
    }
}

// =============================================================================
//  PENTA — claves y descargas
// =============================================================================

async function saveSupplierKeys(idExhibitor, keys) {
    const pool = await getPool();
    for (const k of keys) {
        try {
            await pool.request()
                .input('id_exhibitor', sql.Int,          idExhibitor)
                .input('clave',        sql.VarChar(20),  safeStr(k.clave, 20))
                .input('nombre',       sql.NVarChar(300),safeStr(k.valor))
                .query(`IF NOT EXISTS (SELECT 1 FROM penta_supplier_key WHERE clave = @clave)
                        INSERT INTO penta_supplier_key (id_exhibitor,clave,nombre)
                        VALUES (@id_exhibitor,@clave,@nombre)`);
        } catch { /* clave duplicada de otra empresa — ignorar */ }
    }
}

/** Inserta log de descarga. Devuelve id_job. */
async function insertJobLog(idExhibitor, status, periodStart, periodEnd, extras = {}) {
    const pool = await getPool();
    const r = await pool.request()
        .input('id_exhibitor',  sql.Int,           idExhibitor)
        .input('period_start',  sql.Date,          new Date(periodStart))
        .input('period_end',    sql.Date,          new Date(periodEnd))
        .input('tracking_code', sql.NVarChar(100), safeStr(extras.trackingCode, 100))
        .input('file_url',      sql.NVarChar(500), safeStr(extras.fileUrl, 500))
        .input('row_count',     sql.Int,           extras.rowCount ?? null)
        .input('status',        sql.VarChar(20),   status)
        .input('error_msg',     sql.NVarChar(1000),safeStr(extras.errorMsg, 1000))
        .query(`INSERT INTO penta_job_log
                    (id_exhibitor,period_start,period_end,tracking_code,file_url,row_count,status,error_msg)
                VALUES
                    (@id_exhibitor,@period_start,@period_end,@tracking_code,@file_url,@row_count,@status,@error_msg);
                SELECT SCOPE_IDENTITY() AS id_job;`);
    return r.recordset[0].id_job;
}

/** Inserta filas del xlsx. Borra primero las del mismo job (idempotente). */
async function saveImports(idExhibitor, idJob, rows) {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, idJob)
        .query('DELETE FROM penta_import WHERE id_job = @id');

    for (const row of rows) {
        await pool.request()
            .input('id_exhibitor',    sql.Int,            idExhibitor)
            .input('id_job',          sql.Int,            idJob)
            .input('ordinal',         sql.BigInt,         safeInt(row['Ordinal']))
            .input('ship_date',       sql.Date,           safeDate(row['Date']))
            .input('document',        sql.NVarChar(50),   safeStr(row['Document'], 50))
            .input('hs_code',         sql.NVarChar(20),   safeStr(row['HS Code'], 20))
            .input('origin_country',  sql.NVarChar(100),  safeStr(row['Origin Country'], 100))
            .input('importer',        sql.NVarChar(300),  safeStr(row['Importer']))
            .input('importer_ruc',    sql.NVarChar(20),   safeStr(row['RUC'], 20))
            .input('importer_addr',   sql.NVarChar(500),  safeStr(row['Address'], 500))
            .input('importer_city',   sql.NVarChar(200),  safeStr(row['Location'], 200))
            .input('supplier',        sql.NVarChar(300),  safeStr(row['Supplier']))
            .input('supplier_addr',   sql.NVarChar(500),  safeStr(row['Address.1'] ?? row['Address_1'], 500))
            .input('supplier_city',   sql.NVarChar(200),  safeStr(row['City'], 200))
            .input('customs',         sql.NVarChar(100),  safeStr(row['Customs'], 100))
            .input('transport',       sql.NVarChar(50),   safeStr(row['Transport'], 50))
            .input('usd_cif',         sql.Decimal(18,2),  safeNum(row['U$S CIF']))
            .input('usd_unit',        sql.Decimal(18,4),  safeNum(row['U$S Unit']))
            .input('gross_weight_kg', sql.Decimal(18,3),  safeNum(row['Gross Weight']))
            .input('quantity',        sql.Decimal(18,3),  safeNum(row['Quantity']))
            .input('quantity_unit',   sql.NVarChar(20),   safeStr(row['Unit'], 20))
            .input('volume',          sql.Decimal(18,3),  safeNum(row['Volume']))
            .input('volume_unit',     sql.NVarChar(20),   safeStr(row['Unit.1'] ?? row['Unit_1'], 20))
            .input('description',     sql.NVarChar(1000), safeStr(row['Description'], 1000))
            .query(`INSERT INTO penta_import (
                id_exhibitor,id_job,ordinal,ship_date,document,hs_code,origin_country,
                importer,importer_ruc,importer_address,importer_city,
                supplier,supplier_address,supplier_city,customs,transport,
                usd_cif,usd_unit,gross_weight_kg,quantity,quantity_unit,volume,volume_unit,description
            ) VALUES (
                @id_exhibitor,@id_job,@ordinal,@ship_date,@document,@hs_code,@origin_country,
                @importer,@importer_ruc,@importer_addr,@importer_city,
                @supplier,@supplier_addr,@supplier_city,@customs,@transport,
                @usd_cif,@usd_unit,@gross_weight_kg,@quantity,@quantity_unit,@volume,@volume_unit,@description
            )`);
    }
}

/** Expositores chinos sin job registrado para el período dado. */
async function getPendingExhibitors(periodStart, periodEnd) {
    const pool = await getPool();
    const r = await pool.request()
        .input('ps', sql.Date, new Date(periodStart))
        .input('pe', sql.Date, new Date(periodEnd))
        .query(`SELECT e.id_exhibitor, e.exhibitor_name
                FROM   ams_exhibitor e
                WHERE  e.address_country_iso3 = 'CHN'
                  AND  e.active = 1
                  AND  NOT EXISTS (
                      SELECT 1 FROM penta_job_log j
                      WHERE  j.id_exhibitor = e.id_exhibitor
                        AND  j.period_start = @ps
                        AND  j.period_end   = @pe
                        AND  j.status      IN ('OK','NO_DATA')
                  )
                ORDER BY e.exhibitor_name`);
    return r.recordset;
}

/** Estadísticas de resumen para el comando "status" */
async function getStats() {
    const pool = await getPool();
    const r = await pool.request().query(`
        SELECT
            (SELECT COUNT(*) FROM ams_exhibitor WHERE active = 1)          AS total_exhibitors,
            (SELECT COUNT(*) FROM ams_exhibitor WHERE address_country_iso3 = 'CHN' AND active = 1) AS cn_exhibitors,
            (SELECT COUNT(*) FROM penta_job_log WHERE status = 'OK')       AS jobs_ok,
            (SELECT COUNT(*) FROM penta_job_log WHERE status = 'NO_DATA')  AS jobs_no_data,
            (SELECT COUNT(*) FROM penta_job_log WHERE status = 'ERROR')    AS jobs_error,
            (SELECT COUNT(*) FROM penta_import)                            AS total_imports,
            (SELECT COUNT(DISTINCT importer) FROM penta_import)            AS unique_importers,
            (SELECT ISNULL(SUM(usd_cif),0) FROM penta_import)             AS total_usd_cif
    `);
    return r.recordset[0];
}

/** Busca el alias de búsqueda para un expositor en name_alias. Devuelve null si no existe. */
async function getAlias(exhibitorName) {
    const pool = await getPool();
    const r = await pool.request()
        .input('exhibitor_name', sql.NVarChar(300), exhibitorName)
        .query(`SELECT search_term FROM name_alias WHERE exhibitor_name = @exhibitor_name`);
    return r.recordset[0]?.search_term ?? null;
}

/**
 * Guarda un alias aprendido automáticamente.
 * Si ya existe un alias 'csv' o 'manual', no lo sobreescribe.
 * Si ya existe 'learned', incrementa success_count.
 */
async function saveLearnedAlias(exhibitorName, searchTerm) {
    const pool = await getPool();
    await pool.request()
        .input('exhibitor_name', sql.NVarChar(300), exhibitorName)
        .input('search_term',   sql.NVarChar(300), searchTerm)
        .query(`
            MERGE name_alias AS tgt
            USING (SELECT @exhibitor_name AS exhibitor_name) AS src
                ON tgt.exhibitor_name = src.exhibitor_name
            WHEN MATCHED AND tgt.source = 'learned' THEN
                UPDATE SET
                    search_term   = @search_term,
                    success_count = success_count + 1,
                    loaded_at     = GETDATE()
            WHEN NOT MATCHED THEN
                INSERT (exhibitor_name, search_term, source, success_count)
                VALUES (@exhibitor_name, @search_term, 'learned', 1);
        `);
}

module.exports = {
    upsertExhibitor, replaceCategories, replaceStands,
    saveSupplierKeys, insertJobLog, saveImports,
    getPendingExhibitors, getStats,
    getAlias, saveLearnedAlias,
};