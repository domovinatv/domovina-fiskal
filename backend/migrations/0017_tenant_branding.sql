-- =========================================================
-- 0017 — Izgled PDF računa po tenantu (branding)
-- Akcentna boja, logo i tekst podnožja (src/pdf/branding.ts). Sve opcionalno;
-- bez retka PDF ide u zadanoj Domovina temi. Logo je PNG/JPEG do 200 KB,
-- spremljen kao base64 u D1 (ulazi u dnevni D1 dump, bez R2 bindinga).
-- =========================================================
CREATE TABLE tenant_branding (
  tenant_id    INTEGER PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
  boja         TEXT CHECK (boja IS NULL OR (length(boja) = 7 AND substr(boja, 1, 1) = '#')),
  podnozje     TEXT,
  logo_b64     TEXT,
  logo_tip     TEXT CHECK (logo_tip IS NULL OR logo_tip IN ('png', 'jpg')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
