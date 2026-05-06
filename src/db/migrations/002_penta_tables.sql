-- migrations/002_penta_tables.sql
-- Tablas de importaciones Penta-Transaction MX

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'penta_supplier_key')
CREATE TABLE penta_supplier_key (
    id_key       INT           IDENTITY(1,1) PRIMARY KEY,
    id_exhibitor INT           NOT NULL REFERENCES ams_exhibitor(id_exhibitor),
    clave        VARCHAR(20)   NOT NULL,
    nombre       NVARCHAR(300) NOT NULL,
    country      VARCHAR(5)    NOT NULL DEFAULT 'CN',
    loaded_at    DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT uq_penta_clave UNIQUE (clave)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'penta_job_log')
CREATE TABLE penta_job_log (
    id_job         INT            IDENTITY(1,1) PRIMARY KEY,
    id_exhibitor   INT            NOT NULL REFERENCES ams_exhibitor(id_exhibitor),
    period_start   DATE           NOT NULL,
    period_end     DATE           NOT NULL,
    tracking_code  NVARCHAR(100)  NULL,
    file_url       NVARCHAR(500)  NULL,
    row_count      INT            NULL,
    status         VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
    error_msg      NVARCHAR(1000) NULL,
    executed_at    DATETIME       NOT NULL DEFAULT GETDATE()
    -- status: PENDING | OK | NO_DATA | ERROR
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'penta_import')
CREATE TABLE penta_import (
    id_import         INT             IDENTITY(1,1) PRIMARY KEY,
    id_exhibitor      INT             NOT NULL REFERENCES ams_exhibitor(id_exhibitor),
    id_job            INT             NULL     REFERENCES penta_job_log(id_job),
    ordinal           BIGINT          NULL,
    ship_date         DATE            NULL,
    document          NVARCHAR(50)    NULL,
    hs_code           NVARCHAR(20)    NULL,
    origin_country    NVARCHAR(100)   NULL,
    importer          NVARCHAR(300)   NULL,
    importer_ruc      NVARCHAR(20)    NULL,
    importer_address  NVARCHAR(500)   NULL,
    importer_city     NVARCHAR(200)   NULL,
    supplier          NVARCHAR(300)   NULL,
    supplier_address  NVARCHAR(500)   NULL,
    supplier_city     NVARCHAR(200)   NULL,
    customs           NVARCHAR(100)   NULL,
    transport         NVARCHAR(50)    NULL,
    usd_cif           DECIMAL(18,2)   NULL,
    usd_unit          DECIMAL(18,4)   NULL,
    gross_weight_kg   DECIMAL(18,3)   NULL,
    quantity          DECIMAL(18,3)   NULL,
    quantity_unit     NVARCHAR(20)    NULL,
    volume            DECIMAL(18,3)   NULL,
    volume_unit       NVARCHAR(20)    NULL,
    description       NVARCHAR(1000)  NULL,
    loaded_at         DATETIME        NOT NULL DEFAULT GETDATE()
);
