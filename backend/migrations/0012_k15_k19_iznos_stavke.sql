-- 0012: K15 — iznos retka u bazi, K19 — zastarjeli indeksi.
--
-- K15: stavka.iznos je osnovica retka nakon popusta (decimalni string, kao
-- ostali iznosi). Upisuje je izdavanje iz izracunajIznose().osnovicePoStavci.
-- PDF, API i admin je čitaju umjesto da je ponovno računaju.
--
-- Backfill ispod ponavlja formulu iz validacija.ts u cjelobrojnoj aritmetici:
--   sirovo  = centi(cijena) * tisucinke(kolicina) * (10000 - bps(popust))
--   iznos   = predznak * half-up(|sirovo| / 10^7)  [centi]
-- Test test/stavka-iznos.test.ts izvodi baš ovaj UPDATE i uspoređuje ga s JS-om.
-- Uvjet `iznos IS NULL` čini ga ponovljivim: retke koje stari kod upiše između
-- migracije i deploya novog koda pokriva ponovno izvođenje istog UPDATE-a.
--
-- K14: racun.status = 'fiskaliziran' odsad znači samo B2C s JIR-om. eRačuni
-- (doku) koje je stari kod označio 'fiskaliziran' vraćaju se na 'poslan',
-- FISCALIZED/DELIVERED ostaje u eracun_status. Na dan pisanja: TEST 1 redak,
-- PROD 0.
--
-- K19: ix_racun_ceka_jir (0004) gleda samo status 'izdano', a sweep od 0009 gleda
-- i 'storniran' preko ix_racun_sweep. ix_racun_eracun_ceka (0006) ne koristi
-- nijedan upit.

ALTER TABLE stavka ADD COLUMN iznos TEXT;

UPDATE stavka SET iznos = x.iznos
FROM (
  SELECT id,
         CASE WHEN o < 0 THEN '-' ELSE '' END
           || (abs(o) / 100) || '.' || substr('0' || (abs(o) % 100), -2) AS iznos
  FROM (
    SELECT id,
           CASE WHEN s < 0 THEN -((-s + 5000000) / 10000000) ELSE (s + 5000000) / 10000000 END AS o
    FROM (
      SELECT id,
             CAST(ROUND(CAST(neto_cijena AS REAL) * 100) AS INTEGER)
               * CAST(ROUND(CAST(kolicina AS REAL) * 1000) AS INTEGER)
               * (10000 - CAST(ROUND(CAST(COALESCE(popust_posto, '0') AS REAL) * 100) AS INTEGER)) AS s
      FROM stavka
      WHERE iznos IS NULL
    )
  )
) AS x
WHERE stavka.id = x.id AND stavka.iznos IS NULL;

UPDATE racun SET status = 'poslan', updated_at = datetime('now')
WHERE doku_id IS NOT NULL AND jir IS NULL AND status = 'fiskaliziran';

DROP INDEX IF EXISTS ix_racun_ceka_jir;
DROP INDEX IF EXISTS ix_racun_eracun_ceka;
