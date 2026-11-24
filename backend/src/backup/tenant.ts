// BYO backup po tenantu (docs/knowledge/23-backup.md §Razina 2).
//
// Tenant unese SVOJ Cloudflare account ID, R2 bucket i API token. Mi u njegov
// bucket upisujemo:
//   <prefiks>racuni/<godina>/<broj>_<id>.json  — račun sa stavkama, PDV-om, naplatom i CIS XML-om
//   <prefiks>racuni/<godina>/<broj>_<id>.pdf   — PDF kakav ide kupcu
//   <prefiks>racuni/skice/<id>.json            — dokument još bez broja
//   <prefiks>snapshots/YYYY/MM/YYYY-MM-DD.json.gz — dnevno, svi podaci tenanta
// „Realtime”: nakon svakog uspješnog ne-GET zahtjeva koji je mogao promijeniti
// račun (waitUntil) + cron */15 kao mreža (CIS sweep dodjeljuje JIR bez zahtjeva).
// Što se šalje bira vodeni žig `sinkronizirano_do` nad racun.updated_at, s
// preklopom od 60 s (updated_at ima rezoluciju sekunde) — upisi su idempotentni.
//
// Upis ide preko Cloudflare REST API-ja (isti endpoint koristi `wrangler r2
// object put`), tokenom tenanta: on ga može opozvati kad hoće, a mi ne trebamo
// S3 ključeve ni pristup njegovom računu izvan tog bucketa.

import type { Env } from '../types';
import { getRacunKontekst } from '../db';
import { dekriptirajTajnu, enkriptirajTajnu, kekoviZaCitanje, kekZaSifriranje, oznakaKek } from '../kripto';
import { getPdfBranding, pdfRacuna } from '../pdf/branding';
import { fetchSTimeoutom } from '../util';
import { gzip, izveziTenantJson } from './dump';

const CF_API = 'https://api.cloudflare.com/client/v4';
const R2_TIMEOUT_MS = 20_000;
const PREKLOP_SEKUNDI = 60;
const NAJVISE_RACUNA_PO_POZIVU = 100; // ostatak dovrši sljedeći poziv/cron

