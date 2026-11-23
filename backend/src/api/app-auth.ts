// Prijava u customer dashboard (/app) passkeyem i pozivnicom — docs/passkey/ (S2).
//
// Dva dijela:
//   * `appAuthJavno`: rute bez sesije (prijava, pozivnica, odjava). Montira se u
//     src/index.ts PRIJE /api/v1 sub-appa, pa ih Bearer/kolačić auth ne presreće.
//   * `passkeyRute`: moji passkeyi; idu kroz apiAuth (kolačić, bez X-Tenant-Id).
//
// CSRF (odluka 8): svaka mutacija ovdje i svaka ne-GET/HEAD s kolačićem u apiAuth
// traži `Origin` jednak originu Workera. Kolačić je SameSite=Lax, a dashboard je na
// istom originu (odluka 2), pa CORS za ove rute ne postoji.
//
// Poruke greške prijave namjerno ne razlikuju razloge (ne otkrivaju koji ključevi postoje).

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { Hono, type Context } from 'hono';
import {
  dodajPasskey, loginOptions, mojiKljucevi, obrisiKljucOsimZadnjeg, provjeriRegistraciju, registerRefusal,
  registrationOptions, verifyLogin,
} from '../app-auth/passkey';
import { iskoristi, provjeri } from '../app-auth/pozivnice';
import { createSession, deleteSession, odjavaCookie, sessionCookie } from '../app-auth/sesija';
import type { Env } from '../types';
import { jsonTijelo } from './pomocno';
import type { ApiHono, ApiKontekst } from './tipovi';

/** CSRF: `Origin` zahtjeva mora biti origin Workera (isti host i shema). */
export function istiOrigin(c: Context): boolean {
  const o = c.req.header('Origin');
  return !!o && o === new URL(c.req.url).origin;
}

const ODBIJEN_ORIGIN = { greska: 'Zahtjev mora doći s istog origina (Origin zaglavlje)' } as const;
const POZIV_NE_VRIJEDI = { greska: 'Pozivnica ne vrijedi: istekla je, iskorištena, opozvana ili nije ispravna. Zatraži novu.' } as const;

type JavnoHono = { Bindings: Env };
export const appAuthJavno = new Hono<JavnoHono>();

// Samo na vlastitim putanjama: sub-app je montiran na /api/v1 uz apiV1, pa bi '*' hvatao
// i dfk_ mutacije webshopova (koje nemaju Origin).
const samoIstiOrigin = async (c: Context, next: () => Promise<void>) => {
  if (!istiOrigin(c)) return c.json(ODBIJEN_ORIGIN, 403);
  return next();
};
appAuthJavno.use('/prijava/*', samoIstiOrigin);
appAuthJavno.use('/poziv/*', samoIstiOrigin);
appAuthJavno.use('/odjava', samoIstiOrigin);

const ua = (c: Context) => c.req.header('User-Agent') ?? null;
const jeObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ── Prijava postojećim passkeyem (discoverable, bez e-maila) ──

appAuthJavno.post('/prijava/opcije', async (c) => {
  return c.json(await loginOptions(c.env, new URL(c.req.url)));
});

appAuthJavno.post('/prijava/potvrdi', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const odgovor = body.odgovor;
  if (!jeObjekt(odgovor) || typeof odgovor.id !== 'string') return c.json({ greska: "Nedostaje 'odgovor' (WebAuthn)" }, 400);
  const k = await verifyLogin(c.env, new URL(c.req.url), odgovor as unknown as AuthenticationResponseJSON);
  if (!k) return c.json({ greska: 'Prijava nije uspjela' }, 401);
  const token = await createSession(c.env, k.korisnikId, 'passkey', ua(c));
  c.header('Set-Cookie', sessionCookie(token));
  return c.json({ ok: true, email: k.email });
});

// ── Pozivnica: token iz fragmenta linka (/app/poziv#…) šalje klijent u tijelu ──

appAuthJavno.post('/poziv/opcije', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const p = await provjeri(c.env, body.token);
  if (!p) return c.json(POZIV_NE_VRIJEDI, 410);
  const opcije = await registrationOptions(c.env, new URL(c.req.url), { purpose: 'poziv', pozivId: p.id, email: p.email });
  const tenant = p.tenantId != null
    ? await c.env.DB.prepare('SELECT naziv FROM tenant WHERE id = ?').bind(p.tenantId).first<{ naziv: string }>()
    : null;
  return c.json({
    opcije,
    email: p.email,
    ime: p.ime,
    tenant: p.tenantId != null ? { id: p.tenantId, naziv: tenant?.naziv ?? null } : null,
    uloga: p.uloga,
    noviPasskey: p.korisnikId != null,
  });
});

