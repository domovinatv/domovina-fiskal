import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, slijed } from './pomocno/okolina';
import { cisNedostupan, cisVracaJir } from './pomocno/cis-mock';


describe('FISKALNI_B2C izdavanje', () => {
  let poslano: string[];
  beforeEach(() => {
    poslano = cisVracaJir();
  });

  it('KARTICA → NacinPlac=K u potpisanom XML-u, JIR i ZKI u odgovoru', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
    const racun = await json(r);
    expect(r.status, JSON.stringify(racun)).toBe(201);
    expect(racun.zki).toMatch(/^[0-9a-f]{32}$/);
    expect(racun.jir).toMatch(/^[0-9a-f-]{36}$/);
    expect(racun.fiskalizacija.status).toBe('fiskaliziran');
    expect(poslano).toHaveLength(1);
    expect(poslano[0]).toContain('<tns:NacinPlac>K</tns:NacinPlac>');
    expect(poslano[0]).toContain('<tns:IznosUkupno>105.00</tns:IznosUkupno>');
    expect(poslano[0]).toContain(`<tns:Oib>${t.tenant.oib}</tns:Oib>`);
  });

  it('20 paralelnih POST-ova → brojevi 1–20 bez rupa i duplikata', async () => {
    const t = await napraviTenanta();
    const odgovori = await Promise.all(
      Array.from({ length: 20 }, () => poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) })),
    );
    expect(odgovori.map((o) => o.status)).toEqual(Array(20).fill(201));
    const brojevi = (await Promise.all(odgovori.map((o) => json(o)))).map((r) => r.redniBroj).sort((a, b) => a - b);
    expect(brojevi).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 20, d: 20, max: 20, sekvenca: 20 });
  });

  it('CIS nedostupan → račun izdan sa ZKI-jem, čeka JIR (naknadna dostava)', async () => {
    cisNedostupan();
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
    expect(r.status).toBe(201);
    const racun = await json(r);
    expect(racun.zki).toMatch(/^[0-9a-f]{32}$/);
    expect(racun.jir).toBeNull();
    expect(racun.fiskalizacija).toMatchObject({ status: 'ceka_jir', automatskiRetry: true });
    expect(racun.naknadnaDostava).toBe(true);
  });
});
