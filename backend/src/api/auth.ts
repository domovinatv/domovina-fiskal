// Autentikacija javnog API-ja /api/v1/*. Dva auth moda na istim rutama:
//   * mašinski: 'Bearer dfk_…' → SHA-256 → api_kljuc → tenant (webshop/integracija);
//   * korisnički: 'Bearer <GoTrue JWT>' + 'X-Tenant-Id' → verify vs GoTrue →
//     korisnik_tenant membership → tenant (customer dashboard).
// Vidi docs/knowledge/16-dashboard-sso.md.

import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { verificirajGotrueToken } from '../auth/gotrue';
import { bindKorisnikTenant, findKorisnikTenant, findTenantByApiKeyHash, getTenant, touchApiKljuc } from '../db';
import { sha256Hex } from '../util';
import type { ApiHono } from './tipovi';

// CORS za dashboard SPA (cross-origin) — MORA prije autha da preflight
// (OPTIONS bez Authorization headera) prođe. Origini iz DASHBOARD_ORIGIN (CSV).
export const apiCors = createMiddleware<ApiHono>(async (c, next) => {
  const dozvoljeni = (c.env.DASHBOARD_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const mw = cors({
    origin: (origin) => (dozvoljeni.includes(origin) ? origin : null),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'Idempotency-Key'],
    exposeHeaders: ['Idempotent-Replay'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86400,
  });
  return mw(c, next);
});

// Korisničke rute BEZ tenant scopea — JWT je dovoljan (dropdown/profil se pune
// prije nego što je tenant odabran).
const RUTE_BEZ_TENANTA = new Set(['/api/v1/moji-tenanti', '/api/v1/ja']);

// Bearer auth — grana po OBLIKU tokena (dfk_ prefiks vs JWT).
export const apiAuth = createMiddleware<ApiHono>(async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    return c.json({ greska: "Nedostaje 'Authorization: Bearer <API ključ ili GoTrue JWT>' zaglavlje" }, 401);
  }
  const token = m[1];

  // ── Mašinski put (postojeći): dfk_… → SHA-256 → api_kljuc → tenant ──
  if (token.startsWith('dfk_')) {
    const hash = await sha256Hex(token);
    const rezultat = await findTenantByApiKeyHash(c.env.DB, hash);
    if (!rezultat) {
      return c.json({ greska: 'Nevažeći ili deaktiviran API ključ' }, 401);
    }
    c.set('tenant', rezultat.tenant);
    c.set('apiKljucId', rezultat.apiKljucId);
    c.executionCtx.waitUntil(touchApiKljuc(c.env.DB, rezultat.apiKljucId));
    return next();
  }

  // ── Korisnički put (dashboard): GoTrue JWT + X-Tenant-Id ──
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return c.json({ greska: 'Nevažeći token — očekivan API ključ (dfk_…) ili GoTrue JWT' }, 401);
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
    return c.json({ greska: 'Korisnička prijava nije konfigurirana (SUPABASE_URL/SUPABASE_ANON_KEY)' }, 503);
  }
  let gotrue;
  try {
    gotrue = await verificirajGotrueToken(c.env, token);
  } catch (e) {
    return c.json({ greska: `Provjera prijave nije uspjela (GoTrue nedostupan): ${(e as Error).message}` }, 502);
  }
  if (!gotrue) {
    return c.json({ greska: 'Nevažeća ili istekla prijava — prijavi se ponovno' }, 401);
  }

  // Rute bez tenant scopea: dovoljan je identitet.
  if (RUTE_BEZ_TENANTA.has(c.req.path)) {
    c.set('korisnik', { sub: gotrue.sub, email: gotrue.email, emailPotvrdjen: gotrue.emailPotvrdjen });
    return next();
  }

  const tenantIdRaw = c.req.header('X-Tenant-Id') ?? '';
  const tenantId = Number(tenantIdRaw);
  if (!tenantIdRaw || !Number.isInteger(tenantId) || tenantId <= 0) {
    return c.json({ greska: "Nedostaje 'X-Tenant-Id' zaglavlje (odaberi tenanta)" }, 400);
  }

  // Membership: match po user_id (stabilan) ili email-bind fallback (§4) —
  // fallback SAMO uz potvrđen e-mail (K5), inače bi se netko mogao
  // registrirati tuđom adresom i na prvoj prijavi preuzeti članstvo.
  const kt = await findKorisnikTenant(c.env.DB, tenantId, gotrue.sub, gotrue.emailPotvrdjen ? gotrue.email : null);
  if (!kt) {
    if (!gotrue.emailPotvrdjen) {
      return c.json({ greska: 'E-mail adresa nije potvrđena — potvrdi je putem poveznice iz e-maila pa se prijavi ponovno' }, 403);
    }
    return c.json({ greska: 'Korisnik nema pristup tom tenantu' }, 403);
  }
  if (!kt.user_id) {
    // Prva prijava: veži GoTrue sub na redak dodan po (verificiranom) emailu.
    await bindKorisnikTenant(c.env.DB, kt.id, gotrue.sub);
  }
  const tenant = await getTenant(c.env.DB, tenantId);
  if (!tenant || tenant.status !== 'active') {
    return c.json({ greska: 'Tenant nije aktivan' }, 403);
  }
  c.set('tenant', tenant);
  c.set('korisnik', { sub: gotrue.sub, email: gotrue.email, emailPotvrdjen: gotrue.emailPotvrdjen, uloga: kt.uloga });
  return next();
});
