-- migrations/001_ams_tables.sql
-- Tablas del catálogo de expositores de Automechanika Shanghai

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ams_exhibitor')
CREATE TABLE ams_exhibitor (
    id_exhibitor          INT           IDENTITY(1,1) PRIMARY KEY,
    exhibitor_id          NVARCHAR(200) NOT NULL,
    score                 FLOAT         NULL,
    jump_label_id         NVARCHAR(10)  NULL,
    rewrite_id            NVARCHAR(200) NULL,
    exhibitor_name        NVARCHAR(300) NOT NULL,
    sort_key              NVARCHAR(300) NULL,
    href                  NVARCHAR(500) NULL,
    logo                  NVARCHAR(500) NULL,
    address_street        NVARCHAR(300) NULL,
    address_city          NVARCHAR(200) NULL,
    address_zip           NVARCHAR(20)  NULL,
    address_tel           NVARCHAR(50)  NULL,
    address_country_iso3  NVARCHAR(5)   NULL,
    address_country_label NVARCHAR(100) NULL,
    address_email         NVARCHAR(300) NULL,
    loaded_at             DATETIME      NOT NULL DEFAULT GETDATE(),
    active                BIT           NOT NULL DEFAULT 1,
    CONSTRAINT uq_ams_exhibitor_id UNIQUE (exhibitor_id)
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ams_category')
CREATE TABLE ams_category (
    id_category      INT           IDENTITY(1,1) PRIMARY KEY,
    id_exhibitor     INT           NOT NULL REFERENCES ams_exhibitor(id_exhibitor) ON DELETE CASCADE,
    category_id      NVARCHAR(100) NULL,
    category_name    NVARCHAR(300) NULL,
    subcategory_id   NVARCHAR(100) NULL,
    subcategory_name NVARCHAR(500) NULL,
    loaded_at        DATETIME      NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ams_stand')
CREATE TABLE ams_stand (
    id_stand              INT           IDENTITY(1,1) PRIMARY KEY,
    id_exhibitor          INT           NOT NULL REFERENCES ams_exhibitor(id_exhibitor) ON DELETE CASCADE,
    presentation_name     NVARCHAR(300) NULL,
    exhibitor_url_rewrite NVARCHAR(300) NULL,
    hall_and_level        NVARCHAR(20)  NULL,
    first_booth_number    NVARCHAR(20)  NULL,
    loaded_at             DATETIME      NOT NULL DEFAULT GETDATE()
);
