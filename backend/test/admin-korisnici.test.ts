// /admin/korisnici (docs/passkey/, S3): izdavanje pozivnice, opoziv, novi passkey, deaktivacija
// i aktivacija korisnika, članstvo u tenantu i trag radnji (korisnik_aktivnost, migracija 0015).
// Passkey se upisuje izravno kroz `iskoristi` (bez WebAuthna): rute prijave pokriva app-auth-rute.test.ts.
import { describe, expect, it } from 'vitest';

import { iskoristi, izdaj, provjeri } from '../src/app-auth/pozivnice';
import { createSession, getSession, SESSION_COOKIE } from '../src/app-auth/sesija';
import { ADMIN_EMAIL, adminSesija, adminSkripta, napraviTenanta, poziv, testEnv } from './pomocno/okolina';

const db = testEnv.DB;
const ORIGIN = 'https://fiskal-test.domovina.ai';
const ADMIN = { email: 'admin@primjer.hr', tip: 'admin' as const };
const noviEmail = () => `k-${crypto.randomUUID().slice(0, 12)}@primjer.hr`;

function adminPost(putanja: string, polja: Record<string, string> = {}, auth: Record<string, string> = { Authorization: adminSkripta() }) {
  return poziv(putanja, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
    body: new URLSearchParams(polja).toString(),
  });
}
const adminGet = (putanja: string) => poziv(putanja, { headers: { Authorization: adminSkripta() } });

