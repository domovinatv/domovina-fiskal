-- =========================================================
-- 0018 — Reply-To po tenantu (uz vlastitog pošiljatelja iz 0016)
-- Adresa na koju kupci odgovaraju (npr. tenantov Gmail). Odgovori idu ravno
-- tenantu, mimo platforme — dolaznu poštu ne obrađujemo. NULL → kontakt e-mail
-- tenanta (tenant.email), a bez njega adresa pošiljatelja.
-- =========================================================
ALTER TABLE tenant_email ADD COLUMN reply_to TEXT;
