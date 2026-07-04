-- =========================================================
-- 0002_dokumenti.sql — Faza 1: nefiskalni dokumenti
--   * sekvenca dobiva `vrsta` (ponuda/racun/fiskalni) — ODVOJENI slijedovi po
--     tipu dokumenta (Fira: tabovi Računi · Fiskalni · Ponude/Predračuni;
--     rješava nalaz iz faze 0 da ponude troše brojeve računa).
--   * racun: skica (status 'nacrt') NEMA broj — redni_broj/broj_racuna_full
--     su NULL do izdavanja; nova polja za dospijeće/plaćanje/uvjete/klauzule.
--   * proizvod (katalog, KPD 2025 obavezan) + kpd_sifrarnik (službeni DZS).
-- Tablice sekvenca i racun se rekreiraju (SQLite ne mijenja constrainte).
-- =========================================================

-- 1) SEKVENCA s vrstom dokumenta
CREATE TABLE sekvenca_v2 (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  vrsta         TEXT NOT NULL DEFAULT 'racun' CHECK (vrsta IN ('ponuda','racun','fiskalni')),
  razina_tip    TEXT NOT NULL CHECK (razina_tip IN ('PP','NU')),
  razina_id     INTEGER NOT NULL,
  godina        INTEGER NOT NULL,
  zadnji_broj   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, vrsta, razina_tip, razina_id, godina)
);
INSERT INTO sekvenca_v2 (id, tenant_id, vrsta, razina_tip, razina_id, godina, zadnji_broj)
  SELECT id, tenant_id, 'racun', razina_tip, razina_id, godina, zadnji_broj FROM sekvenca;
DROP TABLE sekvenca;
ALTER TABLE sekvenca_v2 RENAME TO sekvenca;

