-- =========================================================
-- 0001_init.sql — Domovina Fiskal, multi-tenant shema
-- Izvor: docs/knowledge/05-podatkovni-model-multitenant.md §6
-- Devijacije od §6 (namjerne, dokumentirane):
--   * racun.status dodaje 'izdano' (nefiskalni dokumenti iz faze 0/1).
--   * certifikat: UNIQUE(tenant_id, okolina, aktivan) zamijenjen parcijalnim
--     unique indeksom WHERE aktivan=1 (inače bi rotacija dopuštala samo JEDAN
--     neaktivan cert po tenantu/okolini).
--   * certifikat: dodani dek_wrapped/dek_iv za envelope encryption (04-* §7:
--     per-tenant DEK omotan KEK-om iz Worker Secreta).
-- =========================================================

-- 1) TENANT / SME (izdavatelj)
CREATE TABLE tenant (
  id                       INTEGER PRIMARY KEY,
  oib                      TEXT NOT NULL UNIQUE,           -- 11 znamenki, mod-11 provjera u aplikaciji
  naziv                    TEXT NOT NULL,
  adr_ulica                TEXT,
  adr_kucni_broj           TEXT,
  adr_mjesto               TEXT,
  adr_postanski_broj       TEXT,
  adr_drzava               TEXT NOT NULL DEFAULT 'HR',
  u_sustavu_pdv            INTEGER NOT NULL DEFAULT 0,     -- 0/1
  iban                     TEXT,
  bic                      TEXT,
  naziv_banke              TEXT,
  oznaka_slijednosti_def   TEXT NOT NULL DEFAULT 'P'       -- 'P' (prostor) ili 'N' (uređaj)
                            CHECK (oznaka_slijednosti_def IN ('P','N')),
  eracun_izdavanje_od      TEXT,                           -- '2026-01-01' | '2027-01-01'
  status                   TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','suspended')),
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2) API KLJUČEVI (apiKey = tenant identitet; pohranjen SAMO hash)
CREATE TABLE api_kljuc (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  prefiks       TEXT NOT NULL,                 -- vidljivi prefiks za identifikaciju
  hash          TEXT NOT NULL UNIQUE,          -- SHA-256 tajnog dijela ključa
  opis          TEXT,
  aktivan       INTEGER NOT NULL DEFAULT 1,
  zadnje_koristen_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_apikljuc_tenant ON api_kljuc(tenant_id);

-- 3) CERTIFIKAT (per-tenant, enkriptiran; odvojeno test/prod)
CREATE TABLE certifikat (
  id                 INTEGER PRIMARY KEY,
  tenant_id          INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  okolina            TEXT NOT NULL CHECK (okolina IN ('test','prod')),
  pkcs12_encrypted   BLOB NOT NULL,            -- .p12 sadržaj, AES-256-GCM (DEK)
  enc_alg            TEXT NOT NULL DEFAULT 'AES-256-GCM',
  enc_key_id         TEXT NOT NULL,            -- referenca na KEK secret, NE ključ
  enc_iv             TEXT NOT NULL,            -- IV za podatke (hex)
  dek_wrapped        TEXT NOT NULL,            -- DEK omotan KEK-om (hex)
  dek_iv             TEXT NOT NULL,            -- IV omatanja DEK-a (hex)
  subject_dn         TEXT,
  serial             TEXT,
  fingerprint_sha256 TEXT,
  not_before         TEXT,
  not_after          TEXT,
  aktivan            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_cert_tenant ON certifikat(tenant_id);
CREATE UNIQUE INDEX ux_cert_aktivan ON certifikat(tenant_id, okolina) WHERE aktivan = 1;

-- 4) POSLOVNI PROSTOR (mora biti 'prijavljen' u CIS prije FISKALNOG računa)
CREATE TABLE poslovni_prostor (
  id                     INTEGER PRIMARY KEY,
  tenant_id              INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  oznaka                 TEXT NOT NULL,          -- oznPP; dio broja računa i ZKI-ja
  adr_ulica              TEXT,
  adr_kucni_broj         TEXT,
  adr_naselje            TEXT,
  adr_postanski_broj     TEXT,
  adr_opcina             TEXT,
  bez_fiksne_adrese      INTEGER NOT NULL DEFAULT 0,  -- pokretni prostor
  tip_prostora           TEXT,
  sifra_djelatnosti_nkd  TEXT,
  radno_vrijeme          TEXT,
  datum_pocetka_primjene TEXT NOT NULL,          -- MORA biti prije prvog računa
  datum_zatvaranja       TEXT,
  cis_status             TEXT NOT NULL DEFAULT 'neposlano'
                          CHECK (cis_status IN ('neposlano','prijavljen','greska')),
  cis_prijava_ts         TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, oznaka)
);
CREATE INDEX ix_pp_tenant ON poslovni_prostor(tenant_id);

