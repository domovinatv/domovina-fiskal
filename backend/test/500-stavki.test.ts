// K23: validacija dopušta 500 stavki; upisiRacun ih piše u jednom D1 batchu
// (2 + 500 + n statementa). Provjera da to prolazi kroz cijeli tok.
import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, slijed, testEnv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

const stope = ['25', '13', '5', '0'];

describe('500 stavki (K23)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('fiskalni račun s 500 stavki: 201, JIR, svi retci i raspodjela upisani', async () => {
    const t = await napraviTenanta();
    const stavke = Array.from({ length: 500 }, (_, i) => ({
      naziv: `Artikl ${i + 1}`,
      kolicina: String((i % 7) + 1),
      netoCijena: `${(i % 50) + 1}.${String(i % 100).padStart(2, '0')}`,
      pdvStopa: stope[i % 4],
    }));
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stavke })) });
    const racun = await json(r);
    expect(r.status, JSON.stringify(racun).slice(0, 500)).toBe(201);
    expect(racun.fiskalizacija.status).toBe('fiskaliziran');
    expect(racun.stavke).toHaveLength(500);

    const n = await testEnv.DB
      .prepare('SELECT COUNT(*) AS n, COUNT(iznos) AS s FROM stavka WHERE racun_id = ?')
      .bind(racun.id)
      .first<{ n: number; s: number }>();
    expect(n).toEqual({ n: 500, s: 500 });
    expect(racun.pdvRaspodjela).toHaveLength(4);
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 1, d: 1, max: 1, sekvenca: 1 });
  });

  it('501 stavka → 400', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const stavke = Array.from({ length: 501 }, () => ({ naziv: 'x', kolicina: '1', netoCijena: '1.00', pdvStopa: '25' }));
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stavke })) });
    expect(r.status).toBe(400);
  });
});
