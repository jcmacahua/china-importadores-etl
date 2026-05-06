-- migrations/003_indexes_and_views.sql
-- Índices de rendimiento y vistas para Power BI / dashboard
--
-- REGLA SQL Server: CREATE VIEW debe ser la ÚNICA sentencia del batch.
-- Por eso cada bloque está separado con GO.

-- ── Índices ───────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_ams_country')
    CREATE INDEX ix_ams_country ON ams_exhibitor (address_country_iso3);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_ams_name')
    CREATE INDEX ix_ams_name ON ams_exhibitor (exhibitor_name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_penta_key_exhibitor')
    CREATE INDEX ix_penta_key_exhibitor ON penta_supplier_key (id_exhibitor);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_import_exhibitor')
    CREATE INDEX ix_import_exhibitor ON penta_import (id_exhibitor);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_import_importer')
    CREATE INDEX ix_import_importer ON penta_import (importer);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_import_ship_date')
    CREATE INDEX ix_import_ship_date ON penta_import (ship_date);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_import_hs_code')
    CREATE INDEX ix_import_hs_code ON penta_import (hs_code);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_import_usd_cif')
    CREATE INDEX ix_import_usd_cif ON penta_import (usd_cif);
GO

-- ── Vista principal — base del dashboard ──────────────────────────────────────
IF OBJECT_ID('vw_import_detail', 'V') IS NOT NULL DROP VIEW vw_import_detail;
GO

CREATE VIEW vw_import_detail AS
SELECT
    e.id_exhibitor,
    e.exhibitor_name                  AS supplier_ams,
    e.address_country_iso3            AS supplier_country,
    e.address_city                    AS supplier_city_ams,
    e.href                            AS supplier_website,
    cat.category_name,
    cat.subcategory_name,
    st.hall_and_level,
    st.first_booth_number,
    i.supplier                        AS supplier_penta,
    i.importer,
    i.importer_ruc                    AS rfc,
    i.importer_city,
    i.customs,
    i.transport,
    i.hs_code,
    i.description,
    i.ship_date,
    YEAR(i.ship_date)                 AS ship_year,
    MONTH(i.ship_date)                AS ship_month,
    i.usd_cif,
    i.usd_unit,
    i.gross_weight_kg,
    i.quantity,
    i.quantity_unit
FROM ams_exhibitor e
    LEFT JOIN ams_category cat
        ON  cat.id_exhibitor = e.id_exhibitor
        AND cat.id_category  = (
            SELECT MIN(c2.id_category)
            FROM   ams_category c2
            WHERE  c2.id_exhibitor = e.id_exhibitor
        )
    LEFT JOIN ams_stand st
        ON  st.id_exhibitor = e.id_exhibitor
        AND st.id_stand     = (
            SELECT MIN(s2.id_stand)
            FROM   ams_stand s2
            WHERE  s2.id_exhibitor = e.id_exhibitor
        )
    LEFT JOIN penta_import i ON i.id_exhibitor = e.id_exhibitor
WHERE e.active = 1;
GO

-- ── Vista: top importadores MX ────────────────────────────────────────────────
IF OBJECT_ID('vw_top_importers', 'V') IS NOT NULL DROP VIEW vw_top_importers;
GO

CREATE VIEW vw_top_importers AS
SELECT
    i.importer,
    i.importer_ruc                    AS rfc,
    i.importer_city,
    COUNT(DISTINCT e.id_exhibitor)    AS unique_suppliers,
    COUNT(i.id_import)                AS shipments,
    SUM(i.usd_cif)                    AS total_usd_cif,
    AVG(i.usd_cif)                    AS avg_usd_cif,
    SUM(i.gross_weight_kg)            AS total_kg,
    MIN(i.ship_date)                  AS first_shipment,
    MAX(i.ship_date)                  AS last_shipment
FROM penta_import i
    INNER JOIN ams_exhibitor e ON e.id_exhibitor = i.id_exhibitor
WHERE i.importer IS NOT NULL
GROUP BY i.importer, i.importer_ruc, i.importer_city;
GO

-- ── Vista: top proveedores chinos ─────────────────────────────────────────────
IF OBJECT_ID('vw_top_suppliers', 'V') IS NOT NULL DROP VIEW vw_top_suppliers;
GO

CREATE VIEW vw_top_suppliers AS
SELECT
    e.exhibitor_name,
    e.href                            AS website,
    cat.category_name,
    COUNT(DISTINCT i.importer)        AS mx_importers,
    COUNT(i.id_import)                AS shipments,
    SUM(i.usd_cif)                    AS total_usd_cif,
    SUM(i.gross_weight_kg)            AS total_kg
FROM ams_exhibitor e
    LEFT JOIN ams_category cat
        ON  cat.id_exhibitor = e.id_exhibitor
        AND cat.id_category  = (
            SELECT MIN(c2.id_category)
            FROM   ams_category c2
            WHERE  c2.id_exhibitor = e.id_exhibitor
        )
    LEFT JOIN penta_import i ON i.id_exhibitor = e.id_exhibitor
WHERE e.address_country_iso3 = 'CHN'
GROUP BY e.exhibitor_name, e.href, cat.category_name;
GO