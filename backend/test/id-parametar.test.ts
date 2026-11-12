// K13: neispravan :id u putanji → 400 na API-ju (kao ostale API rute), 404 u
// adminu — nikad D1 bind(NaN) i 500.
import { describe, expect, it } from 'vitest';
import { adminSkripta, napraviTenanta, poziv } from './pomocno/okolina';

const LOSI = ['abc', '0', '-1', '1.5', '99999999999999999999'];

describe('K13: validacija :id', () => {
  it('API: pdf, posalji i ostale :id rute → 400', async () => {
    const t = await napraviTenanta({ certifikat: false });
    for (const los of LOSI) {
      for (const [metoda, putanja] of [
        ['GET', `/api/v1/racun/${los}`],
        ['GET', `/api/v1/racun/${los}/pdf`],
        ['POST', `/api/v1/racun/${los}/posalji`],
        ['POST', `/api/v1/racun/${los}/fiskaliziraj`],
        ['POST', `/api/v1/racun/${los}/izdaj`],
        ['POST', `/api/v1/racun/${los}/storno`],
        ['POST', `/api/v1/racun/${los}/posalji-eracun`],
        ['GET', `/api/v1/racun/${los}/eracun-status`],
      ]) {
        const r = await poziv(putanja, { method: metoda, kljuc: t.kljuc, ...(metoda === 'POST' ? { body: '{}' } : {}) });
        expect(r.status, `${metoda} ${putanja}`).toBe(400);
      }
    }
  });

  it('admin: neispravan id → 404, ne 500', async () => {
    for (const los of LOSI) {
      for (const [metoda, putanja] of [
        ['GET', `/admin/tenant/${los}`],
        ['GET', `/admin/tenant/${los}/dokument/novi`],
        ['GET', `/admin/racun/${los}`],
        ['GET', `/admin/racun/${los}/pdf`],
        ['POST', `/admin/racun/${los}/izdaj`],
        ['POST', `/admin/tenant/${los}/prostori`],
        ['POST', `/admin/tenant/1/kljucevi/${los}/deaktiviraj`],
        ['POST', `/admin/tenant/1/korisnici/${los}/deaktiviraj`],
        ['POST', `/admin/tenant/1/prostori/${los}/cis-status`],
      ]) {
        const r = await poziv(putanja, { method: metoda, headers: { Authorization: adminSkripta() } });
        expect(r.status, `${metoda} ${putanja}`).toBe(404);
      }
    }
  });
});
