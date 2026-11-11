import { beforeEach, describe, expect, it } from 'vitest';
import { getTenant } from '../src/db';
import { adminSkripta, b2cTijelo, napraviTenanta, poziv, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisNedostupan, cisVracaJir } from './pomocno/cis-mock';

const db = testEnv.DB;
const AUTH = adminSkripta();
const ORIGIN = 'https://fiskal-test.domovina.ai';

function adminPost(putanja: string, polja: Record<string, string> = {}, zaglavlja: Record<string, string> = { Origin: ORIGIN }) {
  return poziv(putanja, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/x-www-form-urlencoded', ...zaglavlja },
    body: new URLSearchParams(polja).toString(),
  });
}

const izdaj = (t: TestniTenant) => poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });

const podaciTenanta = (t: TestniTenant, izmjene: Record<string, string> = {}) => ({
  naziv: t.tenant.naziv, ulica: 'Ilica 1', mjesto: 'Zagreb', postanski_broj: '10000', iban: t.tenant.iban ?? '',
  email: '', u_sustavu_pdv: t.tenant.u_sustavu_pdv ? '1' : '0', oznaka_slijednosti: t.tenant.oznaka_slijednosti_def, ...izmjene,
});

describe('Izmjena tenanta (4.5)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('slobodna polja (naziv, IBAN, e-mail) se mijenjaju i nakon izdanih dokumenata', async () => {
    const t = await napraviTenanta();
    expect((await izdaj(t)).status).toBe(201);
    const r = await adminPost(`/admin/tenant/${t.tenant.id}/uredi`, podaciTenanta(t, { naziv: 'MARCIDEA d.o.o.', email: 'Info@Crosulja.hr', iban: 'hr12 1001 0051 8630 0016 0' }));
    expect(r.status).toBe(303);
    expect(await getTenant(db, t.tenant.id)).toMatchObject({ naziv: 'MARCIDEA d.o.o.', email: 'info@crosulja.hr', iban: 'HR1210010051863000160' });
  });

  it('PDV status / slijednost: dopušteno bez izdanih dokumenata, 409 nakon prvog', async () => {
    const t = await napraviTenanta();
    expect((await adminPost(`/admin/tenant/${t.tenant.id}/uredi`, podaciTenanta(t, { oznaka_slijednosti: 'N' }))).status).toBe(303);
    expect((await getTenant(db, t.tenant.id))!.oznaka_slijednosti_def).toBe('N');
    await adminPost(`/admin/tenant/${t.tenant.id}/uredi`, podaciTenanta(t, { oznaka_slijednosti: 'P' }));
    expect((await izdaj(t)).status).toBe(201);
    const r = await adminPost(`/admin/tenant/${t.tenant.id}/uredi`, podaciTenanta(t, { u_sustavu_pdv: '0', naziv: 'Novo ime' }));
    expect(r.status).toBe(409);
    expect(await r.text()).toContain('ne mogu se mijenjati jer tenant već ima izdane dokumente');
    expect(await getTenant(db, t.tenant.id)).toMatchObject({ u_sustavu_pdv: 1, naziv: t.tenant.naziv });
  });
});

describe('Deaktivacije (4.5)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('uređaj, operater i prostor: deaktivacija → 409 pri izdavanju, aktivacija vraća', async () => {
    const t = await napraviTenanta();
    const uredaj = await db.prepare(`SELECT id FROM naplatni_uredaj WHERE poslovni_prostor_id = ?`).bind(t.prostorId).first<{ id: number }>();
    const operater = await db.prepare(`SELECT id FROM operater WHERE tenant_id = ?`).bind(t.tenant.id).first<{ id: number }>();
    const baza = `/admin/tenant/${t.tenant.id}`;

    expect((await adminPost(`${baza}/uredjaji/${uredaj!.id}/deaktiviraj`)).status).toBe(303);
    expect((await izdaj(t)).status).toBe(409);
    await adminPost(`${baza}/uredjaji/${uredaj!.id}/aktiviraj`);

    await adminPost(`${baza}/operateri/${operater!.id}/deaktiviraj`);
    expect((await izdaj(t)).status).toBe(409);
    await adminPost(`${baza}/operateri/${operater!.id}/aktiviraj`);

    await adminPost(`${baza}/prostori/${t.prostorId}/zatvori`);
    expect((await izdaj(t)).status).toBe(409);
    await adminPost(`${baza}/prostori/${t.prostorId}/otvori`);
    expect((await izdaj(t)).status).toBe(201);

    // Postojeća ruta CIS statusa i dalje radi (nije presretnuta).
    expect((await adminPost(`${baza}/prostori/${t.prostorId}/cis-status`, { status: 'prijavljen' })).status).toBe(303);
  });

  it('tuđi tenant ne može deaktivirati uređaj drugog tenanta', async () => {
    const a = await napraviTenanta();
    const b = await napraviTenanta();
    const uredajB = await db.prepare(`SELECT id FROM naplatni_uredaj WHERE poslovni_prostor_id = ?`).bind(b.prostorId).first<{ id: number }>();
    await adminPost(`/admin/tenant/${a.tenant.id}/uredjaji/${uredajB!.id}/deaktiviraj`);
    expect((await izdaj(b)).status).toBe(201);
  });

  it('API ključ: aktivan se ne briše (409); deaktiviran se briše', async () => {
    const t = await napraviTenanta();
    const k = await db.prepare(`SELECT id FROM api_kljuc WHERE tenant_id = ?`).bind(t.tenant.id).first<{ id: number }>();
    const baza = `/admin/tenant/${t.tenant.id}/kljucevi/${k!.id}`;
    expect((await adminPost(`${baza}/obrisi`)).status).toBe(409);
    await adminPost(`${baza}/deaktiviraj`);
    expect((await adminPost(`${baza}/obrisi`)).status).toBe(303);
    expect(await db.prepare(`SELECT COUNT(*) AS n FROM api_kljuc WHERE id = ?`).bind(k!.id).first<{ n: number }>()).toMatchObject({ n: 0 });
    expect((await poziv('/api/v1/racun', { kljuc: t.kljuc })).status).toBe(401);
  });
});

