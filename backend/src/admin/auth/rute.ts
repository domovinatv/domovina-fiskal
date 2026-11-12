// Rute prijave u admin: /admin/login, /admin/sso, /admin/passkey/*, /admin/passkeys,
// /admin/logout. Po uzoru na ~/git/logomedo/logomedo.com src/pages/admin/*.
import { Hono } from 'hono';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { verifyAccessJwt } from './access';
import { KLIJENT_JS } from './klijent';
import { loginOptions, PASSKEY_REAUTH_SECONDS, registerRefusal, registrationOptions, verifyLogin, verifyRegistration } from './passkey';
import { accessConfigured, adminEmails, deleteSession, getSession, readCookie, safeNext, sessionCookie, startSession } from './sesija';
import type { AdminHono } from './zastita';
import { renderLoginPage, renderPasskeysPage, type PasskeyPrikaz } from '../views';

export const prijava = new Hono<AdminHono>();

prijava.get('/login', async (c) => {
  const next = safeNext(c.req.query('next'));
  if (await getSession(c.env, c.req.header('Cookie'))) return c.redirect(next, 302);
  const greska = c.req.query('error') === 'access' ? 'Access prijava nije prihvaćena za ovaj admin.' : null;
  return c.html(renderLoginPage({ next, greska, access: accessConfigured(c.env), klijentJs: KLIJENT_JS }));
});

/** Access na rubu štiti samo ovu putanju. Ovdje se JWT pretvara u našu sesiju. */
prijava.get('/sso', async (c) => {
  if (!accessConfigured(c.env)) return c.text('Cloudflare Access nije konfiguriran.', 503);
  const token = c.req.header('cf-access-jwt-assertion') ?? readCookie(c.req.header('Cookie'), 'CF_Authorization');
  const claims = token ? await verifyAccessJwt(token, { teamDomain: c.env.ACCESS_TEAM_DOMAIN!, aud: c.env.ACCESS_AUD! }) : null;
  if (!claims || !adminEmails(c.env).has(claims.email)) {
    console.warn(JSON.stringify({ msg: 'access_login_rejected', email: claims?.email ?? null }));
    return c.redirect('/admin/login?error=access', 302);
  }
  console.log(JSON.stringify({ msg: 'admin_login', method: 'access', email: claims.email }));
  return startSession(c.env, c.req.raw, claims.email, 'access', safeNext(c.req.query('next')));
});

prijava.post('/passkey/login/options', async (c) => c.json(await loginOptions(c.env, new URL(c.req.url))));

prijava.post('/passkey/login/verify', async (c) => {
  const body = await c.req.json<{ response?: AuthenticationResponseJSON; next?: string }>().catch(() => null);
  if (!body?.response?.id) return c.json({ error: 'bad_request' }, 400);
  const email = await verifyLogin(c.env, new URL(c.req.url), body.response);
  if (!email) return c.json({ error: 'prijava nije uspjela' }, 401);
  console.log(JSON.stringify({ msg: 'admin_login', method: 'passkey', email }));
  return startSession(c.env, c.req.raw, email, 'passkey', safeNext(body.next), true);
});

// Dodavanje passkeya: samo preglednička sesija (ne skripta ni Basic Auth).
prijava.post('/passkey/register/options', async (c) => {
  const s = c.get('sesija');
  if (!s) return c.json({ error: 'unauthorized' }, 401);
  const odbijeno = await registerRefusal(c.env, s);
  if (odbijeno) return c.json({ error: odbijeno }, 403);
  return c.json(await registrationOptions(c.env, new URL(c.req.url), s.email));
});

prijava.post('/passkey/register/verify', async (c) => {
  const s = c.get('sesija');
  if (!s) return c.json({ error: 'unauthorized' }, 401);
  const odbijeno = await registerRefusal(c.env, s);
  if (odbijeno) return c.json({ error: odbijeno }, 403);
  const body = await c.req.json<{ response?: RegistrationResponseJSON; label?: string }>().catch(() => null);
  if (!body?.response?.id) return c.json({ error: 'bad_request' }, 400);
  const label = (body.label ?? '').trim();
  const ok = await verifyRegistration(c.env, new URL(c.req.url), s.email, body.response, label);
  if (ok) console.warn(JSON.stringify({ msg: 'admin_passkey_added', email: s.email, label: label.slice(0, 60) }));
  return ok ? c.json({ ok: true }) : c.json({ error: 'upis nije uspio' }, 400);
});

prijava.get('/passkeys', async (c) => {
  const s = c.get('sesija');
  // Bez sesije (skripta ili prijelazni Basic Auth) — ne preusmjeravati na login (petlja).
  if (!s) return c.text('Ključevi traže prijavu Accessom ili passkeyem (ne Basic Auth ni skriptu).', 403);
  const { results } = await c.env.DB.prepare(
    'SELECT id, label, created_at, last_used_at FROM admin_passkeys WHERE email = ? ORDER BY created_at',
  ).bind(s.email).all<PasskeyPrikaz>();
  const svjeza = s.method === 'access' && Date.now() - Date.parse(s.createdAt) < PASSKEY_REAUTH_SECONDS * 1000;
  return c.html(renderPasskeysPage({ email: s.email, kljucevi: results, svjeza, klijentJs: KLIJENT_JS }));
});

prijava.post('/passkeys', async (c) => {
  const s = c.get('sesija');
  if (!s) return c.json({ error: 'unauthorized' }, 401);
  const forma = await c.req.parseBody();
  await c.env.DB.prepare('DELETE FROM admin_passkeys WHERE id = ? AND email = ?').bind(String(forma.id ?? ''), s.email).run();
  return c.redirect('/admin/passkeys', 303);
});

prijava.post('/logout', async (c) => {
  await deleteSession(c.env, c.req.header('Cookie'));
  return new Response(null, { status: 303, headers: { location: '/admin/login', 'set-cookie': sessionCookie('', 0) } });
});
