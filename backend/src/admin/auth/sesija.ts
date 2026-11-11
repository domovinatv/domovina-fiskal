// Admin sesija. Preneseno iz ~/git/logomedo/logomedo.com src/lib/admin/sesija.ts
// (tamo iz omm.domovina.ai i pay.domovina.ai) — sigurnosnu logiku držati u skladu.
// Razlika: `env` dolazi iz Hono konteksta (c.env), ne iz `cloudflare:workers`.
//
// Nasumičan token u kolačiću, u D1 samo njegov sha-256. Pri svakom zahtjevu provjerava
// se i da je e-mail još u ADMIN_EMAILS, pa micanje iz popisa oduzima pristup odmah.
import type { Env } from '../../types';

export const SESSION_COOKIE = '__Host-fiskal_admin';
export const SESSION_TTL_SECONDS = 12 * 3600;
const CHALLENGE_TTL_SECONDS = 300;
/** Sesija koju nitko nije koristio toliko dugo je gotova, bez obzira na istek. */
export const SESSION_IDLE_SECONDS = 2 * 3600;
const LAST_SEEN_RESOLUTION_SECONDS = 300;

export type SessionMethod = 'passkey' | 'access';
export interface Session {
  email: string;
  method: SessionMethod;
  expiresAt: string;
  /** Kad je prijava bila; dodavanje passkeya traži svježu. */
  createdAt: string;
}

type AuthEnv = Pick<Env, 'DB' | 'ADMIN_EMAILS' | 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>;

/** E-mailovi koji smiju u admin. Provjerava se pri svakom zahtjevu. */
export function adminEmails(env: AuthEnv): Set<string> {
  return new Set((env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export const accessConfigured = (env: AuthEnv) => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

export async function sha256Hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
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

export function sessionCookie(token: string, maxAge: number): string {
  // Lax, ne Strict: povratak s Access prijave je navigacija s druge domene.
  // CSRF štiti provjera Origin zaglavlja na svakom POST-u (middleware u admin/app.ts).
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function createSession(env: AuthEnv, email: string, method: SessionMethod, userAgent: string | null): Promise<string> {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now.toISOString()),
    env.DB.prepare(
      `INSERT INTO admin_sessions (token_hash, email, method, created_at, expires_at, user_agent, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(await sha256Hex(token), email, method, now.toISOString(), expires.toISOString(),
      userAgent?.slice(0, 256) ?? null, now.toISOString()),
  ]);
  return token;
}

export async function getSession(env: AuthEnv, cookieHeader: string | null | undefined): Promise<Session | null> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT email, method, created_at, expires_at, last_seen_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?',
  )
    .bind(hash, new Date().toISOString())
    .first<{ email: string; method: SessionMethod; created_at: string; expires_at: string; last_seen_at: string | null }>();
  if (!row || !adminEmails(env).has(row.email)) return null;
  const nowMs = Date.now();
  const lastSeenMs = Date.parse(row.last_seen_at ?? row.created_at);
  if (Number.isFinite(lastSeenMs) && nowMs - lastSeenMs > SESSION_IDLE_SECONDS * 1000) return null;
  if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > LAST_SEEN_RESOLUTION_SECONDS * 1000) {
    await env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?')
      .bind(new Date(nowMs).toISOString(), hash)
      .run()
      .catch(() => {});
  }
  return { email: row.email, method: row.method, expiresAt: row.expires_at, createdAt: row.created_at };
}

export async function deleteSession(env: AuthEnv, cookieHeader: string | null | undefined): Promise<void> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export async function storeChallenge(env: AuthEnv, challenge: string, purpose: 'login' | 'register', email: string | null) {
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_challenges WHERE expires_at < ?').bind(now.toISOString()),
    env.DB.prepare('INSERT INTO admin_challenges (challenge, purpose, email, expires_at) VALUES (?, ?, ?, ?)')
      .bind(challenge, purpose, email, new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString()),
  ]);
}

/** Jednokratno: izazov se briše pri prvoj provjeri, bez obzira na ishod. */
export async function consumeChallenge(
  env: AuthEnv,
  challenge: string,
  purpose: 'login' | 'register',
): Promise<{ email: string | null } | null> {
  const row = await env.DB.prepare('DELETE FROM admin_challenges WHERE challenge = ? RETURNING purpose, email, expires_at')
    .bind(challenge)
    .first<{ purpose: string; email: string | null; expires_at: string }>();
  if (!row || row.purpose !== purpose || row.expires_at < new Date().toISOString()) return null;
  return { email: row.email };
}

/** Odredište nakon prijave: samo relativna putanja unutar admina (nema otvorenog preusmjeravanja). */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/admin') && !next.startsWith('//') && !next.includes('\\') ? next : '/admin';
}

/** Nova sesija: kolačić i preusmjeravanje (Access) ili JSON (passkey). */
export async function startSession(env: AuthEnv, request: Request, email: string, method: SessionMethod, next: string, asJson = false) {
  const token = await createSession(env, email, method, request.headers.get('user-agent'));
  const cookie = sessionCookie(token, SESSION_TTL_SECONDS);
  return asJson
    ? new Response(JSON.stringify({ ok: true, next }), { headers: { 'content-type': 'application/json', 'set-cookie': cookie } })
    : new Response(null, { status: 302, headers: { location: next, 'set-cookie': cookie } });
}

/**
 * Skripte bez preglednika (scripts/dodaj-tenant.sh): `Authorization: Bearer <ADMIN_SKRIPTA_TOKEN>`.
 * Po uzoru na logomedo RUNNER_TOKEN. Bez kolačića pa bez CSRF rizika. Usporedba
 * hasheva u konstantnom vremenu (timingSafeEqual u workerd-u).
 */
export async function skriptaTokenOk(env: Pick<Env, 'ADMIN_SKRIPTA_TOKEN'>, authorization: string | null | undefined): Promise<boolean> {
  const ocekivano = env.ADMIN_SKRIPTA_TOKEN ?? '';
  if (ocekivano.length < 32 || !authorization?.startsWith('Bearer ')) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(authorization.slice(7).trim())),
    crypto.subtle.digest('SHA-256', enc.encode(ocekivano)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