const tokenIz = (html: string) => html.match(/\/app\/poziv#([A-Za-z0-9_-]{43})/)?.[1] ?? null;

const zapisi = (email: string) =>
  db.prepare('SELECT tko, tko_tip, radnja, tenant_id, korisnik_id, pozivnica_id, detalji FROM korisnik_aktivnost WHERE email = ? ORDER BY id')
    .bind(email).all<{ tko: string; tko_tip: string; radnja: string; tenant_id: number | null; korisnik_id: number | null; pozivnica_id: number | null; detalji: string | null }>()
    .then((r) => r.results);

/** Korisnik s passkeyem u tenantu (pozivnica → iskorištena) i jednom sesijom. */
async function korisnikSPasskeyem(uloga: 'vlasnik' | 'knjigovodja' = 'vlasnik') {
  const t = await napraviTenanta({ certifikat: false });
  const email = noviEmail();
  const p = await izdaj(testEnv, { email, tenantId: t.tenant.id, uloga }, ADMIN);
  const r = await iskoristi(testEnv, p.token, { id: crypto.randomUUID(), publicKey: 'AQID', counter: 0, transports: null });
  expect(r).not.toBeNull();
  const sesija = await createSession(testEnv, r!.korisnikId, 'poziv', null);
  return { t, email, korisnikId: r!.korisnikId, cookie: `${SESSION_COOKIE}=${sesija}` };
}

describe('/admin/korisnici — pozivnice', () => {
  it('izdavanje: link /app/poziv#token samo u odgovoru, pozivnica vrijedi, zapis s e-mailom admina', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const email = noviEmail();
    const r = await adminPost('/admin/korisnici/pozivnica', { email: email.toUpperCase(), ime: 'Ana', tenant_id: String(t.tenant.id), uloga: 'vlasnik' },
      { Cookie: await adminSesija() });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(`${ORIGIN}/app/poziv#`);
    const token = tokenIz(html)!;
    expect(await provjeri(testEnv, token)).toMatchObject({ email, tenantId: t.tenant.id, uloga: 'vlasnik', stvorioTip: 'admin' });

    // Popis pokazuje pozivnicu, ali nikad token.
    const popis = await (await adminGet('/admin/korisnici')).text();
    expect(popis).toContain(email);
    expect(popis).not.toContain(token);
    expect(tokenIz(await (await adminGet(`/admin/tenant/${t.tenant.id}`)).text())).toBeNull();

    expect(await zapisi(email)).toMatchObject([{ tko: ADMIN_EMAIL.toLowerCase(), tko_tip: 'admin', radnja: 'poziv.izdan', tenant_id: t.tenant.id }]);
  });

  it('odbijanja: krivi e-mail 400, bez tenanta 400, nepostojeći tenant 404, već aktivan član 409', async () => {
    const t = await napraviTenanta({ certifikat: false });
    expect((await adminPost('/admin/korisnici/pozivnica', { email: 'nije-email', tenant_id: String(t.tenant.id), uloga: 'operater' })).status).toBe(400);
    expect((await adminPost('/admin/korisnici/pozivnica', { email: noviEmail(), tenant_id: '', uloga: 'operater' })).status).toBe(400);
    expect((await adminPost('/admin/korisnici/pozivnica', { email: noviEmail(), tenant_id: '999999', uloga: 'operater' })).status).toBe(404);
    const k = await korisnikSPasskeyem();
    const r = await adminPost('/admin/korisnici/pozivnica', { email: k.email, tenant_id: String(k.t.tenant.id), uloga: 'operater' });
    expect(r.status).toBe(409);
    expect(await r.text()).toContain('već aktivan član');
  });

  it('opoziv: pozivnica prestaje vrijediti, zapis; drugi opoziv 404; povratak na detalj tenanta', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const email = noviEmail();
    const token = tokenIz(await (await adminPost('/admin/korisnici/pozivnica', { email, tenant_id: String(t.tenant.id), uloga: 'knjigovodja' })).text())!;
    const p = await provjeri(testEnv, token);
    const r = await adminPost(`/admin/korisnici/pozivnica/${p!.id}/opozovi`, { povratak: `/admin/tenant/${t.tenant.id}` });
    expect(r.status).toBe(303);
    expect(r.headers.get('Location')).toBe(`/admin/tenant/${t.tenant.id}`);
    expect(await provjeri(testEnv, token)).toBeNull();
    expect((await adminPost(`/admin/korisnici/pozivnica/${p!.id}/opozovi`)).status).toBe(404);
    expect((await zapisi(email)).map((z) => z.radnja)).toEqual(['poziv.izdan', 'poziv.opozvan']);
    // Tuđi povratak se ne poštuje.
    const druga = tokenIz(await (await adminPost('/admin/korisnici/pozivnica', { email, tenant_id: String(t.tenant.id), uloga: 'operater' })).text())!;
    const r2 = await adminPost(`/admin/korisnici/pozivnica/${(await provjeri(testEnv, druga))!.id}/opozovi`, { povratak: 'https://zlo.example/' });
    expect(r2.headers.get('Location')).toBe('/admin/korisnici');
  });

  it('novi passkey: pozivnica za isti račun (korisnik_id), stari ključ ostaje', async () => {
    const k = await korisnikSPasskeyem();
    const r = await adminPost(`/admin/korisnici/${k.korisnikId}/novi-passkey`);
    expect(r.status).toBe(200);
    const token = tokenIz(await r.text())!;
    expect(await provjeri(testEnv, token)).toMatchObject({ email: k.email, korisnikId: k.korisnikId, tenantId: null, uloga: null });
    const dodan = await iskoristi(testEnv, token, { id: crypto.randomUUID(), publicKey: 'AQID', counter: 0, transports: null });
    expect(dodan?.korisnikId).toBe(k.korisnikId);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM korisnik_passkeys WHERE korisnik_id = ?').bind(k.korisnikId).first('n')).toBe(2);
    expect((await zapisi(k.email)).at(-1)).toMatchObject({ radnja: 'poziv.izdan', korisnik_id: k.korisnikId, tko: 'skripta' });
    expect((await adminPost('/admin/korisnici/999999/novi-passkey')).status).toBe(404);
  });
});

