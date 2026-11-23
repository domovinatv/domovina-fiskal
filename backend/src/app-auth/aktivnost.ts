// Trag radnji nad pozivnicama i korisnicima dashboarda (migracija 0015, docs/passkey/ odluka 300).
// Bilježe se radnje administratora (/admin) i vlasnika tenanta (/api/v1/clanovi). Iskorištenje
// pozivnice nije zaseban zapis: vidi se u samoj pozivnici (iskoristena_at, passkey_id).
// Zapis ide u isti D1 batch kao radnja gdje god radnja već ide batchem (`naredba`).
import type { Env } from '../types';

export type Radnja =
  | 'poziv.izdan' | 'poziv.opozvan'
  | 'korisnik.deaktiviran' | 'korisnik.aktiviran'
  | 'clanstvo.deaktivirano' | 'clanstvo.aktivirano';

export interface Tko { email: string; tip: 'admin' | 'vlasnik' }

export interface Zapis {
  radnja: Radnja;
  email?: string | null;
  korisnikId?: number | null;
  tenantId?: number | null;
  pozivnicaId?: number | null;
  detalji?: Record<string, unknown> | null;
}

export interface AktivnostRow {
  id: number; at: string; tko: string; tko_tip: 'admin' | 'vlasnik'; radnja: Radnja;
  email: string | null; korisnik_id: number | null; tenant_id: number | null; pozivnica_id: number | null; detalji: string | null;
}

/** Naredba za batch. */
export function naredba(db: D1Database, tko: Tko, z: Zapis): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO korisnik_aktivnost (tko, tko_tip, radnja, email, korisnik_id, tenant_id, pozivnica_id, detalji)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    tko.email.trim().toLowerCase(), tko.tip, z.radnja, z.email ?? null, z.korisnikId ?? null, z.tenantId ?? null,
    z.pozivnicaId ?? null, z.detalji ? JSON.stringify(z.detalji) : null,
  );
}

export async function zabiljezi(env: Pick<Env, 'DB'>, tko: Tko, z: Zapis): Promise<void> {
  await naredba(env.DB, tko, z).run();
}

/** Zadnji zapisi (svi ili jednog tenanta), najnoviji prvi. */
export async function zadnjaAktivnost(env: Pick<Env, 'DB'>, o: { tenantId?: number; limit?: number } = {}): Promise<AktivnostRow[]> {
  const limit = Math.min(Math.max(o.limit ?? 50, 1), 500);
  const st = o.tenantId != null
    ? env.DB.prepare('SELECT * FROM korisnik_aktivnost WHERE tenant_id = ? ORDER BY id DESC LIMIT ?').bind(o.tenantId, limit)
    : env.DB.prepare('SELECT * FROM korisnik_aktivnost ORDER BY id DESC LIMIT ?').bind(limit);
  return (await st.all<AktivnostRow>()).results;
}