-- 2) RACUN: nullable broj (skice), sekvenca_vrsta, faza-1 polja, tip 'predracun'
CREATE TABLE racun_v2 (
  id                    INTEGER PRIMARY KEY,
  tenant_id             INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  poslovni_prostor_id   INTEGER NOT NULL REFERENCES poslovni_prostor(id),
  naplatni_uredaj_id    INTEGER NOT NULL REFERENCES naplatni_uredaj(id),
  operater_id           INTEGER REFERENCES operater(id),
  kupac_id              INTEGER REFERENCES kupac(id),
  sekvenca_vrsta        TEXT NOT NULL DEFAULT 'racun'
                         CHECK (sekvenca_vrsta IN ('ponuda','racun','fiskalni')),
  redni_broj            INTEGER,            -- NULL = skica (broj tek pri izdavanju)
  godina                INTEGER,
  broj_racuna_full      TEXT,               -- 'redni/oznPP/oznNU'
  oznaka_slijednosti    TEXT NOT NULL CHECK (oznaka_slijednosti IN ('P','N')),
  datum_vrijeme         TEXT NOT NULL,      -- vrijeme kreiranja; kod izdavanja se ažurira
  tip_dokumenta         TEXT NOT NULL
                         CHECK (tip_dokumenta IN
                           ('ponuda','predracun','racun','fiskalni_b2c','eracun_b2b','eracun_b2g')),
  vrsta_dokumenta       TEXT,               -- UNTDID 1001, npr '380'
  vrsta_poslovnog_proc  TEXT,
  valuta                TEXT NOT NULL DEFAULT 'EUR',
  nacin_placanja        TEXT,
  datum_dospijeca       TEXT,               -- rok plaćanja
  vrijedi_do            TEXT,               -- za ponude/predračune
  datum_isporuke        TEXT,               -- čl. 79 t. 5 (ako odrediv i ≠ datum izdavanja)
  model_placanja        TEXT,               -- npr 'HR00'
  poziv_na_broj         TEXT,               -- npr '2-2026'
  neto                  TEXT,
  iznos_bez_pdv         TEXT,
  pdv                   TEXT,
  iznos_s_pdv           TEXT,
  dospijeva_za_placanje TEXT,
  klauzula_pdv          TEXT,               -- npr. čl. 90. st. 1. za ne-PDV obveznika
  napomena              TEXT,               -- vidljiva na PDF-u
  interna_biljeska      TEXT,               -- NIJE na PDF-u (Fira 'Bilješke')
  uvjeti                TEXT,               -- uvjeti plaćanja/isporuke, footer PDF-a
  poslano_email_ts      TEXT,               -- zadnje uspješno slanje e-mailom
  poslano_email_na      TEXT,
  zki                   TEXT,
  jir                   TEXT,
  qr_payload            TEXT,
  indikator_kopije      INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'nacrt'
                         CHECK (status IN
                           ('nacrt','izdano','poslan','fiskaliziran','odbijen',
                            'storniran','naplacen')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO racun_v2 (id, tenant_id, poslovni_prostor_id, naplatni_uredaj_id, operater_id,
                      kupac_id, sekvenca_vrsta, redni_broj, godina, broj_racuna_full,
                      oznaka_slijednosti, datum_vrijeme, tip_dokumenta, vrsta_dokumenta,
                      vrsta_poslovnog_proc, valuta, nacin_placanja, neto, iznos_bez_pdv,
                      pdv, iznos_s_pdv, dospijeva_za_placanje, zki, jir, qr_payload,
                      indikator_kopije, status, created_at, updated_at)
  SELECT id, tenant_id, poslovni_prostor_id, naplatni_uredaj_id, operater_id,
         kupac_id, CASE WHEN tip_dokumenta = 'ponuda' THEN 'ponuda' ELSE 'racun' END,
         redni_broj, godina, broj_racuna_full,
         oznaka_slijednosti, datum_vrijeme, tip_dokumenta, vrsta_dokumenta,
         vrsta_poslovnog_proc, valuta, nacin_placanja, neto, iznos_bez_pdv,
         pdv, iznos_s_pdv, dospijeva_za_placanje, zki, jir, qr_payload,
         indikator_kopije, status, created_at, updated_at
  FROM racun;
DROP TABLE racun;
ALTER TABLE racun_v2 RENAME TO racun;

CREATE INDEX ix_racun_tenant_datum ON racun(tenant_id, datum_vrijeme);
CREATE INDEX ix_racun_jir          ON racun(jir);
CREATE INDEX ix_racun_status       ON racun(tenant_id, status);
CREATE INDEX ix_racun_kupac        ON racun(kupac_id);
-- Jedinstvenost broja po slijedu (vrsta!) — skice (NULL) izuzete.
CREATE UNIQUE INDEX ux_racun_broj ON racun(tenant_id, sekvenca_vrsta, godina,
  poslovni_prostor_id, naplatni_uredaj_id, redni_broj) WHERE redni_broj IS NOT NULL;

-- 3) STAVKA: popust + veza na proizvod
ALTER TABLE stavka ADD COLUMN popust_posto TEXT NOT NULL DEFAULT '0';
ALTER TABLE stavka ADD COLUMN proizvod_id INTEGER REFERENCES proizvod(id);
ALTER TABLE stavka ADD COLUMN opis TEXT;

-- 4) PROIZVOD (katalog; KPD 2025 obavezan po proizvodu — fira-ui-walkthrough §8)
CREATE TABLE proizvod (
  id             INTEGER PRIMARY KEY,
  tenant_id      INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  naziv          TEXT NOT NULL,
  sifra          TEXT,                          -- interna šifra
  jedinica_mjere TEXT NOT NULL DEFAULT 'H87',   -- UN/ECE Rec 20
  neto_cijena    TEXT NOT NULL,
  pdv_stopa      TEXT NOT NULL DEFAULT '25',
  pdv_kategorija TEXT NOT NULL DEFAULT 'S',
  kpd            TEXT NOT NULL,                 -- KPD 2025 potkategorija 'NN.NN.NN'
  opis           TEXT,
  aktivan        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, sifra)
);
CREATE INDEX ix_proizvod_tenant ON proizvod(tenant_id);

-- 5) KPD ŠIFRARNIK (službeni DZS KPD 2025; seed u 0003)
CREATE TABLE kpd_sifrarnik (
  sifra   TEXT PRIMARY KEY,       -- 'NN.NN.NN' (potkategorija, razina 6)
  naziv   TEXT NOT NULL,
  verzija TEXT NOT NULL DEFAULT 'KPD 2025'
);