-- 5) NAPLATNI UREĐAJ
CREATE TABLE naplatni_uredaj (
  id                  INTEGER PRIMARY KEY,
  poslovni_prostor_id INTEGER NOT NULL REFERENCES poslovni_prostor(id) ON DELETE CASCADE,
  oznaka              TEXT NOT NULL,             -- oznNU; dio broja računa i ZKI-ja
  opis                TEXT,
  aktivan             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (poslovni_prostor_id, oznaka)
);

-- 6) OPERATER
CREATE TABLE operater (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  oib_operatera TEXT NOT NULL,
  ime           TEXT,
  aktivan       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, oib_operatera)
);

-- 7) KUPAC (Primatelj)
CREATE TABLE kupac (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  naziv         TEXT NOT NULL,
  oib           TEXT,                    -- obavezan za eRačun B2B/B2G, NULL za anon B2C
  vat_number    TEXT,                    -- strani kupci
  adr_ulica     TEXT,
  adr_grad      TEXT,
  adr_postanski_broj TEXT,
  adr_drzava    TEXT DEFAULT 'HR',
  email         TEXT,
  tip           TEXT CHECK (tip IN ('fizicka','pravna','drzava')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_kupac_tenant ON kupac(tenant_id);
CREATE INDEX ix_kupac_oib    ON kupac(tenant_id, oib);

-- 8) SEKVENCE (atomski brojači po odabranoj razini slijednosti)
--    razina_tip: 'PP' -> razina_id = poslovni_prostor.id
--                'NU' -> razina_id = naplatni_uredaj.id
CREATE TABLE sekvenca (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  razina_tip    TEXT NOT NULL CHECK (razina_tip IN ('PP','NU')),
  razina_id     INTEGER NOT NULL,        -- FK na PP ili NU ovisno o razina_tip
  godina        INTEGER NOT NULL,
  zadnji_broj   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, razina_tip, razina_id, godina)
);
-- Dodjela sljedećeg broja: INSERT ... ON CONFLICT DO UPDATE SET zadnji_broj+1,
-- unutar istog D1 batcha (transakcije) kao INSERT računa — bez rupa i duplikata.

-- 9) RAČUN
CREATE TABLE racun (
  id                    INTEGER PRIMARY KEY,
  tenant_id             INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  poslovni_prostor_id   INTEGER NOT NULL REFERENCES poslovni_prostor(id),
  naplatni_uredaj_id    INTEGER NOT NULL REFERENCES naplatni_uredaj(id),
  operater_id           INTEGER REFERENCES operater(id),
  kupac_id              INTEGER REFERENCES kupac(id),     -- NULL za anon B2C
  redni_broj            INTEGER NOT NULL,
  godina                INTEGER NOT NULL,
  broj_racuna_full      TEXT NOT NULL,      -- 'redni/oznPP/oznNU'
  oznaka_slijednosti    TEXT NOT NULL CHECK (oznaka_slijednosti IN ('P','N')),
  datum_vrijeme         TEXT NOT NULL,      -- ISO 8601, sat+minuta obavezni za B2C
  tip_dokumenta         TEXT NOT NULL
                         CHECK (tip_dokumenta IN
                           ('ponuda','racun','fiskalni_b2c','eracun_b2b','eracun_b2g')),
  vrsta_dokumenta       TEXT,               -- UNTDID 1001, npr '380'
  vrsta_poslovnog_proc  TEXT,               -- ProfileID, npr '01'
  valuta                TEXT NOT NULL DEFAULT 'EUR',
  nacin_placanja        TEXT,               -- gotovina/kartica/transakcijski/ostalo
  neto                  TEXT,
  iznos_bez_pdv         TEXT,
  pdv                   TEXT,
  iznos_s_pdv           TEXT,
  dospijeva_za_placanje TEXT,
  zki                   TEXT,               -- 32 hex; i kad fiskalizacija ne uspije
  jir                   TEXT,               -- UUID od PU; NULL dok nije fiskalizirano
  qr_payload            TEXT,
  indikator_kopije      INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'nacrt'
                         CHECK (status IN
                           ('nacrt','izdano','poslan','fiskaliziran','odbijen',
                            'storniran','naplacen')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, godina, poslovni_prostor_id, naplatni_uredaj_id, redni_broj)
);
CREATE INDEX ix_racun_tenant_datum ON racun(tenant_id, datum_vrijeme);
CREATE INDEX ix_racun_jir          ON racun(jir);
CREATE INDEX ix_racun_status       ON racun(tenant_id, status);
CREATE INDEX ix_racun_kupac        ON racun(kupac_id);

