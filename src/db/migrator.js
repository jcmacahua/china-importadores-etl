'use strict';
/**
 * src/db/migrator.js
 *
 * Ejecuta los archivos .sql de migrations/ en orden numérico.
 * Lleva un registro en la tabla _migrations para no re-ejecutar.
 *
 * Uso:
 *   const { runMigrations } = require('./migrator');
 *   await runMigrations();               // aplica pendientes
 *   await runMigrations({ fresh: true }); // borra y recrea todo
 */
const fs     = require('fs');
const path   = require('path');
const { getPool, sql } = require('./connection');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ── Tabla de control ──────────────────────────────────────────────────────────
const CREATE_CONTROL_TABLE = `
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '_migrations')
    CREATE TABLE _migrations (
        id          INT           IDENTITY(1,1) PRIMARY KEY,
        filename    NVARCHAR(100) NOT NULL UNIQUE,
        applied_at  DATETIME      NOT NULL DEFAULT GETDATE()
    )`;

// ── Listar archivos .sql ordenados ────────────────────────────────────────────
function getMigrationFiles() {
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();  // orden numérico por prefijo 001_, 002_, ...
}

// ── Verificar cuáles ya corrieron ─────────────────────────────────────────────
async function getApplied(pool) {
    const r = await pool.request().query('SELECT filename FROM _migrations');
    return new Set(r.recordset.map(row => row.filename));
}

// ── Ejecutar un archivo SQL (separa en batches por GO, como SSMS) ─────────────
async function runFile(pool, filepath) {
    const raw = fs.readFileSync(filepath, 'utf8');

    // 1. Separar en batches usando GO como separador (igual que SSMS)
    const batches = raw
        .split(/^\s*GO\s*(?:--[^\r\n]*)?\r?$/im)   // GO al inicio de línea, permite comentario inline
        .map(b => b.trim())
        .filter(b => {
            // Eliminar batches vacíos o que sean solo comentarios
            const noComments = b
                .replace(/--[^\r\n]*/g, '')          // quitar comentarios de línea
                .replace(/\/\*[\s\S]*?\*\//g, '')    // quitar comentarios de bloque
                .trim();
            return noComments.length > 0;
        });

    for (const batch of batches) {
        try {
            await pool.request().query(batch);
        } catch (err) {
            // Añadir contexto: mostrar las primeras líneas del batch que falló
            const preview = batch.split('\n').slice(0, 4).join(' ').substring(0, 120);
            throw new Error(`${err.message}\n  → Batch: ${preview}`);
        }
    }
}

// ── DROP completo para --fresh ────────────────────────────────────────────────
async function dropAll(pool) {
    logger.warn('migrate:fresh — eliminando todas las tablas y vistas...');

    // Vistas
    const views = await pool.request().query(`
        SELECT name FROM sys.views
        WHERE name IN ('vw_import_detail','vw_top_importers','vw_top_suppliers')`);
    for (const v of views.recordset) {
        await pool.request().query(`DROP VIEW IF EXISTS ${v.name}`);
    }

    // Tablas en orden inverso a FK
    const tables = ['penta_import','penta_job_log','penta_supplier_key',
                    'ams_stand','ams_category','ams_exhibitor','_migrations'];
    for (const t of tables) {
        await pool.request().query(`IF OBJECT_ID('${t}') IS NOT NULL DROP TABLE ${t}`);
    }
    logger.warn('Todas las tablas eliminadas.');
}

// ── Punto de entrada público ───────────────────────────────────────────────────
async function runMigrations({ fresh = false } = {}) {
    const pool = await getPool();

    if (fresh) await dropAll(pool);

    await pool.request().query(CREATE_CONTROL_TABLE);

    const files   = getMigrationFiles();
    const applied = await getApplied(pool);
    const pending = files.filter(f => !applied.has(f));

    if (!pending.length) {
        logger.ok('Migraciones: nada pendiente, la BD está al día.');
        return;
    }

    logger.info(`Migraciones pendientes: ${pending.length}`);
    for (const file of pending) {
        logger.info(`  Aplicando ${file}...`);
        await runFile(pool, path.join(MIGRATIONS_DIR, file));
        await pool.request()
            .input('f', sql.NVarChar(100), file)
            .query('INSERT INTO _migrations (filename) VALUES (@f)');
        logger.ok(`  ✓ ${file}`);
    }
    logger.ok('Migraciones completadas.');
}

module.exports = { runMigrations };