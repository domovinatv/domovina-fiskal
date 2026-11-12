// K14: racun.status = 'fiskaliziran' znači samo B2C s JIR-om. eRačun (doku)
// ostaje 'poslan'; FISCALIZED/DELIVERED je u eracun_status. Migracija 0012
// prevodi postojeće eRačune 'fiskaliziran' → 'poslan'.
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';
import { statusRacunaIzDoku } from '../src/eracun/eracun';

function sql0012Racun(): string {
  const m = (env.TEST_MIGRACIJE as { name: string; queries: string[] }[]).find((x) => x.name.startsWith('0012'));
  const q = m?.queries.find((x) => /UPDATE\s+racun/i.test(x));
  if (!q) throw new Error('Migracija 0012 nema UPDATE racun (K14)');
  return q;
}

describe('status eRačuna (K14)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it("doku FISCALIZED/DELIVERED/IMPORTED → racun.status 'poslan'", () => {
    expect(statusRacunaIzDoku('IMPORTED')).toBe('poslan');
    expect(statusRacunaIzDoku('FISCALIZED')).toBe('poslan');
    expect(statusRacunaIzDoku('DELIVERED')).toBe('poslan');
    expect(statusRacunaIzDoku(null)).toBe('poslan');
  });

  it("migracija 0012: eRačun 'fiskaliziran' → 'poslan', B2C s JIR-om ostaje", async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
    const b2c = await json(r);
    expect(r.status).toBe(201);
    const e = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify({ ...b2cTijelo(t), tip: 'RACUN', nacinPlacanja: 'TRANSAKCIJSKI' }),
    });
    const eracun = await json(e);
    expect(e.status, JSON.stringify(eracun)).toBe(201);
    // stanje kakvo je stari kod ostavljao nakon doku FISCALIZED
    await testEnv.DB
      .prepare(`UPDATE racun SET doku_id = 999, eracun_status = 'FISCALIZED', status = 'fiskaliziran' WHERE id = ?`)
      .bind(eracun.id)
      .run();

    await testEnv.DB.prepare(sql0012Racun()).run();

    const s = async (id: number) =>
      (await testEnv.DB.prepare('SELECT status FROM racun WHERE id = ?').bind(id).first<{ status: string }>())!.status;
    expect(await s(eracun.id)).toBe('poslan');
    expect(await s(b2c.id)).toBe('fiskaliziran');
  });
});
