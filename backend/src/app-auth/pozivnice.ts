// Pozivnice za customer dashboard (docs/passkey/decisions.md, odluke 4, 7 i 100+).
// Preneseno iz ~/git/logomedo/logomedo.com src/lib/admin/pozivi.ts — sigurnosnu logiku
// držati u skladu. Token iz linka `/app/poziv#<token>` (32 B, base64url) vidi se samo
// jednom; u bazi je samo njegov sha-256. Vrijedi 72 h, jednokratna je i troši se tek
// uspješnim upisom passkeya, u istom D1 batchu u kojem nastaju korisnik, članstvo u
// tenantu (korisnik_tenant) i passkey. „Odustani” zato ne troši link.
//
// Dvije vrste:
//   * za tenant (tenant_id + uloga): izdaje admin (bilo koja uloga) ili vlasnik tenanta
//     (samo knjigovodja/operater; pravilo je i u CHECK-u tablice);
//   * novi passkey postojećem aktivnom korisniku (korisnik_id): samo admin.
// Nova pozivnica za isti e-mail i tenant (odnosno istog korisnika) poništava staru.
import type { Env } from '../types';
import { sha256Hex } from '../util';
import { MAX_PASSKEYS_PO_KORISNIKU, oznakaKljuca, type NoviPasskey } from './passkey';
import { randomToken } from './sesija';

type PozEnv = Pick<Env, 'DB'>;

export const POZIV_SATI = 72;
export type Uloga = 'vlasnik' | 'knjigovodja' | 'operater';
export type StvorioTip = 'admin' | 'vlasnik';
const ULOGE: readonly Uloga[] = ['vlasnik', 'knjigovodja', 'operater'];

export type RazlogOdbijanja =
  | 'email' | 'vrsta' | 'uloga' | 'nema_tenanta' | 'samo_admin' | 'nema_korisnika' | 'drugi_email' | 'neaktivan' | 'vec_clan';

/** Poruke za onoga tko izdaje (pozvani ih nikad ne vidi). */
export const PORUKE_ODBIJANJA: Record<RazlogOdbijanja, string> = {
  email: 'Neispravan e-mail.',
  vrsta: 'Pozivnica je ili za tenant (s ulogom) ili za novi passkey postojećem korisniku.',
  uloga: 'Vlasnik može pozvati samo knjigovođu ili operatera.',
  nema_tenanta: 'Nema tog tenanta.',
  samo_admin: 'Pozivnicu za novi passkey izdaje samo administrator.',
  nema_korisnika: 'Nema tog korisnika.',
  drugi_email: 'E-mail ne odgovara korisniku.',
  neaktivan: 'Korisnik je deaktiviran: ponovni ulazak odobrava administrator.',
  vec_clan: 'Taj korisnik je već aktivan član tenanta.',
};

export class PozivOdbijen extends Error {
  readonly razlog: RazlogOdbijanja;
  constructor(razlog: RazlogOdbijanja) {
    super(`pozivnica odbijena: ${razlog}`);
    this.razlog = razlog;
  }
}

export interface Poziv {
  id: number;
  email: string;
  ime: string | null;
  tenantId: number | null;
  uloga: Uloga | null;
  korisnikId: number | null;
  stvorioTip: StvorioTip;
}

export const normalizirajEmail = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
export const ispravanEmail = (e: string) => e.length <= 254 && EMAIL.test(e);
/** Token je točno 32 bajta u base64url (43 znaka); sve ostalo se ni ne traži u bazi. */
export const ispravanToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

/** Otvorena pozivnica (uz `?` = sada). */
const OTVORENA = 'iskoristena_at IS NULL AND opozvana_at IS NULL AND istjece > ?';
/**
 * Pozivnica se smije iskoristiti (uz OTVORENA): deaktiviranog korisnika vraća samo admin
 * pozivnica za tenant; „novi passkey” traži da korisnik postoji, da je to njegov e-mail i da je
 * aktivan; korisnik nema već MAX ključeva. Provjerava se u samom UPDATE-u potrošnje.
 */
