-- =========================================================
-- 0007_idempotencija.sql — Faza 4.1: idempotentno izdavanje (nalaz N1)
--   Webshop (Stripe webhook, retry nakon timeouta) šalje isti zahtjev više
--   puta; bez ključa svaki bi izdao NOVI fiskalni račun s novim brojem.
--   * vanjska_referenca: klijentov ključ (polje vanjskaReferenca ili zaglavlje
--     Idempotency-Key), jedinstven po tenantu;
--   * zahtjev_hash: SHA-256 kanoničkog JSON-a tijela BEZ reference — isti
--     ključ + isti hash = ponovljeni zahtjev (200), drugi hash = sukob (409).
--   Utrka dva istodobna zahtjeva: drugi INSERT padne na UNIQUE i cijeli batch
--   (uključujući sekvenca+1) se vrati unatrag, pa u slijedu nema rupe.
-- =========================================================

ALTER TABLE racun ADD COLUMN vanjska_referenca TEXT;
ALTER TABLE racun ADD COLUMN zahtjev_hash TEXT;

CREATE UNIQUE INDEX ux_racun_vanjska_referenca ON racun(tenant_id, vanjska_referenca)
  WHERE vanjska_referenca IS NOT NULL;