export interface TenantBackupRow {
  id: number;
  tenant_id: number;
  cf_account_id: string;
  bucket: string;
  jurisdikcija: string | null;
  prefiks: string;
  token_prefiks: string | null;
  aktivan: number;
  sinkronizirano_do: string | null;
  zadnja_sinkronizacija: string | null;
  zadnji_snapshot: string | null;
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

const JAVNI_STUPCI = `id, tenant_id, cf_account_id, bucket, jurisdikcija, prefiks, token_prefiks, aktivan, sinkronizirano_do,
  zadnja_sinkronizacija, zadnji_snapshot, zadnja_greska, zadnja_greska_ts, created_at, updated_at`;

export async function getTenantBackup(db: D1Database, tenantId: number): Promise<TenantBackupRow | null> {
  return db.prepare(`SELECT ${JAVNI_STUPCI} FROM tenant_backup WHERE tenant_id = ?`).bind(tenantId).first<TenantBackupRow>();
}

async function getSMaterijalom(db: D1Database, tenantId: number) {
  return db
    .prepare(`SELECT ${JAVNI_STUPCI}, token_encrypted, enc_iv, dek_wrapped, dek_iv FROM tenant_backup WHERE tenant_id = ? AND aktivan = 1`)
    .bind(tenantId)
    .first<TenantBackupRow & Materijal>();
}

// ───────────────────────── Validacija unosa ─────────────────────────

export interface UnosBackupa {
  cfAccountId: string | null; // null → otkrij iz tokena (GET /accounts)
  bucket: string | null; // null → domovina-fiskal-<oib>, kreira se ako ne postoji
  jurisdikcija: string | null;
  prefiks: string;
  token: string;
}

export function validirajUnos(u: Record<string, unknown>): { ok: true; unos: UnosBackupa } | { ok: false; greska: string } {
  const cfAccountId = String(u.cfAccountId ?? '').trim().toLowerCase();
  const bucket = String(u.bucket ?? '').trim();
  const jur = String(u.jurisdikcija ?? '').trim().toLowerCase();
  let prefiks = String(u.prefiks ?? '').trim() || 'domovina-fiskal/';
  const token = String(u.token ?? '').trim();
  // Obavezan je samo token: račun se otkriva iz tokena, bucket se kreira sam.
  if (cfAccountId && !/^[0-9a-f]{32}$/.test(cfAccountId)) return { ok: false, greska: 'Cloudflare Account ID: 32 heksadekadska znaka (ili ostavi prazno — otkrije se iz tokena).' };
  if (bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return { ok: false, greska: 'Naziv R2 bucketa: 3–63 znaka, mala slova, brojke i crtica (ili ostavi prazno).' };
  // Zadano EU; 'default' = bucket bez jurisdikcije.
  if (jur && jur !== 'eu' && jur !== 'fedramp' && jur !== 'default') return { ok: false, greska: "Jurisdikcija: 'eu' (zadano), 'default' ili 'fedramp'." };
  if (!/^[A-Za-z0-9._\-/]{0,200}$/.test(prefiks) || prefiks.startsWith('/') || prefiks.includes('..')) {
    return { ok: false, greska: 'Prefiks: slova, brojke, . _ - /, bez vodećeg / i bez „..”.' };
  }
  if (!prefiks.endsWith('/')) prefiks += '/';
  if (token.length < 20 || /\s/.test(token)) return { ok: false, greska: 'Unesi Cloudflare API token (Workers R2 Storage: Edit).' };
  return { ok: true, unos: { cfAccountId: cfAccountId || null, bucket: bucket || null, jurisdikcija: jur === 'default' ? null : jur || 'eu', prefiks, token } };
}

// ───────────────────────── R2 preko REST API-ja ─────────────────────────

interface Odrediste {
  cf_account_id: string;
  bucket: string;
  jurisdikcija: string | null;
}

function kljucUUrl(kljuc: string): string {
  return kljuc.split('/').map(encodeURIComponent).join('/');
}

export async function r2Upisi(o: Odrediste, token: string, kljuc: string, tijelo: BodyInit, contentType: string): Promise<void> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': contentType };
  if (o.jurisdikcija) headers['cf-r2-jurisdiction'] = o.jurisdikcija;
  const r = await fetchSTimeoutom(
    'Cloudflare R2',
    `${CF_API}/accounts/${o.cf_account_id}/r2/buckets/${encodeURIComponent(o.bucket)}/objects/${kljucUUrl(kljuc)}`,
    { method: 'PUT', headers, body: tijelo },
    R2_TIMEOUT_MS,
  );
  if (!r.ok) {
    let poruka = '';
    try {
      const j = (await r.json()) as { errors?: { code?: number; message?: string }[] };
      poruka = (j.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ');
    } catch {
      /* tijelo nije JSON */
    }
    const savjet =
      r.status === 401 || r.status === 403 || /authenticat/i.test(poruka)
        ? ' — token nema pravo „Workers R2 Storage: Edit” na taj bucket ili je opozvan'
        : r.status === 404
          ? ' — bucket ne postoji (provjeri naziv, account i jurisdikciju)'
          : '';
    throw new Error(`R2 upis ${kljuc}: HTTP ${r.status}${poruka ? ` (${poruka})` : ''}${savjet}`);
  }
}

// ───────────────────────── Otkrivanje računa i bucketa iz tokena ─────────────────────────

async function cfApi<T>(token: string, putanja: string, init: RequestInit = {}, jurisdikcija: string | null = null): Promise<{ status: number; result: T | null; greska: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (jurisdikcija) headers['cf-r2-jurisdiction'] = jurisdikcija;
  const r = await fetchSTimeoutom('Cloudflare API', `${CF_API}${putanja}`, { ...init, headers }, R2_TIMEOUT_MS);
  let j: { result?: T; errors?: { code?: number; message?: string }[] } = {};
  try {
    j = await r.json();
  } catch {
    /* nije JSON */
  }
  const greska = (j.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ');
  return { status: r.status, result: r.ok ? (j.result ?? null) : null, greska };
}

// Računi kojima token ima pristup. Tokenu s „Workers R2 Storage: Edit” to
// vraća račun(e) na koje se dozvola odnosi.
export async function racuniIzTokena(token: string): Promise<{ id: string; name: string }[]> {
  const r = await cfApi<{ id: string; name: string }[]>(token, '/accounts?per_page=50');
  if (r.status === 401 || r.status === 403 || /authenticat/i.test(r.greska)) {
    throw new Error(`Cloudflare ne prihvaća token (HTTP ${r.status}${r.greska ? `: ${r.greska}` : ''})`);
  }
  if (!r.result) throw new Error(`Popis Cloudflare računa nije dohvaćen (HTTP ${r.status}${r.greska ? `: ${r.greska}` : ''})`);
  return r.result.map((a) => ({ id: a.id, name: a.name }));
}

export async function odrediOdrediste(
  u: UnosBackupa,
  oib: string,
): Promise<{ cfAccountId: string; bucket: string; kreiran: boolean }> {
  let cfAccountId = u.cfAccountId;
  if (!cfAccountId) {
    const racuni = await racuniIzTokena(u.token);
    if (racuni.length === 0) {
      throw new Error('Token nema pristup nijednom Cloudflare računu — upiši Account ID ručno ili napravi token s „Workers R2 Storage: Edit”.');
    }
    if (racuni.length > 1) {
      throw new Error(`Token vidi više računa — upiši Account ID jednog od njih: ${racuni.map((a) => `${a.name} (${a.id})`).join(', ')}`);
    }
    cfAccountId = racuni[0]!.id;
  }
  const bucket = u.bucket ?? `domovina-fiskal-${oib}`;
  const put = `/accounts/${cfAccountId}/r2/buckets/${encodeURIComponent(bucket)}`;
  const postoji = await cfApi(u.token, put, {}, u.jurisdikcija);
  if (postoji.status === 200) return { cfAccountId, bucket, kreiran: false };
  if (postoji.status !== 404) {
    throw new Error(`Provjera bucketa ${bucket} nije uspjela (HTTP ${postoji.status}${postoji.greska ? `: ${postoji.greska}` : ''}) — token treba „Workers R2 Storage: Edit”.`);
  }
  const novi = await cfApi(u.token, `/accounts/${cfAccountId}/r2/buckets`, { method: 'POST', body: JSON.stringify({ name: bucket }) }, u.jurisdikcija);
  if (novi.status !== 200) {
    throw new Error(`Kreiranje bucketa ${bucket} nije uspjelo (HTTP ${novi.status}${novi.greska ? `: ${novi.greska}` : ''}) — token treba „Workers R2 Storage: Edit” na razini računa (token ograničen na jedan bucket ne može kreirati novi; tada upiši naziv postojećeg).`);
  }
  return { cfAccountId, bucket, kreiran: true };
}

// ───────────────────────── Spremanje / brisanje postavki ─────────────────────────

// Prije spremanja upisuje probni objekt: kriva konfiguracija se odbija odmah,
// a ne tek kad prvi račun tiho ne stigne u backup.
export async function spremiTenantBackup(env: Env, tenantId: number, oib: string, unos: UnosBackupa): Promise<{ bucket: string; kreiran: boolean }> {
  const kek = kekZaSifriranje(env);
  if (!kek) throw new Error('ENC_MASTER_KEY nije postavljen — token se ne može sigurno spremiti');
  const o = await odrediOdrediste(unos, oib);
  const u = { ...unos, cfAccountId: o.cfAccountId, bucket: o.bucket };
  await r2Upisi(
    { cf_account_id: u.cfAccountId, bucket: u.bucket, jurisdikcija: u.jurisdikcija },
    u.token,
    `${u.prefiks}provjera.txt`,
    `domovina-fiskal: probni upis ${new Date().toISOString()} (tenant ${tenantId})\n`,
    'text/plain; charset=utf-8',
  );
  const enc = await enkriptirajTajnu(kek, u.token);
  await env.DB.prepare(
    `INSERT INTO tenant_backup (tenant_id, cf_account_id, bucket, jurisdikcija, prefiks, token_encrypted, enc_key_id, enc_iv, dek_wrapped, dek_iv, token_prefiks, aktivan, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, datetime('now'))
     ON CONFLICT (tenant_id) DO UPDATE SET
       cf_account_id = excluded.cf_account_id, bucket = excluded.bucket, jurisdikcija = excluded.jurisdikcija,
       prefiks = excluded.prefiks, token_encrypted = excluded.token_encrypted, enc_key_id = excluded.enc_key_id,
       enc_iv = excluded.enc_iv, dek_wrapped = excluded.dek_wrapped, dek_iv = excluded.dek_iv,
       token_prefiks = excluded.token_prefiks, aktivan = 1,
       -- novo odredište dobiva SVE račune iznova
       sinkronizirano_do = NULL, zadnja_greska = NULL, zadnja_greska_ts = NULL,
       updated_at = datetime('now')`,
  )
    .bind(tenantId, u.cfAccountId, u.bucket, u.jurisdikcija, u.prefiks, enc.tokenEncrypted, await oznakaKek(kek), enc.encIv, enc.dekWrapped, enc.dekIv, u.token.slice(0, 6))
    .run();
  return { bucket: o.bucket, kreiran: o.kreiran };
}

export async function obrisiTenantBackup(db: D1Database, tenantId: number): Promise<void> {
  await db.prepare(`DELETE FROM tenant_backup WHERE tenant_id = ?`).bind(tenantId).run();
}

async function zapisiGresku(db: D1Database, tenantId: number, e: unknown): Promise<void> {
  await db
    .prepare(`UPDATE tenant_backup SET zadnja_greska = ?, zadnja_greska_ts = datetime('now') WHERE tenant_id = ?`)
    .bind(String((e as Error)?.message ?? e).slice(0, 1000), tenantId)
    .run();
}

async function otvoriToken(env: Env, red: Materijal): Promise<string> {
  return dekriptirajTajnu(kekoviZaCitanje(env), {
    tokenEncrypted: red.token_encrypted,
    encIv: red.enc_iv,
    dekWrapped: red.dek_wrapped,
    dekIv: red.dek_iv,
  });
}

// ───────────────────────── Sinkronizacija računa ─────────────────────────

function sigurnoIme(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export interface RezultatSinkronizacije {
  poslano: number;
  greska: string | null;
  jos: boolean; // dosegnut limit — ostatak u sljedećem pozivu
}

export async function sinkronizirajTenanta(env: Env, tenantId: number): Promise<RezultatSinkronizacije> {
  const cfg = await getSMaterijalom(env.DB, tenantId);
  if (!cfg) return { poslano: 0, greska: null, jos: false };

  const racuni = await env.DB
    .prepare(
      `SELECT id, updated_at FROM racun
       WHERE tenant_id = ?1 AND (?2 IS NULL OR updated_at >= datetime(?2, '-${PREKLOP_SEKUNDI} seconds'))
       ORDER BY updated_at, id LIMIT ${NAJVISE_RACUNA_PO_POZIVU}`,
    )
    .bind(tenantId, cfg.sinkronizirano_do)
    .all<{ id: number; updated_at: string }>();
  if (!racuni.results.length) return { poslano: 0, greska: null, jos: false };

  let poslano = 0;
  try {
    const token = await otvoriToken(env, cfg);
    const branding = await getPdfBranding(env.DB, tenantId); // jednom po seriji
    for (const { id } of racuni.results) {
      const k = await getRacunKontekst(env.DB, tenantId, id);
      if (!k) continue;
      const [naplate, poruke] = await env.DB.batch([
        env.DB.prepare(`SELECT * FROM naplata WHERE racun_id = ? ORDER BY id`).bind(id),
        env.DB.prepare(`SELECT * FROM poruka_log WHERE tenant_id = ? AND racun_id = ? ORDER BY id`).bind(tenantId, id),
      ]);
      const broj = k.racun.broj_racuna_full;
      const osnova = broj
        ? `${cfg.prefiks}racuni/${k.racun.godina ?? String(k.racun.datum_vrijeme).slice(0, 4)}/${sigurnoIme(broj)}_${id}`
        : `${cfg.prefiks}racuni/skice/${id}`;
      const zapis = {
        format: 'domovina-fiskal/racun',
        verzija: 1,
        generirano: new Date().toISOString(),
        ...k,
        naplate: naplate!.results,
        porukeCis: poruke!.results,
      };
      await r2Upisi(cfg, token, `${osnova}.json`, JSON.stringify(zapis, null, 1), 'application/json; charset=utf-8');
      if (broj) await r2Upisi(cfg, token, `${osnova}.pdf`, await pdfRacuna(env.DB, k, branding), 'application/pdf');
      poslano++;
    }
  } catch (e) {
    console.error(`backup tenanta ${tenantId}`, e);
    await zapisiGresku(env.DB, tenantId, e);
    // Vodeni žig se pomiče samo preko uspješno poslanih (redoslijed po updated_at).
    if (poslano) await pomakniZig(env.DB, tenantId, racuni.results[poslano - 1]!.updated_at);
    return { poslano, greska: String((e as Error)?.message ?? e), jos: true };
  }
  await pomakniZig(env.DB, tenantId, racuni.results.at(-1)!.updated_at, true);
  return { poslano, greska: null, jos: racuni.results.length === NAJVISE_RACUNA_PO_POZIVU };
}

async function pomakniZig(db: D1Database, tenantId: number, do_: string, ocistiGresku = false): Promise<void> {
  // max(): dvije istodobne sinkronizacije ne smiju vratiti žig unatrag.
  await db
    .prepare(
      `UPDATE tenant_backup SET
         sinkronizirano_do = CASE WHEN sinkronizirano_do IS NULL OR sinkronizirano_do < ?1 THEN ?1 ELSE sinkronizirano_do END,
         zadnja_sinkronizacija = datetime('now')
         ${ocistiGresku ? ', zadnja_greska = NULL, zadnja_greska_ts = NULL' : ''}
       WHERE tenant_id = ?2`,
    )
    .bind(do_, tenantId)
    .run();
}

export async function aktivniTenantiSBackupom(db: D1Database): Promise<number[]> {
  const r = await db.prepare(`SELECT tenant_id FROM tenant_backup WHERE aktivan = 1 ORDER BY tenant_id`).all<{ tenant_id: number }>();
  return r.results.map((x) => x.tenant_id);
}

// Cron */15 i nakon admin akcija: svi tenanti s backupom. Greška jednog ne
// zaustavlja ostale (zapisana je u njegov redak).
export async function sinkronizirajSve(env: Env): Promise<void> {
  for (const tenantId of await aktivniTenantiSBackupom(env.DB)) {
    try {
      await sinkronizirajTenanta(env, tenantId);
    } catch (e) {
      console.error(`backup tenanta ${tenantId}`, e);
    }
  }
}

// ───────────────────────── Dnevni snapshot tenanta ─────────────────────────

export async function snapshotTenanta(env: Env, tenantId: number, sada = new Date()): Promise<string | null> {
  const cfg = await getSMaterijalom(env.DB, tenantId);
  if (!cfg) return null;
  try {
    const token = await otvoriToken(env, cfg);
    const dump = await izveziTenantJson(env.DB, tenantId);
    const iso = sada.toISOString();
    const kljuc = `${cfg.prefiks}snapshots/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(0, 10)}.json.gz`;
    await r2Upisi(cfg, token, kljuc, await gzip(JSON.stringify(dump)), 'application/gzip');
    await env.DB
      .prepare(`UPDATE tenant_backup SET zadnji_snapshot = ?, zadnja_greska = NULL, zadnja_greska_ts = NULL WHERE tenant_id = ?`)
      .bind(kljuc, tenantId)
      .run();
    return kljuc;
  } catch (e) {
    console.error(`snapshot tenanta ${tenantId}`, e);
    await zapisiGresku(env.DB, tenantId, e);
    return null;
  }
}
