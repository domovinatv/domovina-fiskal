// Admin prijava: Cloudflare Access + passkey → sesija u D1; skripte bearer tokenom.
// Vidi docs/knowledge/20-admin-prijava.md.
import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyAccessJwt } from '../src/admin/auth/access';
import { safeNext } from '../src/admin/auth/sesija';
import { ADMIN_EMAIL, adminSesija, adminSkripta, poziv, testEnv } from './pomocno/okolina';

const ORIGIN = 'https://fiskal-test.domovina.ai';
const db = testEnv.DB;

const forma = (kolacic: string, zaglavlja: Record<string, string> = { Origin: ORIGIN }) => ({
  method: 'POST',
  headers: { Cookie: kolacic, 'Content-Type': 'application/x-www-form-urlencoded', ...zaglavlja },
  body: '',
});

describe('Bez prijave', () => {
  it('GET stranice → login s next; /admin/api → 401; POST → 401/403', async () => {
    const r = await poziv('/admin/racuni?x=1');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/admin/login?next=%2Fadmin%2Fracuni%3Fx%3D1');
    expect((await poziv('/admin/api/kpd?q=62')).status).toBe(401);
    expect((await poziv('/admin/tenanti', forma(''))).status).toBe(401);
    expect((await poziv('/admin/tenanti', forma('', {}))).status).toBe(403); // bez Origina
  });

  it('login stranica: passkey gumb, Access link, skripte s nonceom i CSP', async () => {
    const r = await poziv('/admin/login?next=/admin/racuni');
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('id="passkey-login"');
    expect(html).toContain('href="/admin/sso?next=%2Fadmin%2Fracuni"');
    const csp = r.headers.get('content-security-policy')!;
    const nonce = csp.match(/'nonce-([^']+)'/)![1];
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).not.toMatch(/<script>/);
    expect(r.headers.get('x-frame-options')).toBe('DENY');
  });

  it('pogrešan bearer → 401 (ne pada na sesiju); Basic se ignorira → login', async () => {
    expect((await poziv('/admin', { headers: { Authorization: 'Bearer krivo-krivo-krivo-krivo-krivo-krivo' } })).status).toBe(401);
    expect((await poziv('/admin', { headers: { Authorization: `Basic ${btoa('admin:krivo')}` } })).status).toBe(302);
  });

  it('drugi host → 301 na ADMIN_HOST', async () => {
    const env = { ...testEnv, ADMIN_HOST: 'fiskal-test.domovina.ai' };
    const r = await poziv('/admin/login', { env, host: 'nesto.workers.dev' });
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('https://fiskal-test.domovina.ai/admin/login');
  });
});

describe('Skripta (ADMIN_SKRIPTA_TOKEN)', () => {
  it('bearer otvara admin; prekratak token u env-u se ne prihvaća', async () => {
    expect((await poziv('/admin', { headers: { Authorization: adminSkripta() } })).status).toBe(200);
    const env = { ...testEnv, ADMIN_SKRIPTA_TOKEN: 'kratko' };
    expect((await poziv('/admin', { env, headers: { Authorization: 'Bearer kratko' } })).status).toBe(401);
  });
});

describe('Sesija', () => {
  it('valjana sesija otvara admin; e-mail bez obzira na velika slova u ADMIN_EMAILS', async () => {
    expect((await poziv('/admin', { headers: { Cookie: await adminSesija() } })).status).toBe(200);
    expect((await poziv('/admin', { headers: { Cookie: await adminSesija({ email: 'drugi@primjer.hr' }) } })).status).toBe(200);
  });

  it('istekla, neaktivna > 2 h, ili e-mail maknut iz ADMIN_EMAILS → login', async () => {
    for (const kolacic of [await adminSesija({ istekla: true }), await adminSesija({ prijeMinuta: 200, neaktivnoMinuta: 121 })]) {
      expect((await poziv('/admin', { headers: { Cookie: kolacic } })).status).toBe(302);
    }
    const kolacic = await adminSesija();
    const env = { ...testEnv, ADMIN_EMAILS: 'netko@drugi.hr' };
    expect((await poziv('/admin', { env, headers: { Cookie: kolacic } })).status).toBe(302);
  });

  it('CSRF: POST sa sesijom traži Origin jednak originu', async () => {
    const kolacic = await adminSesija();
    expect((await poziv('/admin/tenanti', forma(kolacic, { Origin: 'https://zlo.example' }))).status).toBe(403);
    expect((await poziv('/admin/tenanti', forma(kolacic, {}))).status).toBe(403);
    expect((await poziv('/admin/tenanti', forma(kolacic, { 'Sec-Fetch-Site': 'same-origin' }))).status).toBe(403);
    expect((await poziv('/admin/tenanti', forma(kolacic))).status).toBe(400); // prošao zaštitu, prazna forma
  });

  it('odjava briše sesiju i kolačić', async () => {
    const kolacic = await adminSesija();
    const r = await poziv('/admin/logout', forma(kolacic));
    expect(r.status).toBe(303);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await poziv('/admin', { headers: { Cookie: kolacic } })).status).toBe(302);
  });

  // Regresija 2026-11-12 (TEST): Brave je uz kolačić sesije slao i zapamćeni Basic Auth
  // od prije; Basic je prošao bez sesije, /admin/passkeys → login → /admin/passkeys → petlja.
  it('sesija + zapamćeni Basic u pregledniku → sesija ima prednost (nema petlje)', async () => {
    const basic = `Basic ${btoa('admin:test-lozinka')}`;
    const r = await poziv('/admin/passkeys', { headers: { Cookie: await adminSesija(), Authorization: basic } });
    expect(r.status).toBe(200);
    // Basic bez sesije → login (jednom); skripta bez sesije → 403, ne preusmjeravanje.
    expect((await poziv('/admin/passkeys', { headers: { Authorization: basic } })).status).toBe(302);
    expect((await poziv('/admin/passkeys', { headers: { Authorization: adminSkripta() } })).status).toBe(403);
  });

  it('login sa sesijom → preusmjeri na next', async () => {
    const r = await poziv('/admin/login?next=/admin/racuni', { headers: { Cookie: await adminSesija() } });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/admin/racuni');
  });
});

