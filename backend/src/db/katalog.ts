// D1 pristupni sloj — Katalog proizvoda i KPD 2025 šifrarnik.
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).



// ───────────────────────── Proizvodi (katalog s KPD 2025) ─────────────────────────

export interface ProizvodRow {
  id: number;
  tenant_id: number;
  naziv: string;
  sifra: string | null;
  jedinica_mjere: string;
  neto_cijena: string;
  pdv_stopa: string;
  pdv_kategorija: string;
  kpd: string;
  opis: string | null;
  aktivan: number;
  created_at: string;
}

export async function createProizvod(
  db: D1Database,
  tenantId: number,
  p: {
    naziv: string;
    sifra?: string | null;
    jedinicaMjere: string;
    netoCijena: string;
    pdvStopa: string;
    pdvKategorija: string;
    kpd: string;
    opis?: string | null;
  },
): Promise<ProizvodRow> {
  const row = await db
    .prepare(
      `INSERT INTO proizvod (tenant_id, naziv, sifra, jedinica_mjere, neto_cijena,
                             pdv_stopa, pdv_kategorija, kpd, opis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(tenantId, p.naziv, p.sifra ?? null, p.jedinicaMjere, p.netoCijena,
          p.pdvStopa, p.pdvKategorija, p.kpd, p.opis ?? null)
    .first<ProizvodRow>();
  if (!row) throw new Error('INSERT proizvod nije vratio redak');
  return row;
}

export async function listProizvodi(db: D1Database, tenantId: number): Promise<ProizvodRow[]> {
  const r = await db
    .prepare(`SELECT * FROM proizvod WHERE tenant_id = ? ORDER BY naziv`)
    .bind(tenantId)
    .all<ProizvodRow>();
  return r.results;
}

export async function getProizvod(db: D1Database, tenantId: number, id: number): Promise<ProizvodRow | null> {
  return db.prepare(`SELECT * FROM proizvod WHERE id = ? AND tenant_id = ? AND aktivan = 1`).bind(id, tenantId).first<ProizvodRow>();
}

// ───────────────────────── KPD 2025 šifrarnik ─────────────────────────

export interface KpdRow {
  sifra: string;
  naziv: string;
}

// Pretraga po šifri (s točkama ili bez) ILI nazivu; za KPD picker u adminu.
export async function searchKpd(db: D1Database, upit: string, limit = 20): Promise<KpdRow[]> {
  const q = upit.trim();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const bezTocaka = `%${q.replace(/[^0-9]/g, '')}%`;
  const r = await db
    .prepare(
      `SELECT sifra, naziv FROM kpd_sifrarnik
       WHERE naziv LIKE ?1 COLLATE NOCASE
          OR sifra LIKE ?1
          OR (?2 <> '%%' AND replace(sifra, '.', '') LIKE ?2)
       ORDER BY sifra LIMIT ?3`,
    )
    .bind(like, bezTocaka, Math.min(Math.max(limit, 1), 100))
    .all<KpdRow>();
  return r.results;
}

export async function getKpd(db: D1Database, sifra: string): Promise<KpdRow | null> {
  return db.prepare(`SELECT sifra, naziv FROM kpd_sifrarnik WHERE sifra = ?`).bind(sifra).first<KpdRow>();
}
