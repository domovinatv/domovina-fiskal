// WebAuthn ceremonije customer dashboarda preko @simplewebauthn/server. Preneseno iz
// ~/git/logomedo/logomedo.com src/lib/admin/passkey.ts i src/admin/auth/passkey.ts —
// sigurnosnu logiku držati u skladu. Ključevi su u korisnik_passkeys, odvojeno od
// admin_passkeys (docs/passkey/decisions.md, odluka 5).
//
// rpID i origin izvode se iz URL-a zahtjeva: ključ upisan na localhostu ne otvara
// produkciju, a TEST ključ ne otvara PROD.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { consumeChallenge, storeChallenge, type AppAuthEnv } from './sesija';

const RP_NAME = 'DOMOVINA Fiskal';
export const MAX_PASSKEYS_PO_KORISNIKU = 5;
/** Ukradeni kolačić ne smije postati trajni passkey: dodavanje traži svježu prijavu. */
export const PASSKEY_REAUTH_SECONDS = 10 * 60;

interface PasskeyRow { id: string; korisnik_id: number; email: string; public_key: string; counter: number; transports: string | null }

const ctx = (url: URL) => ({ rpID: url.hostname, origin: url.origin });
const transports = (t: string | null) => (t ? (t.split(',') as AuthenticatorTransport[]) : undefined);

/** Provjereni novi ključ, spreman za upis u `korisnik_passkeys` (pozivnica ga stavlja u svoj batch). */
export interface NoviPasskey { id: string; publicKey: string; counter: number; transports: string | null }

/** Oznaka ključa kako se upisuje (najviše 80 znakova, prazna → „passkey”). */
export const oznakaKljuca = (label: string) => label.trim().slice(0, 80) || 'passkey';

/** Za koga je upis: prijavljeni korisnik ('register') ili pozivnica ('poziv'). */
export type Upis =
  | { purpose: 'register'; korisnikId: number; email: string }
  | { purpose: 'poziv'; pozivId: number; email: string };

export async function registrationOptions(env: AppAuthEnv, url: URL, upis: Upis) {
  const existing = await env.DB.prepare(
    `SELECT kp.id, kp.transports FROM korisnik_passkeys kp JOIN korisnik k ON k.id = kp.korisnik_id WHERE k.email = ?`,
  )
    .bind(upis.email)
    .all<{ id: string; transports: string | null }>();
  const userID = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(upis.email)));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: ctx(url).rpID,
    userName: upis.email,
    userID,
    attestationType: 'none',
    excludeCredentials: existing.results.map((k) => ({ id: k.id, transports: transports(k.transports) })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  // Preferiraj ovo računalo pa mobitel (QR) prije USB ključa. Samo hint, ne
  // authenticatorAttachment: „platform” bi isključio mobitel. Bez toga Chrome na Windowsu
  // bez Hello PIN-a odmah traži USB ključ (logomedo docs/admin.md, 23. 11. 2026.).
  options.hints = ['client-device', 'hybrid'];
  await storeChallenge(env, options.challenge, upis.purpose,
    upis.purpose === 'register' ? { korisnikId: upis.korisnikId } : { pozivId: upis.pozivId });
  return options;
}

/**
 * WebAuthn provjera upisa, bez upisa u bazu. Izazov se troši pri provjeri i mora imati istu
 * namjenu i istu vezu (korisnik ili pozivnica) kao `upis`.
 */
export async function provjeriRegistraciju(
  env: AppAuthEnv,
  url: URL,
  upis: Upis,
  response: RegistrationResponseJSON,
): Promise<NoviPasskey | null> {
  const { rpID, origin } = ctx(url);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: async (c) => {
      const v = await consumeChallenge(env, c, upis.purpose);
      if (!v) return false;
      return upis.purpose === 'register' ? v.korisnikId === upis.korisnikId : v.pozivId === upis.pozivId;
    },
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) return null;
  const { credential } = result.registrationInfo;
  return {
    id: credential.id, publicKey: isoBase64URL.fromBuffer(credential.publicKey), counter: credential.counter,
    transports: credential.transports?.join(',') ?? null,
  };
}

