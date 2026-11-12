// D1 pristupni sloj — Tenant, API ključevi i korisnici dashboarda (korisnik_tenant).
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).

import type {
  ApiKljucRow,
  KorisnikTenantRow,
  TenantRow,
} from '../types';
import { genApiKljuc, sha256Hex } from '../util';

// ───────────────────────── Tenant ─────────────────────────

export interface NoviTenant {
  oib: string;
  naziv: string;
  adrUlica?: string | null;
  adrKucniBroj?: string | null;
  adrMjesto?: string | null;
  adrPostanskiBroj?: string | null;
  uSustavuPdv: boolean;
  iban?: string | null;
  oznakaSlijednosti: 'P' | 'N';
}

export async function createTenant(db: D1Database, t: NoviTenant): Promise<TenantRow> {
  const row = await db
    .prepare(
      `INSERT INTO tenant (oib, naziv, adr_ulica, adr_kucni_broj, adr_mjesto, adr_postanski_broj,
                           u_sustavu_pdv, iban, oznaka_slijednosti_def)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      t.oib,
      t.naziv,
      t.adrUlica ?? null,
      t.adrKucniBroj ?? null,
      t.adrMjesto ?? null,
      t.adrPostanskiBroj ?? null,
      t.uSustavuPdv ? 1 : 0,
      t.iban ?? null,
      t.oznakaSlijednosti,
    )
    .first<TenantRow>();
  if (!row) throw new Error('INSERT tenant nije vratio redak');
  return row;
}

export async function listTenants(db: D1Database): Promise<TenantRow[]> {
  const r = await db.prepare(`SELECT * FROM tenant ORDER BY id DESC`).all<TenantRow>();
  return r.results;
}

export async function getTenant(db: D1Database, id: number): Promise<TenantRow | null> {
  return db.prepare(`SELECT * FROM tenant WHERE id = ?`).bind(id).first<TenantRow>();
}

// Izmjena tenanta (Faza 4.5). Naziv, adresa, IBAN i e-mail su slobodni;
// u_sustavu_pdv i oznaka_slijednosti_def određuju PDV obračun i numeriranje
// već izdanih dokumenata, pa se mijenjaju SAMO dok tenant nema nijedan izdan
// dokument — uvjet je u samom UPDATE-u (bez utrke s istodobnim izdavanjem).
export interface IzmjenaTenanta {
  naziv: string;
  adrUlica: string | null;
  adrMjesto: string | null;
  adrPostanskiBroj: string | null;
  iban: string | null;
  email: string | null;
  uSustavuPdv: boolean;
  oznakaSlijednosti: 'P' | 'N';
}

export async function tenantImaIzdanihDokumenata(db: D1Database, tenantId: number): Promise<boolean> {
  const red = await db
    .prepare(`SELECT 1 AS da FROM racun WHERE tenant_id = ? AND redni_broj IS NOT NULL LIMIT 1`)
    .bind(tenantId)
    .first<{ da: number }>();
  return !!red;
}

export async function updateTenant(
  db: D1Database,
  tenantId: number,
  t: IzmjenaTenanta,
): Promise<'ok' | 'zakljucano' | 'ne_postoji'> {
  const trenutni = await getTenant(db, tenantId);
  if (!trenutni) return 'ne_postoji';
  const mijenjaZakljucano = !!trenutni.u_sustavu_pdv !== t.uSustavuPdv || trenutni.oznaka_slijednosti_def !== t.oznakaSlijednosti;
  const r = await db
    .prepare(
      `UPDATE tenant SET naziv = ?, adr_ulica = ?, adr_mjesto = ?, adr_postanski_broj = ?, iban = ?, email = ?,
              u_sustavu_pdv = ?, oznaka_slijednosti_def = ?, updated_at = datetime('now')
       WHERE id = ?
         AND (? = 0 OR NOT EXISTS (SELECT 1 FROM racun WHERE tenant_id = ? AND redni_broj IS NOT NULL))`,
    )
    .bind(
      t.naziv, t.adrUlica, t.adrMjesto, t.adrPostanskiBroj, t.iban, t.email,
      t.uSustavuPdv ? 1 : 0, t.oznakaSlijednosti, tenantId,
      mijenjaZakljucano ? 1 : 0, tenantId,
    )
    .run();
  return r.meta.changes ? 'ok' : 'zakljucano';
}

// ───────────────────────── API ključevi ─────────────────────────

// Kreira ključ i vraća SIROVI ključ — jedini trenutak u kojem postoji izvan hasha.
export async function createApiKljuc(
  db: D1Database,
  tenantId: number,
  opis: string | null,
): Promise<{ rawKey: string; row: ApiKljucRow }> {
  const rawKey = genApiKljuc();
  const hash = await sha256Hex(rawKey);
  const prefiks = rawKey.slice(0, 12); // 'dfk_' + 8 hex — dovoljno za identifikaciju
  const row = await db
    .prepare(
      `INSERT INTO api_kljuc (tenant_id, prefiks, hash, opis) VALUES (?, ?, ?, ?)
       RETURNING id, tenant_id, prefiks, opis, aktivan, zadnje_koristen_at, created_at`,
    )
    .bind(tenantId, prefiks, hash, opis)
    .first<ApiKljucRow>();
  if (!row) throw new Error('INSERT api_kljuc nije vratio redak');
  return { rawKey, row };
}

export async function listApiKljucevi(db: D1Database, tenantId: number): Promise<ApiKljucRow[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id, prefiks, opis, aktivan, zadnje_koristen_at, created_at
       FROM api_kljuc WHERE tenant_id = ? ORDER BY id DESC`,
    )
    .bind(tenantId)
    .all<ApiKljucRow>();
  return r.results;
}