describe('/admin/korisnici — deaktivacija i aktivacija', () => {
  it('deaktivacija briše sesije i opoziva otvorene pozivnice; passkeyi ostaju; aktivacija vraća pristup bez pozivnice', async () => {
    const k = await korisnikSPasskeyem();
    await createSession(testEnv, k.korisnikId, 'passkey', null);
    expect(await getSession(testEnv, k.cookie)).not.toBeNull();
    const np = await izdaj(testEnv, { email: k.email, korisnikId: k.korisnikId }, ADMIN);
    const drugi = await napraviTenanta({ certifikat: false });
    const tp = await izdaj(testEnv, { email: k.email, tenantId: drugi.tenant.id, uloga: 'operater' }, ADMIN);

    expect((await adminPost(`/admin/korisnici/${k.korisnikId}/deaktiviraj`)).status).toBe(303);
    expect(await db.prepare('SELECT aktivan FROM korisnik WHERE id = ?').bind(k.korisnikId).first('aktivan')).toBe(0);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM korisnik_sesije WHERE korisnik_id = ?').bind(k.korisnikId).first('n')).toBe(0);
    expect(await getSession(testEnv, k.cookie)).toBeNull();
    expect(await provjeri(testEnv, np.token)).toBeNull();
    expect(await provjeri(testEnv, tp.token)).toBeNull();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM korisnik_passkeys WHERE korisnik_id = ?').bind(k.korisnikId).first('n')).toBe(1);
    // Članstvo u tenantu ostaje (deaktiviran je račun, ne članstvo).
    expect(await db.prepare('SELECT aktivan FROM korisnik_tenant WHERE tenant_id = ? AND lower(user_email) = ?').bind(k.t.tenant.id, k.email).first('aktivan')).toBe(1);
    // Novi passkey deaktiviranom: 409.
    expect((await adminPost(`/admin/korisnici/${k.korisnikId}/novi-passkey`)).status).toBe(409);

    // Ponovljena deaktivacija ne ostavlja zapis.
    await adminPost(`/admin/korisnici/${k.korisnikId}/deaktiviraj`);
    expect((await adminPost(`/admin/korisnici/${k.korisnikId}/aktiviraj`)).status).toBe(303);
    expect(await db.prepare('SELECT aktivan FROM korisnik WHERE id = ?').bind(k.korisnikId).first('aktivan')).toBe(1);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM korisnik_passkeys WHERE korisnik_id = ?').bind(k.korisnikId).first('n')).toBe(1);

    const z = await zapisi(k.email);
    const deakt = z.find((x) => x.radnja === 'korisnik.deaktiviran')!;
    expect(JSON.parse(deakt.detalji!)).toEqual({ sesijaObrisano: 2, pozivnicaOpozvano: 2 });
    expect(z.filter((x) => x.radnja.startsWith('korisnik.')).map((x) => x.radnja)).toEqual(['korisnik.deaktiviran', 'korisnik.aktiviran']);
  });

  it('članstvo u tenantu: admin deaktivira i vlasnika (opoziv pozivnica u tenantu) i vraća ga bez pozivnice', async () => {
    const k = await korisnikSPasskeyem('vlasnik');
    const kt = await db.prepare('SELECT id FROM korisnik_tenant WHERE tenant_id = ? AND lower(user_email) = ?').bind(k.t.tenant.id, k.email).first<{ id: number }>();
    const np = await izdaj(testEnv, { email: k.email, korisnikId: k.korisnikId }, ADMIN); // nije za tenant: ostaje
    const baza = `/admin/tenant/${k.t.tenant.id}/korisnici/${kt!.id}`;
    expect((await adminPost(`${baza}/deaktiviraj`)).status).toBe(303);
    expect(await db.prepare('SELECT aktivan FROM korisnik_tenant WHERE id = ?').bind(kt!.id).first('aktivan')).toBe(0);
    expect(await provjeri(testEnv, np.token)).not.toBeNull();
    expect((await adminPost(`${baza}/aktiviraj`)).status).toBe(303);
    expect(await db.prepare('SELECT aktivan FROM korisnik_tenant WHERE id = ?').bind(kt!.id).first('aktivan')).toBe(1);
    expect((await zapisi(k.email)).filter((x) => x.radnja.startsWith('clanstvo.'))).toMatchObject([
      { radnja: 'clanstvo.deaktivirano', tenant_id: k.t.tenant.id }, { radnja: 'clanstvo.aktivirano', tenant_id: k.t.tenant.id },
    ]);
  });
});

describe('/admin — stari obrazac bez pozivnice uklonjen', () => {
  it('POST /admin/tenant/:id/korisnici više ne postoji; detalj tenanta ima „Korisnici dashboarda”', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const email = noviEmail();
    expect((await adminPost(`/admin/tenant/${t.tenant.id}/korisnici`, { email, uloga: 'vlasnik' })).status).toBe(404);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM korisnik_tenant WHERE user_email = ?').bind(email).first('n')).toBe(0);
    const html = await (await adminGet(`/admin/tenant/${t.tenant.id}`)).text();
    expect(html).toContain('Korisnici dashboarda');
    expect(html).not.toContain('Dodaj pristup');
    expect((await adminGet('/admin/korisnici')).status).toBe(200);
  });
});