/** Razlog odbijanja dodavanja passkeya prijavljenom korisniku, ili null. */
export async function registerRefusal(
  env: AppAuthEnv,
  s: { korisnikId: number; createdAt: string },
  sada = new Date(),
): Promise<string | null> {
  const age = (sada.getTime() - Date.parse(s.createdAt)) / 1000;
  if (!(age <= PASSKEY_REAUTH_SECONDS)) {
    return 'Za dodavanje passkeya prijava mora biti svježa (< 10 min): odjavi se i prijavi ponovno.';
  }
  if ((await brojKljuceva(env, s.korisnikId)) >= MAX_PASSKEYS_PO_KORISNIKU) {
    return `Najviše ${MAX_PASSKEYS_PO_KORISNIKU} passkeya po korisniku — obriši stari pa dodaj novi.`;
  }
  return null;
}

/**
 * Prijavljeni korisnik dodaje passkey (svježa sesija). Upis je uvjetovan brojem ključeva u istoj
 * naredbi, pa ni dva istodobna zahtjeva ne prijeđu granicu.
 */
export async function dodajPasskey(
  env: AppAuthEnv,
  url: URL,
  s: { korisnikId: number; email: string },
  response: RegistrationResponseJSON,
  label: string,
  sada = new Date(),
): Promise<boolean> {
  const k = await provjeriRegistraciju(env, url, { purpose: 'register', korisnikId: s.korisnikId, email: s.email }, response);
  if (!k) return false;
  const r = await env.DB.prepare(
    `INSERT INTO korisnik_passkeys (id, korisnik_id, public_key, counter, transports, label, created_at)
     SELECT ?, k.id, ?, ?, ?, ?, ? FROM korisnik k
     WHERE k.id = ? AND k.aktivan = 1
       AND (SELECT COUNT(*) FROM korisnik_passkeys WHERE korisnik_id = k.id) < ${MAX_PASSKEYS_PO_KORISNIKU}`,
  )
    .bind(k.id, k.publicKey, k.counter, k.transports, oznakaKljuca(label), sada.toISOString(), s.korisnikId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function loginOptions(env: AppAuthEnv, url: URL) {
  const options = await generateAuthenticationOptions({
    rpID: ctx(url).rpID,
    userVerification: 'required',
    allowCredentials: [], // discoverable: autentifikator sam ponudi ključ za ovu domenu
  });
  await storeChallenge(env, options.challenge, 'login');
  return options;
}

/**
 * Vraća vlasnika ključa ili null. Ključ deaktiviranog korisnika odbija se prije WebAuthn
 * provjere. Poruke greške namjerno ne razlikuju razloge.
 */
export async function verifyLogin(
  env: AppAuthEnv,
  url: URL,
  response: AuthenticationResponseJSON,
  sada = new Date(),
): Promise<{ korisnikId: number; email: string } | null> {
  const key = await env.DB.prepare(
    `SELECT kp.id, kp.korisnik_id, k.email, kp.public_key, kp.counter, kp.transports
     FROM korisnik_passkeys kp JOIN korisnik k ON k.id = kp.korisnik_id
     WHERE kp.id = ? AND k.aktivan = 1`,
  )
    .bind(response.id)
    .first<PasskeyRow>();
  if (!key) return null;

  const { rpID, origin } = ctx(url);
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: async (c) => (await consumeChallenge(env, c, 'login')) !== null,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: key.id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: key.counter, transports: transports(key.transports) },
  }).catch(() => null);
  if (!result?.verified) return null;

  await env.DB.prepare('UPDATE korisnik_passkeys SET counter = ?, last_used_at = ? WHERE id = ?')
    .bind(result.authenticationInfo.newCounter, sada.toISOString(), key.id)
    .run();
  return { korisnikId: key.korisnik_id, email: key.email };
}

export async function brojKljuceva(env: AppAuthEnv, korisnikId: number): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM korisnik_passkeys WHERE korisnik_id = ?').bind(korisnikId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function mojiKljucevi(env: AppAuthEnv, korisnikId: number) {
  return (await env.DB.prepare(
    'SELECT id, label, created_at, last_used_at FROM korisnik_passkeys WHERE korisnik_id = ? ORDER BY created_at',
  ).bind(korisnikId).all<{ id: string; label: string; created_at: string; last_used_at: string | null }>()).results;
}

/** Briše ključ samo ako je vlasnik `korisnikId`; tuđi id ne radi ništa. */
export async function obrisiKljuc(env: AppAuthEnv, id: string, korisnikId: number): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM korisnik_passkeys WHERE id = ? AND korisnik_id = ?').bind(id, korisnikId).run();
  return (r.meta.changes ?? 0) > 0;
}