const SMIJE = `
  NOT EXISTS (SELECT 1 FROM korisnik k WHERE k.email = pozivnice.email AND k.aktivan = 0
              AND (pozivnice.stvorio_tip = 'vlasnik' OR pozivnice.korisnik_id IS NOT NULL))
  AND (pozivnice.korisnik_id IS NULL
       OR EXISTS (SELECT 1 FROM korisnik k WHERE k.id = pozivnice.korisnik_id AND k.email = pozivnice.email))
  AND (SELECT COUNT(*) FROM korisnik_passkeys kp JOIN korisnik k ON k.id = kp.korisnik_id
       WHERE k.email = pozivnice.email) < ${MAX_PASSKEYS_PO_KORISNIKU}`;
const sati = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

interface PozivRow { id: number; email: string; ime: string | null; tenant_id: number | null; uloga: Uloga | null; korisnik_id: number | null; stvorio_tip: StvorioTip }
const uPoziv = (r: PozivRow): Poziv => ({
  id: r.id, email: r.email, ime: r.ime, tenantId: r.tenant_id, uloga: r.uloga, korisnikId: r.korisnik_id, stvorioTip: r.stvorio_tip,
});
const POLJA = 'id, email, ime, tenant_id, uloga, korisnik_id, stvorio_tip';

/**
 * Nova pozivnica. Za tenant: `tenantId` + `uloga`. Za novi passkey: `korisnikId` (samo admin,
 * korisnik mora biti aktivan i e-mail njegov). Prijašnja otvorena pozivnica za isti e-mail i
 * tenant (odnosno istog korisnika) prestaje vrijediti. Baca `PozivOdbijen`.
 * Token se vraća samo ovdje i nigdje se ne sprema.
 */
