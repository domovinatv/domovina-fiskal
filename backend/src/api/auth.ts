// Autentikacija javnog API-ja /api/v1/*. Dva auth moda na istim rutama:
//   * mašinski: 'Bearer dfk_…' → SHA-256 → api_kljuc → tenant (webshop/integracija);
//   * korisnički (passkey): kolačić __Host-fiskal_app + 'X-Tenant-Id' → aktivan
//     korisnik → korisnik_tenant po e-mailu (docs/passkey/, odluke 6 i 8).
// Authorization zaglavlje ima prednost: kolačić se gleda samo kad ga nema.
// Dashboard je na istom originu (/app), pa CORS ne postoji (odluka 500).
// Vidi docs/knowledge/24-dashboard-passkey.md.

import { createMiddleware } from 'hono/factory';
import { getSession, readCookie, SESSION_COOKIE } from '../app-auth/sesija';
import { findClanstvoPoEmailu, findTenantByApiKeyHash, getTenant, touchApiKljuc } from '../db';
import { sha256Hex } from '../util';
import { istiOrigin } from './app-auth';
import type { ApiHono, ApiKontekst } from './tipovi';

// Korisničke rute BEZ tenant scopea — sesija je dovoljna (dropdown/profil se pune
// prije nego što je tenant odabran).
const RUTE_BEZ_TENANTA = new Set(['/api/v1/moji-tenanti', '/api/v1/ja']);
const bezTenanta = (path: string) =>
  RUTE_BEZ_TENANTA.has(path) || path === '/api/v1/passkeyi' || path.startsWith('/api/v1/passkeyi/');

// X-Tenant-Id kao pozitivan cijeli broj; inače gotov 400 odgovor.
function tenantIzZaglavlja(c: ApiKontekst): number | Response {
  const tenantIdRaw = c.req.header('X-Tenant-Id') ?? '';
  const tenantId = Number(tenantIdRaw);
  if (!tenantIdRaw || !Number.isSafeInteger(tenantId) || tenantId <= 0) {
    return c.json({ greska: "Nedostaje 'X-Tenant-Id' zaglavlje (odaberi tenanta)" }, 400);
  }
  return tenantId;
}

// Grana za kolačić sesije dashboarda (passkey). Sesija ne vrijedi za deaktiviranog
// korisnika (getSession); članstvo se provjerava pri svakom zahtjevu, pa deaktivacija
// člana u tenantu (korisnik_tenant.aktivan = 0) vrijedi odmah.
async function kolacicAuth(c: ApiKontekst, next: () => Promise<void>) {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !istiOrigin(c)) {
    return c.json({ greska: 'Zahtjev mora doći s istog origina (Origin zaglavlje)' }, 403);
  }
  const s = await getSession(c.env, c.req.header('Cookie'));
  if (!s) return c.json({ greska: 'Sesija je istekla ili ne vrijedi — prijavi se ponovno' }, 401);
  const korisnik = {
    izvor: 'passkey' as const, korisnikId: s.korisnikId, email: s.email, ime: s.ime, metoda: s.method,
    sesijaOd: s.createdAt, sesijaDo: s.expiresAt,
  };
  if (bezTenanta(c.req.path)) {
    c.set('korisnik', korisnik);
    return next();
  }
  const tenantId = tenantIzZaglavlja(c);
  if (tenantId instanceof Response) return tenantId;
  const kt = await findClanstvoPoEmailu(c.env.DB, tenantId, s.email);
  if (!kt) return c.json({ greska: 'Korisnik nema pristup tom tenantu' }, 403);
  const tenant = await getTenant(c.env.DB, tenantId);
  if (!tenant || tenant.status !== 'active') return c.json({ greska: 'Tenant nije aktivan' }, 403);
  c.set('tenant', tenant);
  c.set('korisnik', { ...korisnik, uloga: kt.uloga });
  return next();
}

// Kolačić sesije ili Bearer dfk_ ključ; sve ostalo je 401.
export const apiAuth = createMiddleware<ApiHono>(async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  if (!auth && readCookie(c.req.header('Cookie'), SESSION_COOKIE)) return kolacicAuth(c, next);
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    return c.json({ greska: "Nedostaje 'Authorization: Bearer <API ključ>' zaglavlje ili prijava u dashboard" }, 401);
  }
  const token = m[1];
  if (!token.startsWith('dfk_')) {
    return c.json({ greska: 'Nevažeći token — očekivan API ključ (dfk_…)' }, 401);
  }

  // Mašinski put: dfk_… → SHA-256 → api_kljuc → tenant
  const hash = await sha256Hex(token);
  const rezultat = await findTenantByApiKeyHash(c.env.DB, hash);
  if (!rezultat) {
    return c.json({ greska: 'Nevažeći ili deaktiviran API ključ' }, 401);
  }
  c.set('tenant', rezultat.tenant);
  c.set('apiKljucId', rezultat.apiKljucId);
  // K22: najviše jedan UPDATE po ključu u 60 s.
  if (!rezultat.svjezeKoristen) c.executionCtx.waitUntil(touchApiKljuc(c.env.DB, rezultat.apiKljucId));
  return next();
});
