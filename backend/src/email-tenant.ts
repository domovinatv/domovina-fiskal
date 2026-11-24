// Vlastiti pošiljatelj e-maila po tenantu (BYO Resend, migracija 0016).
//
// Zadano svi računi idu s racuni@domovina.ai (ključ platforme, reply-to =
// tenant). Tenant može unijeti SVOJ Resend API ključ i adresu na svojoj domeni
// (npr. financije@prilikazasusret.hr) — tada mail ide s nje. Ako slanje njegovim
// ključem ne uspije (opozvan ključ, domena izgubila verifikaciju, Resend
// odbije…), mail ide zadanim kanalom, a greška se zapiše u tenant_email i
// vidi u adminu/postavkama. Kupac račun dobije u svakom slučaju.
//
// Ključ je šifriran kao doku/backup token (envelope, KEK; rotacija u
// kripto-rotacija.ts) i nikad se ne vraća kroz API.

import type { RacunKontekst } from './db';
import { emailKonfiguriran, posaljiRacunEmailom, type RezultatSlanja, type TenantKanal } from './email';
import { dekriptirajTajnu, enkriptirajTajnu, kekoviZaCitanje, kekZaSifriranje, oznakaKek } from './kripto';
import type { Env } from './types';
import { fetchSTimeoutom, TIMEOUT_MS } from './util';

export interface TenantEmailRow {
  id: number;
  tenant_id: number;
  posiljatelj_email: string;
  posiljatelj_ime: string | null;
  token_prefiks: string | null;
  domena_provjerena: number;
  aktivan: number;
  zadnje_slanje: string | null;
  zadnja_greska: string | null;
  zadnja_greska_ts: string | null;
  created_at: string;
  updated_at: string;
}

interface Materijal {
  token_encrypted: string;
  enc_iv: string;
  dek_wrapped: string;
  dek_iv: string;
}

const JAVNI_STUPCI = `id, tenant_id, posiljatelj_email, posiljatelj_ime, token_prefiks, domena_provjerena, aktivan,
  zadnje_slanje, zadnja_greska, zadnja_greska_ts, created_at, updated_at`;

export async function getTenantEmail(db: D1Database, tenantId: number): Promise<TenantEmailRow | null> {
  return db.prepare(`SELECT ${JAVNI_STUPCI} FROM tenant_email WHERE tenant_id = ?`).bind(tenantId).first<TenantEmailRow>();
}

async function getSMaterijalom(db: D1Database, tenantId: number) {
  return db
    .prepare(`SELECT ${JAVNI_STUPCI}, token_encrypted, enc_iv, dek_wrapped, dek_iv FROM tenant_email WHERE tenant_id = ? AND aktivan = 1`)
    .bind(tenantId)
    .first<TenantEmailRow & Materijal>();
}

async function otvoriKljuc(env: Env, red: Materijal): Promise<string> {
  return dekriptirajTajnu(kekoviZaCitanje(env), {
    tokenEncrypted: red.token_encrypted,
    encIv: red.enc_iv,
    dekWrapped: red.dek_wrapped,
    dekIv: red.dek_iv,
  });
}

// ───────────────────────── Validacija unosa ─────────────────────────

export interface UnosEmaila {
  posiljateljEmail: string;
  posiljateljIme: string | null; // null → naziv tenanta
  apiKey: string | null; // null → zadrži postojeći ključ (promjena samo adrese/imena)
}

