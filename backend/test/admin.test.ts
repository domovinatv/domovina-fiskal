import { beforeEach, describe, expect, it } from 'vitest';
import { getTenant } from '../src/db';
import { b2cTijelo, napraviTenanta, poziv, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

const db = testEnv.DB;
const AUTH = `Basic ${btoa(`${testEnv.ADMIN_USER}:${testEnv.ADMIN_PASS}`)}`;
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
  it('POST s tuđeg origina ili cross-site → 403; isti origin i ne-preglednik → prolazi', async () => {
    const t = await napraviTenanta();
    const putanja = `/admin/tenant/${t.tenant.id}/uredi`;
    const podaci = podaciTenanta(t);
    expect((await adminPost(putanja, podaci, { Origin: 'https://zlo.example' })).status).toBe(403);
    expect((await adminPost(putanja, podaci, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await adminPost(putanja, podaci, { Origin: ORIGIN })).status).toBe(303);
    expect((await adminPost(putanja, podaci, { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(303);
    expect((await adminPost(putanja, podaci, {})).status).toBe(303); // curl/skripte
  });
});
