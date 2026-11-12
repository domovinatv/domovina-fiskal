// K21 (pregled 2026-10-02): prijenos porezne obveze ('AE') je B2B mehanizam i
// ne smije na fiskalni B2C račun — ni kad kategorija dolazi iz kataloga
// proizvoda, ne iz payloada. Odbijanje ide PRIJE trošenja broja iz slijeda.
import { beforeEach, describe, expect, it } from 'vitest';
import { createProizvod } from '../src/db';
import { cisVracaJir } from './pomocno/cis-mock';
import { b2cTijelo, json, napraviTenanta, poziv, slijed, testEnv } from './pomocno/okolina';

const AE_PORUKA = /prijenos porezne obveze \('AE'\) je B2B mehanizam/;

describe("AE na fiskalnom B2C računu (K21)", () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it("AE u payloadu → 400, broj nije potrošen", async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify(b2cTijelo(t, { stavke: [{ naziv: 'Usluga', kolicina: '1', netoCijena: '100.00', pdvStopa: '0', pdvKategorija: 'AE' }] })),
    });
    const tijelo = await json(r);
    expect(r.status, JSON.stringify(tijelo)).toBe(400);
    expect(tijelo.detalji[0]).toMatchObject({ polje: 'stavke.0.pdvKategorija', poruka: expect.stringMatching(AE_PORUKA) });
    expect((await slijed(t.tenant.id)).n).toBe(0);
  });

  it("AE iz kataloga proizvoda → 400, broj nije potrošen", async () => {
    const t = await napraviTenanta();
    const p = await createProizvod(testEnv.DB, t.tenant.id, {
      naziv: 'Građevinska usluga (prijenos obveze)',
      jedinicaMjere: 'H87',
      netoCijena: '100.00',
      pdvStopa: '0',
      pdvKategorija: 'AE',
      kpd: '43.99.90',
    });
    const r = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify(b2cTijelo(t, { stavke: [{ proizvodId: p.id, kolicina: '1' }] })),
    });
    const tijelo = await json(r);
    expect(r.status, JSON.stringify(tijelo)).toBe(400);
    expect(tijelo.detalji[0]).toMatchObject({ polje: 'stavke.0.pdvKategorija', poruka: expect.stringMatching(AE_PORUKA) });
    expect((await slijed(t.tenant.id)).n).toBe(0);
  });
});
