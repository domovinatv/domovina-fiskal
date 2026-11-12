// Korak 8 (§4): numeracija — utrka izdavanja skice i oznaka slijednosti
// N (po uređaju) vs P (po prostoru).
import { describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, slijed, testEnv, type TestniTenant } from './pomocno/okolina';
import { createNaplatniUredaj } from '../src/db';

const racun = (t: TestniTenant, dodatno: Record<string, unknown> = {}) =>
  JSON.stringify({ ...b2cTijelo(t), tip: 'RACUN', nacinPlacanja: 'TRANSAKCIJSKI', ...dodatno });

describe('izdavanje skice — utrka', () => {
  it('dva paralelna POST /racun/:id/izdaj → jedan 200, jedan 409, slijed bez rupe', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: racun(t, { status: 'nacrt' }) });
    const skica = await json(r);
    expect(r.status, JSON.stringify(skica)).toBe(201);

    const odgovori = await Promise.all(
      [0, 1].map(() => poziv(`/api/v1/racun/${skica.id}/izdaj`, { method: 'POST', kljuc: t.kljuc })),
    );
    expect(odgovori.map((o) => o.status).sort()).toEqual([200, 409]);
    expect(await slijed(t.tenant.id, 'racun')).toMatchObject({ n: 1, d: 1, max: 1, sekvenca: 1 });
  });
});

describe('oznaka slijednosti', () => {
  async function dvaUredjaja(oznaka: 'N' | 'P') {
    const t = await napraviTenanta({ certifikat: false });
    await testEnv.DB.prepare('UPDATE tenant SET oznaka_slijednosti_def = ? WHERE id = ?').bind(oznaka, t.tenant.id).run();
    await createNaplatniUredaj(testEnv.DB, t.prostorId, { oznaka: '2' });
    const brojevi: number[] = [];
    for (const nu of ['1', '2', '2']) {
      const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: racun(t, { naplatniUredaj: nu }) });
      const d = await json(r);
      expect(r.status, JSON.stringify(d)).toBe(201);
      const red = await testEnv.DB.prepare('SELECT redni_broj FROM racun WHERE id = ?').bind(d.id).first<{ redni_broj: number }>();
      brojevi.push(red!.redni_broj);
    }
    return brojevi;
  }

  it("'N': svaki uređaj ima svoj slijed", async () => {
    expect(await dvaUredjaja('N')).toEqual([1, 1, 2]);
  });

  it("'P': uređaji istog prostora dijele slijed", async () => {
    expect(await dvaUredjaja('P')).toEqual([1, 2, 3]);
  });
});