-- 10) STAVKE RAČUNA
CREATE TABLE stavka (
  id              INTEGER PRIMARY KEY,
  racun_id        INTEGER NOT NULL REFERENCES racun(id) ON DELETE CASCADE,
  redni_broj      INTEGER NOT NULL,
  naziv           TEXT NOT NULL,
  kolicina        TEXT NOT NULL,
  jedinica_mjere  TEXT NOT NULL,       -- EN16931 unitCode (npr 'H87')
  neto_cijena     TEXT NOT NULL,
  pdv_kategorija  TEXT NOT NULL,       -- UNTDID 5305 'S','Z','E','AE'...
  pdv_stopa       TEXT NOT NULL,       -- 25/13/5/0
  kpd             TEXT,                -- KPD vrijednost npr '11.07.01'
  kpd_shema       TEXT NOT NULL DEFAULT 'CG',
  UNIQUE (racun_id, redni_broj)
);
CREATE INDEX ix_stavka_racun ON stavka(racun_id);

-- 11) PDV RAŠČLAMBA
CREATE TABLE pdv_raspodjela (
  id                  INTEGER PRIMARY KEY,
  racun_id            INTEGER NOT NULL REFERENCES racun(id) ON DELETE CASCADE,
  kategorija_pdv      TEXT NOT NULL,   -- 'S','Z','E','AE'
  stopa               TEXT NOT NULL,
  oporezivi_iznos     TEXT NOT NULL,
  iznos_poreza        TEXT NOT NULL,
  razlog_izuzeca_vatex TEXT
);
CREATE INDEX ix_pdvrasp_racun ON pdv_raspodjela(racun_id);

-- 12) NAPLATA (eIzvještavanje — koristi se od faze 3)
CREATE TABLE naplata (
  id             INTEGER PRIMARY KEY,
  racun_id       INTEGER NOT NULL REFERENCES racun(id) ON DELETE CASCADE,
  datum_naplate  TEXT NOT NULL,
  naplaceni_iznos TEXT NOT NULL,
  nacin_placanja TEXT NOT NULL,        -- 'T','K','O'
  prijavljeno_ts TEXT,                 -- kada je EvidentirajNaplata poslana (do 20. u mj.)
  status         TEXT NOT NULL DEFAULT 'nacrt'
                  CHECK (status IN ('nacrt','poslano','greska')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_naplata_racun ON naplata(racun_id);

-- 13) AUDIT LOG PORUKA (potpisani zahtjev + odgovor — koristi se od faze 2)
CREATE TABLE poruka_log (
  id            INTEGER PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  racun_id      INTEGER REFERENCES racun(id) ON DELETE SET NULL,
  vrsta_poruke  TEXT NOT NULL
                 CHECK (vrsta_poruke IN
                   ('poslovni_prostor','racun_b2c','eracun','naplata','odbijanje',
                    'isporuka_bez_eracuna')),
  smjer         TEXT NOT NULL CHECK (smjer IN ('zahtjev','odgovor')),
  message_id    TEXT,                  -- UUID id atribut (idempotencija)
  okolina       TEXT NOT NULL CHECK (okolina IN ('test','prod')),
  request_xml   TEXT,
  response_xml  TEXT,
  jir           TEXT,
  sifra_greske  TEXT,
  poruka_greske TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_poruka_tenant   ON poruka_log(tenant_id, created_at);
CREATE INDEX ix_poruka_racun    ON poruka_log(racun_id);
CREATE INDEX ix_poruka_msgid    ON poruka_log(message_id);
