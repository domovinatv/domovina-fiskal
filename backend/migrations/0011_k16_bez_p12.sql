-- 0011: K16 — šifrirani P12 se više ne čuva.
--
-- pkcs12_encrypted (cijela P12 datoteka, AES-256-GCM pod DEK-om) i njegov IV
-- enc_iv kod nikad nije čitao: potpis ide iz kljuc_pem_encrypted (0004), a P12
-- se bez lozinke (koja se ne sprema) ionako ne može otvoriti. Brisanjem nestaje
-- jedna kopija certifikata u bazi. Vidi docs/knowledge/21-pohrana-certifikata.md.
--
-- Redoslijed deploya: kod koji više ne upisuje te stupce i ova migracija idu
-- ZAJEDNO (stari kod INSERT-a pkcs12_encrypted, novi ga ne bi imao NOT NULL).
-- Upload certifikata je samo u adminu, pa je prozor između dva koraka bezopasan
-- ako se u njemu ne uploada certifikat.
--
-- D1 Time Travel čuva staro stanje još 30 dana (šifrirano, KEK nije u bazi).

ALTER TABLE certifikat DROP COLUMN pkcs12_encrypted;
ALTER TABLE certifikat DROP COLUMN enc_iv;
