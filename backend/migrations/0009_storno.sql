-- =========================================================
-- 0009_storno.sql — Faza 4.3: storno fiskalnog računa (nalaz N6)
--   Aplikacija validira storno prije trošenja broja (jasne poruke); trigger je
--   mreža ispod nje za UTRKU dva istodobna storna istog originala: RAISE(ABORT)
--   vraća cijeli batch izdavanja (i sekvenca+1), pa u slijedu nema rupe.
--   Iznosi su decimalni stringovi → uspoređuju se u centima.
--   Puni storno (zbroj storna = −iznos originala) prebacuje original u
--   'storniran'; bez JIR-a takav original i dalje ide u naknadnu dostavu.
-- =========================================================

CREATE TRIGGER tr_storno_provjera BEFORE INSERT ON racun
WHEN NEW.storno_racun_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'STORNO: original je već storniran')
   WHERE (SELECT status FROM racun WHERE id = NEW.storno_racun_id) = 'storniran';
  SELECT RAISE(ABORT, 'STORNO: zbroj storna premašuje iznos originala')
   WHERE (SELECT CAST(ROUND(CAST(o.iznos_s_pdv AS REAL) * 100) AS INTEGER) FROM racun o WHERE o.id = NEW.storno_racun_id)
       < -(COALESCE((SELECT SUM(CAST(ROUND(CAST(s.iznos_s_pdv AS REAL) * 100) AS INTEGER))
                       FROM racun s WHERE s.storno_racun_id = NEW.storno_racun_id AND s.status <> 'nacrt'), 0)
           + CAST(ROUND(CAST(NEW.iznos_s_pdv AS REAL) * 100) AS INTEGER));
END;

CREATE TRIGGER tr_storno_puni AFTER INSERT ON racun
WHEN NEW.storno_racun_id IS NOT NULL AND NEW.status <> 'nacrt'
BEGIN
  UPDATE racun SET status = 'storniran', updated_at = datetime('now')
   WHERE id = NEW.storno_racun_id
     AND CAST(ROUND(CAST(iznos_s_pdv AS REAL) * 100) AS INTEGER)
       = -(SELECT SUM(CAST(ROUND(CAST(s.iznos_s_pdv AS REAL) * 100) AS INTEGER))
             FROM racun s WHERE s.storno_racun_id = NEW.storno_racun_id AND s.status <> 'nacrt');
END;

CREATE INDEX ix_racun_storno ON racun(storno_racun_id) WHERE storno_racun_id IS NOT NULL;

-- Sweep/alarmi od sada gledaju status IN ('izdano','storniran') bez JIR-a.
DROP INDEX IF EXISTS ix_racun_sweep;
CREATE INDEX ix_racun_sweep ON racun(fiskal_zadnji_pokusaj, tenant_id)
  WHERE tip_dokumenta = 'fiskalni_b2c' AND status IN ('izdano', 'storniran') AND jir IS NULL;