describe('Passkey', () => {
  it('opcije prijave: izazov se sprema (jednokratno, 5 min)', async () => {
    const r = await poziv('/admin/passkey/login/options', { method: 'POST', headers: { Origin: ORIGIN } });
    expect(r.status).toBe(200);
    const o = (await r.json()) as { challenge: string; rpId: string };
    expect(o.rpId).toBe('fiskal-test.domovina.ai');
    expect(await db.prepare('SELECT purpose FROM admin_challenges WHERE challenge = ?').bind(o.challenge).first()).toEqual({ purpose: 'login' });
  });

  it('nepoznat ključ → 401', async () => {
    const r = await poziv('/admin/passkey/login/verify', {
      method: 'POST', headers: { Origin: ORIGIN }, body: JSON.stringify({ response: { id: 'nepostojeci', response: {} } }),
    });
    expect(r.status).toBe(401);
  });

  it('dodavanje: svježa sesija da; stara > 10 min ne; skripta bez sesije ne', async () => {
    const post = (z: Record<string, string>) => poziv('/admin/passkey/register/options', { method: 'POST', headers: { Origin: ORIGIN, ...z } });
    const svjeza = await post({ Cookie: await adminSesija() });
    expect(svjeza.status).toBe(200);
    expect(((await svjeza.json()) as { user: { name: string } }).user.name).toBe(ADMIN_EMAIL);
    expect((await post({ Cookie: await adminSesija({ prijeMinuta: 11 }) })).status).toBe(403);
    expect((await post({ Authorization: adminSkripta() })).status).toBe(401);
  });

  it('stranica ključeva: brisanje samo vlastitog ključa', async () => {
    const sada = new Date().toISOString();
    await db.prepare(`INSERT INTO admin_passkeys (id, email, public_key, label, created_at) VALUES ('k-moj', ?, 'x', 'Moj', ?), ('k-tudji', 'drugi@primjer.hr', 'x', 'Tuđi', ?)`)
      .bind(ADMIN_EMAIL, sada, sada).run();
    const kolacic = await adminSesija();
    const html = await (await poziv('/admin/passkeys', { headers: { Cookie: kolacic } })).text();
    expect(html).toContain('Moj');
    expect(html).not.toContain('Tuđi');
    for (const id of ['k-moj', 'k-tudji']) {
      await poziv('/admin/passkeys', { ...forma(kolacic), body: `id=${id}` });
    }
    const ostali = await db.prepare(`SELECT id FROM admin_passkeys WHERE id IN ('k-moj','k-tudji')`).all();
    expect(ostali.results).toEqual([{ id: 'k-tudji' }]);
  });
});

describe('Cloudflare Access', () => {
  it('/admin/sso bez JWT-a ili s lažnim → login?error=access', async () => {
    for (const z of [{}, { 'cf-access-jwt-assertion': 'a.b.c' }] as Record<string, string>[]) {
      const r = await poziv('/admin/sso', { headers: z });
      expect(r.status).toBe(302);
      expect(r.headers.get('location')).toBe('/admin/login?error=access');
    }
  });

  it('/admin/sso bez ACCESS_* → 503', async () => {
    expect((await poziv('/admin/sso', { env: { ...testEnv, ACCESS_AUD: undefined } })).status).toBe(503);
  });

  it('JWT: potpis + issuer + AUD; krivi AUD, issuer ili algoritam → odbijen', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const team = 'test.cloudflareaccess.com';
    const potpisi = (o: { aud?: string; iss?: string }) =>
      new SignJWT({ email: 'Admin@Primjer.hr' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(o.iss ?? `https://${team}`).setAudience(o.aud ?? 'testni-aud').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const provjeri = async (t: string) => verifyAccessJwt(t, { teamDomain: team, aud: 'testni-aud', keys });
    expect(await provjeri(await potpisi({}))).toEqual({ email: 'admin@primjer.hr' });
    expect(await provjeri(await potpisi({ aud: 'tudji-aud' }))).toBeNull();
    expect(await provjeri(await potpisi({ iss: 'https://zlo.cloudflareaccess.com' }))).toBeNull();
  });
});

describe('safeNext (otvoreno preusmjeravanje)', () => {
  it('samo relativne /admin putanje', () => {
    expect(safeNext('/admin/racuni?x=1')).toBe('/admin/racuni?x=1');
    for (const zlo of [null, '', 'https://zlo.example', '//zlo.example/admin', '/admin\\@zlo', '/drugo', 'javascript:alert(1)']) {
      expect(safeNext(zlo)).toBe('/admin');
    }
  });
});
