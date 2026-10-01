import { beforeEach, describe, expect, it } from 'vitest';
import { getRacun, jeSukobReference, upisiRacun, type NoviRacun } from '../src/db';
import { b2cTijelo, json, napraviTenanta, poziv, slijed, testEnv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

const post = (kljuc: string, tijelo: unknown, zaglavlja: Record<string, string> = {}) =>
  poziv('/api/v1/racun', { method: 'POST', kljuc, body: JSON.stringify(tijelo), headers: zaglavlja });

describe('Idempotencija (vanjskaReferenca / Idempotency-Key)', () => {
  let poslano: string[];
  beforeEach(() => {
    poslano = cisVracaJir();
  });

  it('isti ključ ×10 paralelno → 1 račun, ostali 200 replay, broj potrošen jednom, 1 CIS poziv', async () => {
    const t = await napraviTenanta();
    const tijelo = b2cTijelo(t, { vanjskaReferenca: 'CRO-2026-0201' });
    const odgovori = await Promise.all(Array.from({ length: 10 }, () => post(t.kljuc, tijelo)));
    const statusi = odgovori.map((o) => o.status).sort();
    expect(statusi).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    for (const o of odgovori.filter((o) => o.status === 200)) expect(o.headers.get('Idempotent-Replay')).toBe('true');
    const ids = new Set((await Promise.all(odgovori.map((o) => json(o)))).map((r) => r.id));
    expect(ids.size).toBe(1);
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 1, max: 1, sekvenca: 1 });
    expect(poslano).toHaveLength(1);
  });

  it('ponovljeni zahtjev nakon izdavanja → 200 s istim računom, bez ponovne fiskalizacije', async () => {
    const t = await napraviTenanta();
    const tijelo = b2cTijelo(t, { vanjskaReferenca: 'CRO-1' });
    const prvi = await json(await post(t.kljuc, tijelo));
    // Isti sadržaj, drukčiji redoslijed polja i oblik brojeva → isti hash.
    const drugi = await post(t.kljuc, { ...tijelo, stavke: tijelo.stavke.map(({ pdvStopa: _p, ...s }) => ({ pdvStopa: 25, ...s })) });
    expect(drugi.status).toBe(200);
    const r = await json(drugi);
    expect(r.id).toBe(prvi.id);
    expect(r.jir).toBe(prvi.jir);
    expect(r.fiskalizacija.status).toBe('fiskaliziran');
    expect(poslano).toHaveLength(1);
  });

  it('isti ključ, drugi sadržaj → 409 s racunId, broj nije potrošen', async () => {
    const t = await napraviTenanta();
    const prvi = await json(await post(t.kljuc, b2cTijelo(t, { vanjskaReferenca: 'CRO-2' })));
    const drugi = await post(t.kljuc, b2cTijelo(t, { vanjskaReferenca: 'CRO-2', nacinPlacanja: 'GOTOVINA' }));
    expect(drugi.status).toBe(409);
    expect(await json(drugi)).toMatchObject({ greska: 'vanjskaReferenca je već iskorištena za drukčiji račun', racunId: prvi.id });
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 1, sekvenca: 1 });
  });

  it('Idempotency-Key zaglavlje radi kao polje; različiti zaglavlje i polje → 400', async () => {
    const t = await napraviTenanta();
    const a = await post(t.kljuc, b2cTijelo(t), { 'Idempotency-Key': 'CRO-3' });
    expect(a.status).toBe(201);
    expect((await json(a)).vanjskaReferenca).toBe('CRO-3');
    const b = await post(t.kljuc, b2cTijelo(t, { vanjskaReferenca: 'CRO-3' }));
    expect(b.status).toBe(200);
    const c = await post(t.kljuc, b2cTijelo(t, { vanjskaReferenca: 'CRO-4' }), { 'Idempotency-Key': 'CRO-5' });
    expect(c.status).toBe(400);
    const d = await post(t.kljuc, b2cTijelo(t), { 'Idempotency-Key': 'ima razmak' });
    expect(d.status).toBe(400);
  });

  it('GET ?vanjskaReferenca → točno jedan račun ili 404; ključ je po tenantu', async () => {
    const t = await napraviTenanta();
    const drugi = await napraviTenanta();
    const r = await json(await post(t.kljuc, b2cTijelo(t, { vanjskaReferenca: 'CRO-6' })));
    const g = await poziv('/api/v1/racun?vanjskaReferenca=CRO-6', { kljuc: t.kljuc });
    expect(g.status).toBe(200);
    expect((await json(g)).id).toBe(r.id);
    expect((await poziv('/api/v1/racun?vanjskaReferenca=NEMA', { kljuc: t.kljuc })).status).toBe(404);
    // Drugi tenant ne vidi tuđu referencu i smije koristiti isti ključ.
    expect((await poziv('/api/v1/racun?vanjskaReferenca=CRO-6', { kljuc: drugi.kljuc })).status).toBe(404);
    expect((await post(drugi.kljuc, b2cTijelo(drugi, { vanjskaReferenca: 'CRO-6' }))).status).toBe(201);
  });

  it('vrijedi i za nefiskalne dokumente (PONUDA)', async () => {
    const t = await napraviTenanta();
    const tijelo = { tip: 'PONUDA', poslovniProstor: 'WEB', naplatniUredaj: '1', vanjskaReferenca: 'P-1', stavke: [{ naziv: 'X', netoCijena: '10', pdvStopa: '25' }] };
    expect((await post(t.kljuc, tijelo)).status).toBe(201);
    expect((await post(t.kljuc, tijelo)).status).toBe(200);
    expect(await slijed(t.tenant.id, 'ponuda')).toMatchObject({ n: 1, sekvenca: 1 });
  });

  it('utrka na razini baze: drugi INSERT padne na UNIQUE i vrati cijeli batch (sekvenca bez rupe)', async () => {
    const t = await napraviTenanta();
    const pp = await testEnv.DB.prepare(`SELECT id FROM poslovni_prostor WHERE tenant_id = ?`).bind(t.tenant.id).first<{ id: number }>();
    const nu = await testEnv.DB.prepare(`SELECT id FROM naplatni_uredaj WHERE poslovni_prostor_id = ?`).bind(pp!.id).first<{ id: number }>();
    const novi: NoviRacun = {
      tenantId: t.tenant.id, poslovniProstorId: pp!.id, naplatniUredajId: nu!.id, operaterId: null, kupacId: null,
      oznakaSlijednosti: 'P', oznPP: 'WEB', oznNU: '1', godina: 2026, datumVrijeme: new Date().toISOString(),
      tipDokumenta: 'racun', sekvencaVrsta: 'racun', valuta: 'EUR', nacinPlacanja: 'kartica',
      datumDospijeca: null, vrijediDo: null, datumIsporuke: null, napomena: null, internaBiljeska: null, uvjeti: null,
      klauzulaPdv: null, neto: '1.00', iznosBezPdv: '1.00', pdv: '0.25', iznosSPdv: '1.25', dospijevaZaPlacanje: '1.25',
      status: 'izdano', stavke: [{ naziv: 'X', kolicina: '1', jedinicaMjere: 'H87', netoCijena: '1.00', popustPosto: '0', pdvKategorija: 'S', pdvStopa: '25' }],
      pdvRaspodjela: [{ kategorija: 'S', stopa: '25', oporeziviIznos: '1.00', iznosPoreza: '0.25' }],
      vanjskaReferenca: 'UTRKA-1', zahtjevHash: 'h',
    };
    const prvi = await upisiRacun(testEnv.DB, novi);
    const greska = await upisiRacun(testEnv.DB, novi).catch((e) => e);
    expect(jeSukobReference(greska)).toBe(true);
    expect(await slijed(t.tenant.id, 'racun')).toMatchObject({ n: 1, max: 1, sekvenca: 1 });
    expect(await getRacun(testEnv.DB, t.tenant.id, prvi.id)).toMatchObject({ redni_broj: 1 });
    // Sljedeći račun dobiva broj 2 — nema rupe.
    const treci = await upisiRacun(testEnv.DB, { ...novi, vanjskaReferenca: 'UTRKA-2' });
    expect(treci.redni_broj).toBe(2);
  });
});
