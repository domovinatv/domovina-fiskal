// Sesija customer dashboarda (/app). Po uzoru na src/admin/auth/sesija.ts i
// ~/git/logomedo/logomedo.com src/lib/admin/sesija.ts — sigurnosnu logiku držati u skladu.
// Tablice su odvojene od admin_* (docs/passkey/decisions.md, odluka 5): ovaj kolačić
// nikad ne otvara /admin.
//
// Nasumičan token (32 B) u kolačiću __Host-fiskal_app, u D1 samo njegov sha-256.
// Sesija traje 12 h i završava nakon 2 h neaktivnosti (odluka 8). Pri svakom zahtjevu
// provjerava se i da je korisnik još aktivan; deaktivacija uz to briše sve sesije
// (obrisiSveSesije), pa pristup prestaje odmah.
import type { Env } from '../types';
import { sha256Hex } from '../util';

export const SESSION_COOKIE = '__Host-fiskal_app';
export const SESSION_TTL_SECONDS = 12 * 3600;
export const SESSION_IDLE_SECONDS = 2 * 3600;
const LAST_SEEN_RESOLUTION_SECONDS = 300;
const CHALLENGE_TTL_SECONDS = 300;

export type AppAuthEnv = Pick<Env, 'DB'>;
export type SessionMethod = 'passkey' | 'poziv';
export type ChallengePurpose = 'login' | 'register' | 'poziv';

export interface AppSession {
  korisnikId: number;
  email: string;
  ime: string | null;
  method: SessionMethod;
  createdAt: string;
  expiresAt: string;
}

/** 32 nasumična bajta u base64url (43 znaka). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Lax kao admin: CSRF štiti provjera Origin zaglavlja na svakoj mutaciji (S2). */
export function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const odjavaCookie = () => sessionCookie('', 0);

export async function createSession(
  env: AppAuthEnv,
  korisnikId: number,
  method: SessionMethod,
  userAgent: string | null,
  sada = new Date(),
): Promise<string> {
  const token = randomToken();
  const expires = new Date(sada.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM korisnik_sesije WHERE expires_at < ?').bind(sada.toISOString()),
    env.DB.prepare(
      `INSERT INTO korisnik_sesije (token_hash, korisnik_id, method, created_at, expires_at, user_agent, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(await sha256Hex(token), korisnikId, method, sada.toISOString(), expires.toISOString(),
      userAgent?.slice(0, 256) ?? null, sada.toISOString()),
  ]);
  return token;
}

/** Sesija iz zaglavlja Cookie ili null (nema, istekla, neaktivna > 2 h, korisnik deaktiviran). */
export async function getSession(env: AppAuthEnv, cookieHeader: string | null | undefined, sada = new Date()): Promise<AppSession | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.korisnik_id, s.method, s.created_at, s.expires_at, s.last_seen_at, k.email, k.ime
     FROM korisnik_sesije s JOIN korisnik k ON k.id = s.korisnik_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND k.aktivan = 1`,
  )
    .bind(hash, sada.toISOString())
    .first<{ korisnik_id: number; method: SessionMethod; created_at: string; expires_at: string; last_seen_at: string | null; email: string; ime: string | null }>();
  if (!row) return null;
  const nowMs = sada.getTime();
  const lastSeenMs = Date.parse(row.last_seen_at ?? row.created_at);
  if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > SESSION_IDLE_SECONDS * 1000) return null;
  if (nowMs - lastSeenMs > LAST_SEEN_RESOLUTION_SECONDS * 1000) {
    await env.DB.prepare('UPDATE korisnik_sesije SET last_seen_at = ? WHERE token_hash = ?')
      .bind(sada.toISOString(), hash)
      .run()
      .catch(() => {});
  }
  return {
    korisnikId: row.korisnik_id, email: row.email, ime: row.ime, method: row.method,
    createdAt: row.created_at, expiresAt: row.expires_at,
  };
}

/** Odjava: redak sesije se briše (kolačić bez retka ne vrijedi ništa). */
export async function deleteSession(env: AppAuthEnv, cookieHeader: string | null | undefined): Promise<void> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM korisnik_sesije WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

/** Sve sesije korisnika (deaktivacija, izgubljen uređaj). Vraća broj obrisanih. */
export async function obrisiSveSesije(env: AppAuthEnv, korisnikId: number): Promise<number> {
  const r = await env.DB.prepare('DELETE FROM korisnik_sesije WHERE korisnik_id = ?').bind(korisnikId).run();
  return r.meta.changes ?? 0;
}

export async function storeChallenge(
  env: AppAuthEnv,
  challenge: string,
  purpose: ChallengePurpose,
  veza: { korisnikId?: number | null; pozivId?: number | null } = {},
  sada = new Date(),
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM korisnik_izazovi WHERE expires_at < ?').bind(sada.toISOString()),
    env.DB.prepare('INSERT INTO korisnik_izazovi (challenge, purpose, korisnik_id, poziv_id, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(challenge, purpose, veza.korisnikId ?? null, veza.pozivId ?? null,
        new Date(sada.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString()),
  ]);
}

/** Jednokratno: izazov se briše pri prvoj provjeri, bez obzira na ishod. */
export async function consumeChallenge(
  env: AppAuthEnv,
  challenge: string,
  purpose: ChallengePurpose,
  sada = new Date(),
): Promise<{ korisnikId: number | null; pozivId: number | null } | null> {
  const row = await env.DB.prepare('DELETE FROM korisnik_izazovi WHERE challenge = ? RETURNING purpose, korisnik_id, poziv_id, expires_at')
    .bind(challenge)
    .first<{ purpose: string; korisnik_id: number | null; poziv_id: number | null; expires_at: string }>();
  if (!row || row.purpose !== purpose || row.expires_at < sada.toISOString()) return null;
  return { korisnikId: row.korisnik_id, pozivId: row.poziv_id };
}
