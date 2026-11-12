// D1 pristupni sloj — doku konfiguracija (posrednik za eRačun 2.0) i evidencija slanja eRačuna.
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).

import type {
  DokuKonfigRow,
} from '../types';

// ───────────────────────── doku konfig (eRačun 2.0 posrednik) ─────────────────────────

// Tajni materijal za dešifriranje tokena (nikad ne napušta poslužitelj kao plaintext).
export interface DokuKonfigMaterijal {
  token_encrypted: string;
  enc_iv: string;
  dek_wrapped: string;
  dek_iv: string;
}

// Puni red za slanje (uklj. šifrirani token). Koristi orkestracija.
export async function getDokuKonfig(
  db: D1Database,
  tenantId: number,
  okolina: 'test' | 'prod',
): Promise<(DokuKonfigRow & DokuKonfigMaterijal) | null> {
  return db
    .prepare(
      `SELECT id, tenant_id, okolina, token_prefiks, ams_registriran, aktivan, created_at, updated_at,
              token_encrypted, enc_iv, dek_wrapped, dek_iv
       FROM doku_konfig WHERE tenant_id = ? AND okolina = ? AND aktivan = 1`,
    )
    .bind(tenantId, okolina)
    .first<(DokuKonfigRow & DokuKonfigMaterijal)>();
}

// Javni redovi (bez tajni) — za admin prikaz.
export async function listDokuKonfig(db: D1Database, tenantId: number): Promise<DokuKonfigRow[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id, okolina, token_prefiks, ams_registriran, aktivan, created_at, updated_at
       FROM doku_konfig WHERE tenant_id = ? ORDER BY okolina`,
    )
    .bind(tenantId)
    .all<DokuKonfigRow>();
  return r.results;
}

export interface NoviDokuKonfig {
  okolina: 'test' | 'prod';
  tokenEncrypted: string;
  encKeyId: string;
  encIv: string;
  dekWrapped: string;
  dekIv: string;
  tokenPrefiks: string | null;
}

// Upsert po (tenant, okolina) — zamjena tokena ne ostavlja stari plaintext.
export async function upsertDokuKonfig(db: D1Database, tenantId: number, k: NoviDokuKonfig): Promise<void> {
  await db
    .prepare(
      `INSERT INTO doku_konfig (tenant_id, okolina, token_encrypted, enc_key_id, enc_iv, dek_wrapped, dek_iv, token_prefiks, aktivan, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
       ON CONFLICT (tenant_id, okolina) DO UPDATE SET
         token_encrypted = excluded.token_encrypted,
         enc_key_id = excluded.enc_key_id,
         enc_iv = excluded.enc_iv,
         dek_wrapped = excluded.dek_wrapped,
         dek_iv = excluded.dek_iv,
         token_prefiks = excluded.token_prefiks,
         aktivan = 1,
         updated_at = datetime('now')`,
    )
    .bind(tenantId, k.okolina, k.tokenEncrypted, k.encKeyId, k.encIv, k.dekWrapped, k.dekIv, k.tokenPrefiks)
    .run();
}

export async function setDokuAmsRegistriran(db: D1Database, tenantId: number, okolina: 'test' | 'prod', v: boolean): Promise<void> {
  await db
    .prepare(`UPDATE doku_konfig SET ams_registriran = ?, updated_at = datetime('now') WHERE tenant_id = ? AND okolina = ?`)
    .bind(v ? 1 : 0, tenantId, okolina)
    .run();
}

// Uspješno predan doku-u: zapiši doku_id + status razmjene (+ opcionalni block).
export async function zapisiEracunSlanje(
  db: D1Database,
  tenantId: number,
  racunId: number,
  p: { dokuId: number; status: string | null; deliveryBlock: string | null; noviStatusRacuna: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET doku_id = ?, eracun_status = ?, eracun_delivery_block = ?, eracun_greska = NULL,
              eracun_zadnja_provjera = datetime('now'), status = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(p.dokuId, p.status, p.deliveryBlock, p.noviStatusRacuna, racunId, tenantId)
    .run();
}

export async function zapisiEracunStatus(
  db: D1Database,
  tenantId: number,
  racunId: number,
  p: { status: string | null; deliveryBlock: string | null; noviStatusRacuna?: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET eracun_status = ?, eracun_delivery_block = ?, eracun_zadnja_provjera = datetime('now'),
              status = COALESCE(?, status), updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(p.status, p.deliveryBlock, p.noviStatusRacuna ?? null, racunId, tenantId)
    .run();
}

export async function zapisiEracunGresku(db: D1Database, tenantId: number, racunId: number, greska: string): Promise<void> {
  await db
    .prepare(`UPDATE racun SET eracun_greska = ?, eracun_zadnja_provjera = datetime('now'), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
    .bind(greska.slice(0, 2000), racunId, tenantId)
    .run();
}
