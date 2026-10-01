-- =========================================================
-- 0008_robusna_fiskalizacija.sql — Faza 4.2: robusna fiskalizacija (N2–N5)
--   * racun.fiskal_zakljucano_do: lease (claim) — samo jedan pozivatelj
--     (sinkroni POST, ručni retry, admin, cron) šalje račun CIS-u u isto vrijeme;
--   * tenant.email: kontakt tenanta za alarme i reply-to na e-mailu računa (4.4);
--   * alarm: deduplikacija alarmnih mailova (isti ključ ne češće od intervala);
--   * sustav_stanje: zadnji sweep, zadnji CIS echo — za alarme i /api/v1/zdravlje.
-- =========================================================

ALTER TABLE racun ADD COLUMN fiskal_zakljucano_do TEXT; -- datetime('now') format; NULL = slobodan
ALTER TABLE tenant ADD COLUMN email TEXT;

CREATE TABLE alarm (
  kljuc          TEXT PRIMARY KEY,   -- npr. 'bez-jira-24h:5', 'cert-30:5:prod'
  tenant_id      INTEGER REFERENCES tenant(id) ON DELETE CASCADE,
  poruka         TEXT NOT NULL,
  prvi_put       TEXT NOT NULL DEFAULT (datetime('now')),
  zadnje_slanje  TEXT NOT NULL DEFAULT (datetime('now')),
  broj_slanja    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sustav_stanje (
  kljuc       TEXT PRIMARY KEY,      -- 'sweep_zadnji', 'cis_echo_zadnji_ok', 'cis_echo_zadnji_pokusaj', …
  vrijednost  TEXT,
  azurirano   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sweep: kandidati po zadnjem pokušaju (NULL prvi), fer po tenantu.
CREATE INDEX ix_racun_sweep ON racun(fiskal_zadnji_pokusaj, tenant_id)
  WHERE tip_dokumenta = 'fiskalni_b2c' AND status = 'izdano' AND jir IS NULL;