appAuthJavno.post('/poziv/potvrdi', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const odgovor = body.odgovor;
  if (!jeObjekt(odgovor)) return c.json({ greska: "Nedostaje 'odgovor' (WebAuthn)" }, 400);
  const p = await provjeri(c.env, body.token);
  if (!p) return c.json(POZIV_NE_VRIJEDI, 410);
  const url = new URL(c.req.url);
  const kljuc = await provjeriRegistraciju(c.env, url, { purpose: 'poziv', pozivId: p.id, email: p.email },
    odgovor as unknown as RegistrationResponseJSON);
  if (!kljuc) return c.json({ greska: 'Passkey nije potvrđen — pokušaj ponovno' }, 400);
  const r = await iskoristi(c.env, body.token as string, kljuc, typeof body.oznaka === 'string' ? body.oznaka : '');
  if (!r) return c.json(POZIV_NE_VRIJEDI, 410);
  const token = await createSession(c.env, r.korisnikId, 'poziv', ua(c));
  c.header('Set-Cookie', sessionCookie(token));
  return c.json({ ok: true, email: r.poziv.email, tenantId: r.poziv.tenantId, uloga: r.poziv.uloga }, 201);
});

// Odjava ne traži valjanu sesiju: kolačić se briše uvijek, redak sesije ako postoji.
appAuthJavno.post('/odjava', async (c) => {
  await deleteSession(c.env, c.req.header('Cookie'));
  c.header('Set-Cookie', odjavaCookie());
  return c.json({ ok: true });
});

// ── Moji passkeyi (prijavljeni kolačićem; kroz apiAuth, bez X-Tenant-Id) ──

export const passkeyRute = new Hono<ApiHono>();

function passkeySesija(c: ApiKontekst) {
  const k = c.get('korisnik');
  return k?.izvor === 'passkey' ? k : null;
}
const SAMO_KOLACIC = { greska: 'Endpoint je dostupan samo uz prijavu passkeyem (kolačić sesije)' } as const;

passkeyRute.get('/passkeyi', async (c) => {
  const k = passkeySesija(c);
  if (!k) return c.json(SAMO_KOLACIC, 400);
  const kljucevi = await mojiKljucevi(c.env, k.korisnikId);
  return c.json({
    passkeyi: kljucevi.map((x) => ({ id: x.id, oznaka: x.label, stvoren: x.created_at, zadnjeKoristen: x.last_used_at })),
    dodavanje: await registerRefusal(c.env, { korisnikId: k.korisnikId, createdAt: k.sesijaOd }),
  });
});

passkeyRute.post('/passkeyi/opcije', async (c) => {
  const k = passkeySesija(c);
  if (!k) return c.json(SAMO_KOLACIC, 400);
  const odbijeno = await registerRefusal(c.env, { korisnikId: k.korisnikId, createdAt: k.sesijaOd });
  if (odbijeno) return c.json({ greska: odbijeno }, 403);
  return c.json(await registrationOptions(c.env, new URL(c.req.url), { purpose: 'register', korisnikId: k.korisnikId, email: k.email }));
});

passkeyRute.post('/passkeyi/potvrdi', async (c) => {
  const k = passkeySesija(c);
  if (!k) return c.json(SAMO_KOLACIC, 400);
  const odbijeno = await registerRefusal(c.env, { korisnikId: k.korisnikId, createdAt: k.sesijaOd });
  if (odbijeno) return c.json({ greska: odbijeno }, 403);
  const body = await jsonTijelo(c);
  if (!jeObjekt(body.odgovor)) return c.json({ greska: "Nedostaje 'odgovor' (WebAuthn)" }, 400);
  const ok = await dodajPasskey(c.env, new URL(c.req.url), k, body.odgovor as unknown as RegistrationResponseJSON,
    typeof body.oznaka === 'string' ? body.oznaka : '');
  if (!ok) return c.json({ greska: 'Passkey nije dodan — pokušaj ponovno' }, 400);
  return c.json({ ok: true }, 201);
});

passkeyRute.delete('/passkeyi/:id', async (c) => {
  const k = passkeySesija(c);
  if (!k) return c.json(SAMO_KOLACIC, 400);
  const r = await obrisiKljucOsimZadnjeg(c.env, c.req.param('id'), k.korisnikId);
  if (r === 'zadnji') return c.json({ greska: 'Zadnji passkey se ne može obrisati — prvo dodaj drugi.' }, 409);
  if (r === 'nema') return c.json({ greska: 'Nema tog passkeya' }, 404);
  return c.json({ ok: true });
});
