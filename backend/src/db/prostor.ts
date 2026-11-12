// D1 pristupni sloj — Poslovni prostor, naplatni uređaj i operater.
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).

import type {
  NaplatniUredajRow,
  OperaterRow,
  PoslovniProstorRow,
} from '../types';

// ───────────────────────── Poslovni prostor / uređaj / operater ─────────────────────────

export async function createPoslovniProstor(
  db: D1Database,
  tenantId: number,
  p: { oznaka: string; adrUlica?: string | null; adrNaselje?: string | null; datumPocetkaPrimjene: string },
): Promise<PoslovniProstorRow> {
  const row = await db
    .prepare(
      `INSERT INTO poslovni_prostor (tenant_id, oznaka, adr_ulica, adr_naselje, datum_pocetka_primjene)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(tenantId, p.oznaka, p.adrUlica ?? null, p.adrNaselje ?? null, p.datumPocetkaPrimjene)
    .first<PoslovniProstorRow>();
  if (!row) throw new Error('INSERT poslovni_prostor nije vratio redak');
  return row;
}

export async function listPoslovniProstori(db: D1Database, tenantId: number): Promise<PoslovniProstorRow[]> {
  const r = await db
    .prepare(`SELECT * FROM poslovni_prostor WHERE tenant_id = ? ORDER BY oznaka`)
    .bind(tenantId)
    .all<PoslovniProstorRow>();
  return r.results;
}

export async function getPoslovniProstorByOznaka(
  db: D1Database,
  tenantId: number,
  oznaka: string,
): Promise<PoslovniProstorRow | null> {
  return db
    .prepare(`SELECT * FROM poslovni_prostor WHERE tenant_id = ? AND oznaka = ?`)
    .bind(tenantId, oznaka)
    .first<PoslovniProstorRow>();
}

export async function createNaplatniUredaj(
  db: D1Database,
  poslovniProstorId: number,
  u: { oznaka: string; opis?: string | null },
): Promise<NaplatniUredajRow> {
  const row = await db
    .prepare(`INSERT INTO naplatni_uredaj (poslovni_prostor_id, oznaka, opis) VALUES (?, ?, ?) RETURNING *`)
    .bind(poslovniProstorId, u.oznaka, u.opis ?? null)
    .first<NaplatniUredajRow>();
  if (!row) throw new Error('INSERT naplatni_uredaj nije vratio redak');
  return row;
}

export async function listNaplatniUredjaji(db: D1Database, tenantId: number): Promise<(NaplatniUredajRow & { pp_oznaka: string })[]> {
  const r = await db
    .prepare(
      `SELECT u.*, p.oznaka AS pp_oznaka
       FROM naplatni_uredaj u JOIN poslovni_prostor p ON p.id = u.poslovni_prostor_id
       WHERE p.tenant_id = ? ORDER BY p.oznaka, u.oznaka`,
    )
    .bind(tenantId)
    .all<NaplatniUredajRow & { pp_oznaka: string }>();
  return r.results;
}

export async function getNaplatniUredajByOznaka(
  db: D1Database,
  poslovniProstorId: number,
  oznaka: string,
): Promise<NaplatniUredajRow | null> {
  return db
    .prepare(`SELECT * FROM naplatni_uredaj WHERE poslovni_prostor_id = ? AND oznaka = ?`)
    .bind(poslovniProstorId, oznaka)
    .first<NaplatniUredajRow>();
}

export async function createOperater(
  db: D1Database,
  tenantId: number,
  o: { oibOperatera: string; ime?: string | null },
): Promise<OperaterRow> {
  const row = await db
    .prepare(`INSERT INTO operater (tenant_id, oib_operatera, ime) VALUES (?, ?, ?) RETURNING *`)
    .bind(tenantId, o.oibOperatera, o.ime ?? null)
    .first<OperaterRow>();
  if (!row) throw new Error('INSERT operater nije vratio redak');
  return row;
}

export async function listOperateri(db: D1Database, tenantId: number): Promise<OperaterRow[]> {
  const r = await db
    .prepare(`SELECT * FROM operater WHERE tenant_id = ? ORDER BY id`)
    .bind(tenantId)
    .all<OperaterRow>();
  return r.results;
}

export async function getOperaterByOib(db: D1Database, tenantId: number, oib: string): Promise<OperaterRow | null> {
  return db
    .prepare(`SELECT * FROM operater WHERE tenant_id = ? AND oib_operatera = ?`)
    .bind(tenantId, oib)
    .first<OperaterRow>();
}

// Deaktivacije (Faza 4.5). Prostor nema `aktivan` — zatvara se datumom
// zatvaranja (kreirajDokument ga odbija); uređaj i operater imaju `aktivan`.
export async function setProstorZatvoren(db: D1Database, tenantId: number, prostorId: number, zatvoren: boolean): Promise<void> {
  await db
    .prepare(`UPDATE poslovni_prostor SET datum_zatvaranja = CASE WHEN ? THEN date('now') ELSE NULL END WHERE id = ? AND tenant_id = ?`)
    .bind(zatvoren ? 1 : 0, prostorId, tenantId)
    .run();
}

export async function setUredajAktivan(db: D1Database, tenantId: number, uredajId: number, aktivan: boolean): Promise<void> {
  await db
    .prepare(
      `UPDATE naplatni_uredaj SET aktivan = ?
       WHERE id = ? AND poslovni_prostor_id IN (SELECT id FROM poslovni_prostor WHERE tenant_id = ?)`,
    )
    .bind(aktivan ? 1 : 0, uredajId, tenantId)
    .run();
}

export async function setOperaterAktivan(db: D1Database, tenantId: number, operaterId: number, aktivan: boolean): Promise<void> {
  await db.prepare(`UPDATE operater SET aktivan = ? WHERE id = ? AND tenant_id = ?`).bind(aktivan ? 1 : 0, operaterId, tenantId).run();
}

// Ručno označavanje prijave poslovnog prostora: od 01.07.2017. prijava/odjava
// prostora ide isključivo kroz ePoreznu (SOAP ProstorZahtjev je ukinut iz sheme),
// pa CIS status ovdje evidentira admin nakon prijave u ePoreznoj.
export async function setProstorCisStatus(
  db: D1Database,
  tenantId: number,
  prostorId: number,
  status: 'neposlano' | 'prijavljen',
): Promise<void> {
  await db
    .prepare(
      `UPDATE poslovni_prostor SET cis_status = ?, cis_prijava_ts = CASE WHEN ? = 'prijavljen' THEN datetime('now') ELSE NULL END
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(status, status, prostorId, tenantId)
    .run();
}