export async function izdaj(
  env: PozEnv,
  p: { email: string; ime?: string | null; tenantId?: number | null; uloga?: string | null; korisnikId?: number | null },
  stvorio: { email: string; tip: StvorioTip },
  sada = new Date(),
): Promise<{ token: string; id: number; email: string; istjece: string }> {
  const db = env.DB;
  const email = normalizirajEmail(p.email);
  if (!ispravanEmail(email)) throw new PozivOdbijen('email');
  let ime = (p.ime ?? '').trim().slice(0, 80) || null;
  const zaTenant = p.tenantId != null;
  if (zaTenant === (p.korisnikId != null)) throw new PozivOdbijen('vrsta');

  let tenantId: number | null = null;
  let uloga: Uloga | null = null;
  let korisnikId: number | null = null;
  const postojeci = await db.prepare('SELECT id, email, ime, aktivan FROM korisnik WHERE email = ?')
    .bind(email).first<{ id: number; email: string; ime: string | null; aktivan: number }>();

  if (zaTenant) {
    if (!ULOGE.includes(p.uloga as Uloga)) throw new PozivOdbijen('vrsta');
    uloga = p.uloga as Uloga;
    if (stvorio.tip === 'vlasnik' && uloga === 'vlasnik') throw new PozivOdbijen('uloga');
    const t = await db.prepare('SELECT id FROM tenant WHERE id = ?').bind(p.tenantId).first<{ id: number }>();
    if (!t) throw new PozivOdbijen('nema_tenanta');
    tenantId = t.id;
    if (postojeci?.aktivan === 0 && stvorio.tip === 'vlasnik') throw new PozivOdbijen('neaktivan');
    if (postojeci?.aktivan === 1) {
      const clan = await db.prepare('SELECT 1 FROM korisnik_tenant WHERE tenant_id = ? AND lower(user_email) = ? AND aktivan = 1')
        .bind(tenantId, email).first();
      if (clan) throw new PozivOdbijen('vec_clan');
    }
  } else {
    if (stvorio.tip !== 'admin') throw new PozivOdbijen('samo_admin');
    if (p.uloga != null) throw new PozivOdbijen('vrsta');
    const k = await db.prepare('SELECT id, email, ime, aktivan FROM korisnik WHERE id = ?')
      .bind(p.korisnikId).first<{ id: number; email: string; ime: string | null; aktivan: number }>();
    if (!k) throw new PozivOdbijen('nema_korisnika');
    if (k.email !== email) throw new PozivOdbijen('drugi_email');
    if (k.aktivan !== 1) throw new PozivOdbijen('neaktivan');
    korisnikId = k.id;
    ime ??= k.ime;
  }

  const token = randomToken();
  const hash = await sha256Hex(token);
  const at = sada.toISOString();
  const istjece = sati(sada, POZIV_SATI).toISOString();
  const zamijeni = zaTenant
    ? db.prepare(`UPDATE pozivnice SET opozvana_at = ? WHERE email = ? AND tenant_id = ? AND ${OTVORENA}`).bind(at, email, tenantId, at)
    : db.prepare(`UPDATE pozivnice SET opozvana_at = ? WHERE korisnik_id = ? AND tenant_id IS NULL AND ${OTVORENA}`).bind(at, korisnikId, at);
  const rez = await db.batch([
    zamijeni,
    db.prepare(
      `INSERT INTO pozivnice (token_hash, email, ime, tenant_id, uloga, korisnik_id, stvorio, stvorio_tip, created_at, istjece)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(hash, email, ime, tenantId, uloga, korisnikId, normalizirajEmail(stvorio.email), stvorio.tip, at, istjece),
  ]);
  return { token, id: (rez[1].results[0] as { id: number }).id, email, istjece };
}

/**
 * „Pošalji ponovno”: token stare pozivnice nigdje nije spremljen, pa se izdaje nova s istim
 * e-mailom, imenom, tenantom i ulogom (odnosno istim korisnikom), a stara se time poništava.
 * Stara mora biti neiskorištena i neopozvana (smije biti istekla). `tenantId`: vlasnik smije
 * samo pozivnice svog tenanta. null kad takve nema; inače kao `izdaj` (baca `PozivOdbijen`).
 */
export async function ponovnoIzdaj(
  env: PozEnv,
  id: number,
  stvorio: { email: string; tip: StvorioTip },
  ogr: { tenantId?: number } = {},
  sada = new Date(),
): Promise<{ token: string; id: number; email: string; istjece: string; stara: Poziv } | null> {
  const r = await env.DB.prepare(
    `SELECT ${POLJA} FROM pozivnice WHERE id = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL${ogr.tenantId != null ? ' AND tenant_id = ?' : ''}`,
  ).bind(...(ogr.tenantId != null ? [id, ogr.tenantId] : [id])).first<PozivRow>();
  if (!r) return null;
  const stara = uPoziv(r);
  const nova = await izdaj(env, { email: stara.email, ime: stara.ime, tenantId: stara.tenantId, uloga: stara.uloga, korisnikId: stara.korisnikId }, stvorio, sada);
  // `izdaj` poništava otvorenu pozivnicu istog e-maila i tenanta; istekla se zatvara ovdje.
  await env.DB.prepare('UPDATE pozivnice SET opozvana_at = ? WHERE id = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL')
    .bind(sada.toISOString(), stara.id).run();
  return { ...nova, stara };
}

/** Pozivnica iz tokena ako je otvorena i smije se iskoristiti; inače null. */
export async function provjeri(env: PozEnv, token: unknown, sada = new Date()): Promise<Poziv | null> {
  if (!ispravanToken(token)) return null;
  const r = await env.DB.prepare(`SELECT ${POLJA} FROM pozivnice WHERE token_hash = ? AND ${OTVORENA} AND ${SMIJE}`)
    .bind(await sha256Hex(token), sada.toISOString())
    .first<PozivRow>();
  return r ? uPoziv(r) : null;
}

/**
 * Naredbe za jedan `env.DB.batch`: potroši pozivnicu (atomski, uz OTVORENA i SMIJE), upsert
 * `korisnik` (aktivan), upsert `korisnik_tenant` po tenantu i e-mailu s ulogom iz pozivnice
 * (aktivan), upis passkeya. Sve osim potrošnje vezano je uz redak pozivnice s ovim
 * `passkey_id`, tj. nastaje samo ako je UPDATE potrošnje u ovom batchu nešto promijenio
 * (dva istodobna pokušaja: samo jedan stvori išta). Izvor e-maila, tenanta i uloge je sam
 * redak pozivnice, ne parametar. Indeksi rezultata: `potrosnja` (RETURNING pozivnice) i
 * `korisnik` (RETURNING id korisnika).
 */
export function naredbeIskoristenja(env: PozEnv, tokenHash: string, kljuc: NoviPasskey, label: string, sada: Date) {
  const db = env.DB;
  const at = sada.toISOString();
  const MOJA = 'p.token_hash = ? AND p.passkey_id = ?';
  const naredbe = [
    db.prepare(
      `UPDATE pozivnice SET iskoristena_at = ?, passkey_id = ?
       WHERE token_hash = ? AND ${OTVORENA} AND ${SMIJE}
       RETURNING ${POLJA}`,
    ).bind(at, kljuc.id, tokenHash, at),
    db.prepare(
      `INSERT INTO korisnik (email, ime, aktivan)
       SELECT p.email, p.ime, 1 FROM pozivnice p WHERE ${MOJA}
       ON CONFLICT (email) DO UPDATE SET aktivan = 1, ime = COALESCE(excluded.ime, korisnik.ime)
       RETURNING id`,
    ).bind(tokenHash, kljuc.id),
    db.prepare(
      `UPDATE korisnik_tenant SET aktivan = 1,
         uloga = (SELECT p.uloga FROM pozivnice p WHERE ${MOJA})
       WHERE EXISTS (SELECT 1 FROM pozivnice p WHERE ${MOJA}
                     AND p.tenant_id = korisnik_tenant.tenant_id AND p.email = lower(korisnik_tenant.user_email))`,
    ).bind(tokenHash, kljuc.id, tokenHash, kljuc.id),
    db.prepare(
      `INSERT INTO korisnik_tenant (tenant_id, user_email, uloga)
       SELECT p.tenant_id, p.email, p.uloga FROM pozivnice p
       WHERE ${MOJA} AND p.tenant_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM korisnik_tenant kt WHERE kt.tenant_id = p.tenant_id AND lower(kt.user_email) = p.email)`,
    ).bind(tokenHash, kljuc.id),
    db.prepare(
      `INSERT INTO korisnik_passkeys (id, korisnik_id, public_key, counter, transports, label, created_at)
       SELECT ?, k.id, ?, ?, ?, ?, ? FROM pozivnice p JOIN korisnik k ON k.email = p.email WHERE ${MOJA}`,
    ).bind(kljuc.id, kljuc.publicKey, kljuc.counter, kljuc.transports, oznakaKljuca(label), at, tokenHash, kljuc.id),
  ];
  return { naredbe, potrosnja: 0, korisnik: 1 };
}

/**
 * Iskoristi pozivnicu novim (već provjerenim, `provjeriRegistraciju`) passkeyem. Vraća pozivnicu
 * i id korisnika (za sesiju) ili null ako je u međuvremenu potrošena, opozvana, istekla ili se
 * ne smije iskoristiti; tada ne nastaje ništa.
 */
export async function iskoristi(
  env: PozEnv,
  token: string,
  kljuc: NoviPasskey,
  label = '',
  sada = new Date(),
): Promise<{ poziv: Poziv; korisnikId: number } | null> {
  if (!ispravanToken(token)) return null;
  const n = naredbeIskoristenja(env, await sha256Hex(token), kljuc, label, sada);
  const rez = await env.DB.batch(n.naredbe);
  const p = rez[n.potrosnja].results[0] as PozivRow | undefined;
  const k = rez[n.korisnik].results[0] as { id: number } | undefined;
  return p && k ? { poziv: uPoziv(p), korisnikId: k.id } : null;
}

/**
 * Iskoristi pozivnicu za tenant PRIJAVOM postojećim passkeyem (korisnik već ima račun i ključ,
 * pa novi passkey ne nastaje; preglednik bi ga ionako odbio jer isti uređaj već ima ključ).
 * `korisnik` je već provjeren (`verifyLogin`); pozivnica mora biti za njegov e-mail. U istom
 * batchu: potrošnja (uz OTVORENA, samo pozivnica za tenant, e-mail korisnika) i upsert članstva
 * s ulogom iz pozivnice, vezano uz `iskoristena_at` ovog batcha. null ako je ne može potrošiti.
 */
export async function iskoristiPrijavom(
  env: PozEnv,
  token: string,
  korisnik: { korisnikId: number; email: string },
  sada = new Date(),
): Promise<Poziv | null> {
  if (!ispravanToken(token)) return null;
  const db = env.DB;
  const hash = await sha256Hex(token);
  const at = sada.toISOString();
  const MOJA = 'p.token_hash = ? AND p.iskoristena_at = ? AND p.tenant_id IS NOT NULL';
  const rez = await db.batch([
    db.prepare(
      `UPDATE pozivnice SET iskoristena_at = ?
       WHERE token_hash = ? AND ${OTVORENA} AND tenant_id IS NOT NULL AND korisnik_id IS NULL AND email = ?
         AND EXISTS (SELECT 1 FROM korisnik k WHERE k.id = ? AND k.email = pozivnice.email AND k.aktivan = 1)
       RETURNING ${POLJA}`,
    ).bind(at, hash, at, normalizirajEmail(korisnik.email), korisnik.korisnikId),
    db.prepare(
      `UPDATE korisnik_tenant SET aktivan = 1,
         uloga = (SELECT p.uloga FROM pozivnice p WHERE ${MOJA})
       WHERE EXISTS (SELECT 1 FROM pozivnice p WHERE ${MOJA}
                     AND p.tenant_id = korisnik_tenant.tenant_id AND p.email = lower(korisnik_tenant.user_email))`,
    ).bind(hash, at, hash, at),
    db.prepare(
      `INSERT INTO korisnik_tenant (tenant_id, user_email, uloga)
       SELECT p.tenant_id, p.email, p.uloga FROM pozivnice p
       WHERE ${MOJA}
         AND NOT EXISTS (SELECT 1 FROM korisnik_tenant kt WHERE kt.tenant_id = p.tenant_id AND lower(kt.user_email) = p.email)`,
    ).bind(hash, at),
  ]);
  const r = rez[0].results[0] as PozivRow | undefined;
  return r ? uPoziv(r) : null;
}

/**
 * Opozovi otvorenu (ili isteklu) pozivnicu. `tenantId`: vlasnik smije samo pozivnice svog
 * tenanta. false: nema je, nije u tom tenantu ili je već iskorištena/opozvana.
 */
export async function opozovi(env: PozEnv, id: number, ogr: { tenantId?: number } = {}, sada = new Date()): Promise<boolean> {
  const r = ogr.tenantId != null
    ? await env.DB.prepare('UPDATE pozivnice SET opozvana_at = ? WHERE id = ? AND tenant_id = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL')
      .bind(sada.toISOString(), id, ogr.tenantId).run()
    : await env.DB.prepare('UPDATE pozivnice SET opozvana_at = ? WHERE id = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL')
      .bind(sada.toISOString(), id).run();
  return (r.meta.changes ?? 0) > 0;
}

export interface OtvorenaPozivnica {
  id: number; email: string; ime: string | null; tenant_id: number | null; uloga: Uloga | null; korisnik_id: number | null;
  stvorio: string; stvorio_tip: StvorioTip; created_at: string; istjece: string;
}

/** Otvorene pozivnice (svih ili jednog tenanta), najnovije prve. Hash tokena nikad ne izlazi. */
export async function otvorenePozivnice(env: PozEnv, ogr: { tenantId?: number } = {}, sada = new Date()): Promise<OtvorenaPozivnica[]> {
  const sql = `SELECT id, email, ime, tenant_id, uloga, korisnik_id, stvorio, stvorio_tip, created_at, istjece
               FROM pozivnice WHERE ${OTVORENA}${ogr.tenantId != null ? ' AND tenant_id = ?' : ''} ORDER BY created_at DESC, id DESC`;
  const st = env.DB.prepare(sql);
  return (await (ogr.tenantId != null ? st.bind(sada.toISOString(), ogr.tenantId) : st.bind(sada.toISOString()))
    .all<OtvorenaPozivnica>()).results;
}