export async function setApiKljucAktivan(db: D1Database, tenantId: number, id: number, aktivan: boolean): Promise<void> {
  await db
    .prepare(`UPDATE api_kljuc SET aktivan = ? WHERE id = ? AND tenant_id = ?`)
    .bind(aktivan ? 1 : 0, id, tenantId)
    .run();
}

// Briše se samo DEAKTIVIRAN ključ (dvostupanjsko: prvo deaktiviraj, pa obriši).
export async function deleteApiKljuc(db: D1Database, tenantId: number, id: number): Promise<boolean> {
  const r = await db.prepare(`DELETE FROM api_kljuc WHERE id = ? AND tenant_id = ? AND aktivan = 0`).bind(id, tenantId).run();
  return r.meta.changes > 0;
}

// Bearer auth: hash sirovog ključa → aktivan ključ + aktivan tenant.
export async function findTenantByApiKeyHash(
  db: D1Database,
  hash: string,
): Promise<{ tenant: TenantRow; apiKljucId: number } | null> {
  const row = await db
    .prepare(
      `SELECT t.*, k.id AS api_kljuc_id
       FROM api_kljuc k JOIN tenant t ON t.id = k.tenant_id
       WHERE k.hash = ? AND k.aktivan = 1 AND t.status = 'active'`,
    )
    .bind(hash)
    .first<TenantRow & { api_kljuc_id: number }>();
  if (!row) return null;
  const { api_kljuc_id, ...tenant } = row;
  return { tenant: tenant as TenantRow, apiKljucId: api_kljuc_id };
}

export async function touchApiKljuc(db: D1Database, id: number): Promise<void> {
  await db.prepare(`UPDATE api_kljuc SET zadnje_koristen_at = datetime('now') WHERE id = ?`).bind(id).run();
}

// ───────────────────────── Dashboard korisnici (korisnik_tenant) ─────────────────────────
// Identitet je u GoTrue-u; ovdje je SAMO autorizacija (membership + uloga).

// Membership za JEDAN tenant: match po user_id (stabilan) ili — dok user_id još
// nije vezan — po verificiranom emailu iz JWT-a (bootstrap na prvoj prijavi).
export async function findKorisnikTenant(
  db: D1Database,
  tenantId: number,
  userId: string,
  email: string,
): Promise<KorisnikTenantRow | null> {
  return db
    .prepare(
      `SELECT * FROM korisnik_tenant
       WHERE tenant_id = ? AND aktivan = 1
         AND (user_id = ? OR (user_id IS NULL AND lower(user_email) = lower(?)))`,
    )
    .bind(tenantId, userId, email)
    .first<KorisnikTenantRow>();
}

// Veže GoTrue sub na redak dodan po emailu (prva prijava) — od tada match ide po user_id.
export async function bindKorisnikTenant(db: D1Database, id: number, userId: string): Promise<void> {
  await db
    .prepare(`UPDATE korisnik_tenant SET user_id = ?, bound_at = datetime('now') WHERE id = ? AND user_id IS NULL`)
    .bind(userId, id)
    .run();
}

// Svi membershipi korisnika (za dropdown tenant-switch) — samo aktivni tenanti.
export async function listMojiTenanti(
  db: D1Database,
  userId: string,
  email: string,
): Promise<{ tenantId: number; oib: string; naziv: string; uloga: string }[]> {
  const r = await db
    .prepare(
      `SELECT t.id AS tenantId, t.oib, t.naziv, kt.uloga
       FROM korisnik_tenant kt JOIN tenant t ON t.id = kt.tenant_id
       WHERE kt.aktivan = 1 AND t.status = 'active'
         AND (kt.user_id = ? OR (kt.user_id IS NULL AND lower(kt.user_email) = lower(?)))
       ORDER BY t.naziv`,
    )
    .bind(userId, email)
    .all<{ tenantId: number; oib: string; naziv: string; uloga: string }>();
  return r.results;
}

export async function listKorisniciTenanta(db: D1Database, tenantId: number): Promise<KorisnikTenantRow[]> {
  const r = await db
    .prepare(`SELECT * FROM korisnik_tenant WHERE tenant_id = ? ORDER BY id`)
    .bind(tenantId)
    .all<KorisnikTenantRow>();
  return r.results;
}

export async function createKorisnikTenant(
  db: D1Database,
  tenantId: number,
  k: { userEmail: string; uloga: 'vlasnik' | 'knjigovodja' | 'operater' },
): Promise<KorisnikTenantRow> {
  const row = await db
    .prepare(`INSERT INTO korisnik_tenant (tenant_id, user_email, uloga) VALUES (?, ?, ?) RETURNING *`)
    .bind(tenantId, k.userEmail, k.uloga)
    .first<KorisnikTenantRow>();
  if (!row) throw new Error('INSERT korisnik_tenant nije vratio redak');
  return row;
}

export async function setKorisnikTenantAktivan(db: D1Database, tenantId: number, id: number, aktivan: boolean): Promise<void> {
  await db
    .prepare(`UPDATE korisnik_tenant SET aktivan = ? WHERE id = ? AND tenant_id = ?`)
    .bind(aktivan ? 1 : 0, id, tenantId)
    .run();
}
