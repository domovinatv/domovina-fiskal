-- =========================================================
-- 0004_fiskalizacija.sql — Faza 2: B2C fiskalizacija 1.0 (ZKI/JIR, CIS)
--   * certifikat: P12 se od sada PARSIRA pri uploadu (uz lozinku) — privatni
--     ključ (PKCS8 PEM) sprema se enkriptiran istim DEK-om kao P12 (drugi IV),
--     javni cert kao plaintext PEM (nije tajna; treba za KeyInfo/X509Data).
--   * racun: operativna polja fiskalizacije (naknadna dostava po čl. 21. st. 2.
--     NN 89/2025 — rok DVA RADNA DANA; retry s novim IdPoruke, isti ZKI) +
--     interna veza storna na original (docs/knowledge/10-* §2.3 — CIS je ne pamti).
-- =========================================================

-- 1) CERTIFIKAT — izvučeni materijal za potpisivanje
ALTER TABLE certifikat ADD COLUMN kljuc_pem_encrypted BLOB; -- PKCS8 PEM, AES-256-GCM (isti DEK, zaseban IV)
ALTER TABLE certifikat ADD COLUMN kljuc_iv TEXT;            -- IV enkripcije ključa (hex)
ALTER TABLE certifikat ADD COLUMN cert_pem TEXT;            -- javni (leaf) certifikat, PEM plaintext
ALTER TABLE certifikat ADD COLUMN cert_issuer TEXT;         -- Issuer DN (za X509IssuerSerial)
ALTER TABLE certifikat ADD COLUMN cert_serial_dec TEXT;     -- serijski broj DECIMALNO (X509SerialNumber)
ALTER TABLE certifikat ADD COLUMN oib_certifikata TEXT;     -- OIB iz Subject-a (mora = tenant.oib, inače s005)

-- 2) RACUN — operativna polja fiskalizacije
ALTER TABLE racun ADD COLUMN fiskal_nak_dost INTEGER NOT NULL DEFAULT 0; -- 1 = sljedeće slanje ide s NakDost=true
ALTER TABLE racun ADD COLUMN fiskal_pokusaja INTEGER NOT NULL DEFAULT 0;
ALTER TABLE racun ADD COLUMN fiskal_zadnji_pokusaj TEXT;
ALTER TABLE racun ADD COLUMN fiskal_greska TEXT;             -- zadnja greška (sNNN + poruka ili transport)
ALTER TABLE racun ADD COLUMN storno_racun_id INTEGER REFERENCES racun(id);

-- Sweep naknadne dostave: izdani fiskalni računi bez JIR-a.
CREATE INDEX ix_racun_ceka_jir ON racun(tenant_id, id)
  WHERE tip_dokumenta = 'fiskalni_b2c' AND status = 'izdano' AND jir IS NULL;
