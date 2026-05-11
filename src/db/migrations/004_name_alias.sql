-- migrations/004_name_alias.sql
-- Diccionario de búsqueda: mapea nombre del expositor → término que Penta entiende
--
-- Fuentes:
--   1. Importación del CSV buscar_como.csv (script aparte: npm run import-aliases)
--   2. Aprendizaje automático: el scraper registra qué término funcionó en cada empresa

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'name_alias')
CREATE TABLE name_alias (
    id_alias        INT            IDENTITY(1,1) PRIMARY KEY,
    exhibitor_name  NVARCHAR(300)  NOT NULL,   -- nombre exacto en ams_exhibitor
    search_term     NVARCHAR(300)  NOT NULL,   -- término que funciona en Penta /ayuda
    source          VARCHAR(20)    NOT NULL DEFAULT 'manual',
                                               -- 'csv' | 'manual' | 'learned'
    success_count   INT            NOT NULL DEFAULT 1,  -- veces que encontró resultados
    loaded_at       DATETIME       NOT NULL DEFAULT GETDATE(),
    CONSTRAINT uq_alias UNIQUE (exhibitor_name)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_alias_name')
    CREATE INDEX ix_alias_name ON name_alias (exhibitor_name);
GO