describe('CSRF (4.5)', () => {
  // Skripta (bearer) ne nosi kolačić pa nema CSRF rizika — prolazi bez Origina.
  // Preglednička sesija: tests u admin-prijava.test.ts. Prijelazni Basic Auth: stara blaga provjera.
  it('Basic Auth (prijelazno): tuđi origin / cross-site → 403; isti origin i curl → prolazi', async () => {
    const t = await napraviTenanta();
    const putanja = `/admin/tenant/${t.tenant.id}/uredi`;
    const podaci = podaciTenanta(t);
    const basic = { Authorization: `Basic ${btoa(`${testEnv.ADMIN_USER}:${testEnv.ADMIN_PASS}`)}` };
    const post = (z: Record<string, string>) =>
      poziv(putanja, { method: 'POST', headers: { ...basic, 'Content-Type': 'application/x-www-form-urlencoded', ...z }, body: new URLSearchParams(podaci).toString() });
    expect((await post({ Origin: 'https://zlo.example' })).status).toBe(403);
    expect((await post({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post({ Origin: ORIGIN })).status).toBe(303);
    expect((await post({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(303);
    expect((await post({})).status).toBe(303); // curl
  });

  it('skripta (bearer) prolazi bez Origina', async () => {
    const t = await napraviTenanta();
    expect((await adminPost(`/admin/tenant/${t.tenant.id}/uredi`, podaciTenanta(t), {})).status).toBe(303);
  });
});

// K2 (pregled 2026-10-02): admin „Novi dokument" za FISKALNI_B2C mora odmah
// izračunati ZKI i pokušati JIR, kao API — ne čekati cron sweep.
describe('Admin novi fiskalni dokument (K2)', () => {
  const forma = (t: TestniTenant) => {
    const p = new URLSearchParams({
      tip: 'FISKALNI_B2C', pp_nu: 'WEB|1', operater: t.operaterOib, nacin: 'KARTICA', akcija: 'izdaj',
    });
    p.append('st_naziv[]', 'Savjetovanje');
    p.append('st_kolicina[]', '1');
    p.append('st_cijena[]', '50.00');
    p.append('st_stopa[]', '25');
    return p.toString();
  };
  const posalji = (t: TestniTenant) =>
    poziv(`/admin/tenant/${t.tenant.id}/dokument/novi`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN },
      body: forma(t),
    });
  const zadnji = (tenantId: number) =>
    db.prepare('SELECT zki, jir, fiskal_pokusaja, fiskal_nak_dost FROM racun WHERE tenant_id = ? ORDER BY id DESC LIMIT 1')
      .bind(tenantId)
      .first<{ zki: string | null; jir: string | null; fiskal_pokusaja: number; fiskal_nak_dost: number }>();

  it('CIS radi → ZKI i JIR odmah', async () => {
    cisVracaJir();
    const t = await napraviTenanta();
    const r = await posalji(t);
    expect(r.status, await r.clone().text()).toBe(303);
    const red = await zadnji(t.tenant.id);
    expect(red?.zki).toMatch(/^[0-9a-f]{32}$/);
    expect(red?.jir).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('CIS nedostupan → ZKI odmah, čeka naknadnu dostavu', async () => {
    cisNedostupan();
    const t = await napraviTenanta();
    expect((await posalji(t)).status).toBe(303);
    const red = await zadnji(t.tenant.id);
    expect(red?.zki).toMatch(/^[0-9a-f]{32}$/);
    expect(red?.jir).toBeNull();
    expect(red).toMatchObject({ fiskal_pokusaja: 1, fiskal_nak_dost: 1 });
  });
});
