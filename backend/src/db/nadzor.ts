// D1 pristupni sloj — Stanje sustava (sweep, CIS echo), alarmi i brojači za health/admin.
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).



// ── Stanje sustava (zadnji sweep, CIS echo) i nadzor ──

export async function postaviStanje(db: D1Database, kljuc: string, vrijednost: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sustav_stanje (kljuc, vrijednost, azurirano) VALUES (?, ?, datetime('now'))
       ON CONFLICT (kljuc) DO UPDATE SET vrijednost = excluded.vrijednost, azurirano = excluded.azurirano`,
    )
    .bind(kljuc, vrijednost)
    .run();
}

export async function dohvatiStanje(db: D1Database): Promise<Record<string, { vrijednost: string | null; azurirano: string }>> {
  const r = await db.prepare(`SELECT kljuc, vrijednost, azurirano FROM sustav_stanje`).all<{ kljuc: string; vrijednost: string | null; azurirano: string }>();
  return Object.fromEntries(r.results.map((s) => [s.kljuc, { vrijednost: s.vrijednost, azurirano: s.azurirano }]));
}

// ───────────────────────── Alarmi (Faza 4.2) ─────────────────────────

export interface AlarmRow {
  kljuc: string;
  tenant_id: number | null;
  poruka: string;
  prvi_put: string;
  zadnje_slanje: string;
  broj_slanja: number;
}

// Alarmi poslani u zadnjih `dana` dana — admin naslovnica.
export async function listAlarmi(db: D1Database, dana = 7): Promise<AlarmRow[]> {
  const r = await db
    .prepare(`SELECT * FROM alarm WHERE zadnje_slanje >= datetime('now', ?) ORDER BY zadnje_slanje DESC LIMIT 50`)
    .bind(`-${dana} days`)
    .all<AlarmRow>();
  return r.results;
}