const EMAIL_RE = /^[^@\s"<>,;]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/;

export function validirajUnosEmaila(u: Record<string, unknown>): { ok: true; unos: UnosEmaila } | { ok: false; greska: string } {
  const posiljateljEmail = String(u.posiljateljEmail ?? '').trim().toLowerCase();
  const posiljateljIme = String(u.posiljateljIme ?? '').trim().replace(/\s+/g, ' ');
  const apiKey = String(u.apiKey ?? '').trim();
  if (!EMAIL_RE.test(posiljateljEmail)) {
    return { ok: false, greska: 'Adresa pošiljatelja nije valjana (npr. financije@prilikazasusret.hr).' };
  }
  if (posiljateljEmail.endsWith('@domovina.ai') || posiljateljEmail.endsWith('.domovina.ai')) {
    return { ok: false, greska: 'Adresa na domovina.ai je zadani pošiljatelj — za nju ne treba vlastiti ključ.' };
  }
  if (posiljateljIme.length > 100 || /[<>"\r\n]/.test(posiljateljIme)) {
    return { ok: false, greska: 'Ime pošiljatelja: do 100 znakova, bez < > i navodnika.' };
  }
  if (apiKey && (!/^re_[A-Za-z0-9_-]{10,}$/.test(apiKey))) {
    return { ok: false, greska: 'Resend API ključ počinje s „re_” (Resend → API Keys → Create API Key).' };
  }
  return { ok: true, unos: { posiljateljEmail, posiljateljIme: posiljateljIme || null, apiKey: apiKey || null } };
}

// ───────────────────────── Provjera ključa kod Resenda ─────────────────────────

// Vraća true kad je domena pošiljatelja verificirana na računu tog ključa,
// false kad ključ ima samo dozvolu slanja (ne vidi domene, pa se ne može
// provjeriti unaprijed). Baca kad je ključ neispravan ili domena nije spremna.
export async function provjeriResendKljuc(apiKey: string, posiljateljEmail: string): Promise<boolean> {
  const domena = posiljateljEmail.split('@')[1]!;
  const r = await fetchSTimeoutom('Resend', 'https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  }, TIMEOUT_MS.resend);
  const tijelo = (await r.json().catch(() => ({}))) as {
    name?: string;
    message?: string;
    data?: { name: string; status: string }[];
  };
  if (!r.ok) {
    // Ključ „Sending access” ne smije čitati domene — to je ispravan ključ.
    if (tijelo.name === 'restricted_api_key') return false;
    throw new Error(`Resend ne prihvaća ključ (HTTP ${r.status}${tijelo.message ? `: ${tijelo.message}` : ''})`);
  }
  const d = (tijelo.data ?? []).find((x) => x.name.toLowerCase() === domena);
  if (!d) {
    const ima = (tijelo.data ?? []).map((x) => x.name).join(', ') || 'nijedna';
    throw new Error(`Domena ${domena} nije dodana u Resend račun tog ključa (dodane: ${ima}). Dodaj je u Resend → Domains i postavi DNS zapise.`);
  }
  if (d.status !== 'verified' && d.status !== 'partially_verified') {
    throw new Error(`Domena ${domena} u Resendu još nije verificirana (status: ${d.status}) — provjeri DNS zapise (DKIM, SPF).`);
  }
  return true;
}

// ───────────────────────── Spremanje / brisanje ─────────────────────────

export async function spremiTenantEmail(env: Env, tenantId: number, unos: UnosEmaila): Promise<{ domenaProvjerena: boolean }> {
  const kek = kekZaSifriranje(env);
  if (!kek) throw new Error('ENC_MASTER_KEY nije postavljen — ključ se ne može sigurno spremiti');

  let apiKey = unos.apiKey;
  if (!apiKey) {
    const postojeci = await getSMaterijalom(env.DB, tenantId);
    if (!postojeci) throw new Error('Upiši Resend API ključ.');
    apiKey = await otvoriKljuc(env, postojeci);
  }
  const domenaProvjerena = await provjeriResendKljuc(apiKey, unos.posiljateljEmail);
  const enc = await enkriptirajTajnu(kek, apiKey);
  await env.DB.prepare(
    `INSERT INTO tenant_email (tenant_id, posiljatelj_email, posiljatelj_ime, token_encrypted, enc_key_id, enc_iv, dek_wrapped, dek_iv, token_prefiks, domena_provjerena, aktivan, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, datetime('now'))
     ON CONFLICT (tenant_id) DO UPDATE SET
       posiljatelj_email = excluded.posiljatelj_email, posiljatelj_ime = excluded.posiljatelj_ime,
       token_encrypted = excluded.token_encrypted, enc_key_id = excluded.enc_key_id, enc_iv = excluded.enc_iv,
       dek_wrapped = excluded.dek_wrapped, dek_iv = excluded.dek_iv, token_prefiks = excluded.token_prefiks,
       domena_provjerena = excluded.domena_provjerena, aktivan = 1,
       zadnja_greska = NULL, zadnja_greska_ts = NULL,
       updated_at = datetime('now')`,
  )
    .bind(tenantId, unos.posiljateljEmail, unos.posiljateljIme, enc.tokenEncrypted, await oznakaKek(kek), enc.encIv, enc.dekWrapped, enc.dekIv, apiKey.slice(0, 7), domenaProvjerena ? 1 : 0)
    .run();
  return { domenaProvjerena };
}

export async function obrisiTenantEmail(db: D1Database, tenantId: number): Promise<void> {
  await db.prepare(`DELETE FROM tenant_email WHERE tenant_id = ?`).bind(tenantId).run();
}

// ───────────────────────── Slanje ─────────────────────────

// Vlastiti kanal tenanta ili null (nema ga / ne može se otvoriti → zadani kanal).
export async function tenantKanal(env: Env, tenantId: number, nazivTenanta: string): Promise<TenantKanal | null> {
  const red = await getSMaterijalom(env.DB, tenantId);
  if (!red) return null;
  try {
    return {
      apiKey: await otvoriKljuc(env, red),
      from: { email: red.posiljatelj_email, name: red.posiljatelj_ime ?? nazivTenanta },
    };
  } catch (e) {
    await zapisiGresku(env.DB, tenantId, `Ključ se ne može dešifrirati: ${(e as Error).message}`);
    return null;
  }
}

// Može li se tenantu uopće poslati mail (zadani kanal ili njegov vlastiti).
export async function emailDostupan(env: Env, tenantId: number): Promise<boolean> {
  if (emailKonfiguriran(env)) return true;
  return !!(await getTenantEmail(env.DB, tenantId))?.aktivan;
}

// Slanje računa s pošiljateljem tenanta (ako ga ima) i zapis stanja kanala.
export async function posaljiRacunTenanta(env: Env, k: RacunKontekst, pdf: Uint8Array, na: string): Promise<RezultatSlanja> {
  const kanal = await tenantKanal(env, k.tenant.id, k.tenant.naziv);
  let r: RezultatSlanja;
  try {
    r = await posaljiRacunEmailom(env, k, pdf, na, null, kanal);
  } catch (e) {
    if (kanal) await zapisiGresku(env.DB, k.tenant.id, (e as Error).message);
    throw e;
  }
  if (r.kanal === 'resend-tenant') {
    await env.DB.prepare(
      `UPDATE tenant_email SET zadnje_slanje = datetime('now'), zadnja_greska = NULL, zadnja_greska_ts = NULL WHERE tenant_id = ?`,
    ).bind(k.tenant.id).run();
  } else if (r.tenantGreska) {
    await zapisiGresku(env.DB, k.tenant.id, r.tenantGreska);
  }
  return r;
}

async function zapisiGresku(db: D1Database, tenantId: number, poruka: string): Promise<void> {
  await db
    .prepare(`UPDATE tenant_email SET zadnja_greska = ?, zadnja_greska_ts = datetime('now') WHERE tenant_id = ?`)
    .bind(poruka.slice(0, 1000), tenantId)
    .run();
}
