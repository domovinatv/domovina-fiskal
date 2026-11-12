// Zaštita /admin stabla: prijava Cloudflare Accessom ili passkeyem (sesija u D1),
// po uzoru na ~/git/logomedo/logomedo.com src/middleware.ts (a tamo omm/pay.domovina.ai).
// Vidi docs/knowledge/20-admin-prijava.md.
//
// Tri načina ulaska:
//   1. sesija (kolačić __Host-fiskal_admin) — preglednik; CSRF: Origin == origin na svakom ne-GET;
//   2. `Authorization: Bearer <ADMIN_SKRIPTA_TOKEN>` — skripte (dodaj-tenant.sh); bez kolačića, bez CSRF-a;
//   3. (UKLONJENO 2026-11-12) Basic Auth (ADMIN_USER/ADMIN_PASS). Kod je ispod zakomentiran
//      radi traga; `Authorization: Basic …` se ignorira (preglednik ga zna slati sam od prije).
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../../types';
import { getSession, skriptaTokenOk, type Session } from './sesija';

export type AdminHono = { Bindings: Env; Variables: { sesija: Session | null } };

/** Putanje dostupne bez sesije (prijava, odjava). */
const JAVNO = new Set([
  '/admin/login',
  '/admin/sso',
  '/admin/passkey/login/options',
  '/admin/passkey/login/verify',
  '/admin/logout',
]);

const lokalno = (h: string) => h === 'localhost' || h === '127.0.0.1';

// ── Basic Auth: UKLONJENO 2026-11-12 (zamijenjeno Accessom + passkeyem, skripte bearerom).
// Ostavljeno zakomentirano radi traga; secreti ADMIN_USER/ADMIN_PASS se više ne čitaju.
// async function jednako(a: string, b: string): Promise<boolean> {
//   const enc = new TextEncoder();
//   const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
//   return crypto.subtle.timingSafeEqual(x, y);
// }
//
// async function basicOk(env: Env, authorization: string): Promise<boolean> {
//   if (!env.ADMIN_USER || !env.ADMIN_PASS || !authorization.startsWith('Basic ')) return false;
//   let dekodirano: string;
//   try {
//     dekodirano = atob(authorization.slice(6).trim());
//   } catch {
//     return false;
//   }
//   const i = dekodirano.indexOf(':');
//   if (i < 0) return false;
//   const [u, p] = await Promise.all([jednako(dekodirano.slice(0, i), env.ADMIN_USER), jednako(dekodirano.slice(i + 1), env.ADMIN_PASS)]);
//   return u && p;
// }
//
// /** Stara (blaga) CSRF provjera za Basic Auth: klijenti bez Origina i Sec-Fetch-Site (curl) prolaze. */
// function basicCsrfOk(c: Context, origin: string): boolean {
//   const o = c.req.header('Origin');
//   if (o !== undefined) return o === origin;
//   const site = c.req.header('Sec-Fetch-Site');
//   return site === undefined || site === 'same-origin' || site === 'none';
// }

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const adminZastita: MiddlewareHandler<AdminHono> = async (c, next) => {
  const url = new URL(c.req.url);
  const izmjena = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
  c.set('sesija', null);

  // 1. Jedan host: rpID passkeya je hostname, a Access štiti samo ADMIN_HOST/admin/sso.
  const host = (c.env.ADMIN_HOST ?? '').trim();
  if (host && url.hostname !== host && !lokalno(url.hostname)) {
    if (izmjena) return json({ error: 'wrong_admin_host', admin_host: host }, 421);
    return c.redirect(`https://${host}${url.pathname}${url.search}`, 301);
  }

  // 2. Skripta: bearer token (bez kolačića, bez CSRF-a).
  const authorization = c.req.header('Authorization');
  if (authorization && (await skriptaTokenOk(c.env, authorization))) return zastiti(c, next);

  // 3. Sesija iz kolačića ima prednost pred Basic Authom: preglednik koji je ranije
  //    ušao Basic Authom šalje ga i dalje sam od sebe, pa bi inače stranice koje trebaju
  //    sesiju (ključevi) vrtjele login ↔ stranica (regresija 2026-11-12).
  const s = await getSession(c.env, c.req.header('Cookie'));
  if (s) {
    // CSRF: svaka promjena mora doći s istog origina (kolačić je SameSite=Lax).
    if (izmjena && c.req.header('Origin') !== url.origin) return json({ error: 'bad_origin' }, 403);
    c.set('sesija', s);
    return zastiti(c, next);
  }

  // 4. Basic Auth UKLONJEN 2026-11-12 — `Authorization: Basic …` se ignorira (ide na login).
  //    Pogrešan Bearer i dalje → 401 (skripta mora znati da token ne valja).
  // if (authorization) {
  //   if (!(await basicOk(c.env, authorization))) return json({ error: 'unauthorized' }, 401);
  //   if (izmjena && !basicCsrfOk(c, url.origin)) return c.text('Odbijeno (CSRF).', 403);
  //   return zastiti(c, next);
  // }
  if (authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  // 5. Bez prijave: CSRF i dalje vrijedi za javne POST-ove (passkey prijava, odjava).
  if (izmjena) {
    const origin = c.req.header('Origin');
    if (!origin || origin !== url.origin) return json({ error: 'bad_origin' }, 403);
  }
  if (!JAVNO.has(c.req.path)) {
    if (izmjena || c.req.path.startsWith('/admin/api/')) return json({ error: 'unauthorized' }, 401);
    return c.redirect(`/admin/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
  }
  return zastiti(c, next);
};

/** Sigurnosna zaglavlja; inline <script> bez src-a dobiva nonce (CSP ne dopušta ništa drugo). */
async function zastiti(c: Context<AdminHono>, next: () => Promise<void>): Promise<Response | void> {
  await next();
  const odgovor = c.res;
  const html = (odgovor.headers.get('content-type') ?? '').startsWith('text/html');
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/[+/=]/g, '');
  const tijelo = html ? (await odgovor.text()).replace(/<script(?![^>]*\bsrc=)/g, `<script nonce="${nonce}"`) : odgovor.body;
  const h = new Headers(odgovor.headers);
  // CSP samo na HTML: PDF-ovi računa (/admin/.../pdf) idu u ugrađeni preglednik PDF-a.
  if (html) h.set(
    'content-security-policy',
    `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; ` +
      `font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  );
  h.set('x-content-type-options', 'nosniff');
  // Ne "no-referrer": uz nju preglednik na <form> POST šalje `Origin: null` (zamka iz logomeda).
  h.set('referrer-policy', 'same-origin');
  h.set('x-frame-options', 'DENY');
  h.set('x-robots-tag', 'noindex');
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
  c.res = undefined;
  c.res = new Response(tijelo, { status: odgovor.status, statusText: odgovor.statusText, headers: h });
}
