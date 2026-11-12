// K15 (pregled 2026-10-02): iznos retka (osnovica nakon popusta) računa se
// jednom, pri izdavanju, i sprema u `stavka.iznos`; PDF, API i admin ga čitaju.
// Migracija 0012 backfilla postojeće retke SQL-om koji mora dati isti rezultat
// kao `izracunajIznose` (half-up po stavci, negativni iznosi za storno).
// K19: zastarjeli indeksi `ix_racun_ceka_jir` i `ix_racun_eracun_ceka` uklonjeni.
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';
import { izracunajIznose, type RazrijesenaStavka } from '../src/validacija';

const stavke = [
  { naziv: 'Tri po 0,33', kolicina: '3', netoCijena: '0.33', pdvStopa: '25' },
  { naziv: 'S popustom', kolicina: '1.5', netoCijena: '19.99', popustPosto: '33.33', pdvStopa: '13' },
  { naziv: 'Pola centa', kolicina: '0.5', netoCijena: '0.01', pdvStopa: '25' },
  { naziv: 'Rabat', kolicina: '1', netoCijena: '-2.50', pdvStopa: '25' },
];

async function iznosiStavki(racunId: number) {
  const r = await testEnv.DB
    .prepare('SELECT iznos FROM stavka WHERE racun_id = ? ORDER BY redni_broj')
    .bind(racunId)
    .all<{ iznos: string | null }>();
  return r.results.map((x) => x.iznos);
}

// Backfill iz migracije 0012 — isti tekst koji se izvodi na TEST/PROD.
function backfillSql(): string {
  const m = (env.TEST_MIGRACIJE as { name: string; queries: string[] }[]).find((x) => x.name.startsWith('0012'));
  if (!m) throw new Error('Migracija 0012 ne postoji');
  const q = m.queries.find((x) => /UPDATE\s+stavka/i.test(x));
  if (!q) throw new Error('Migracija 0012 nema backfill stavka.iznos');
  return q;
}

describe('stavka.iznos (K15)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('izdavanje upisuje iznos retka = izracunajIznose().osnovicePoStavci', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stavke })) });
    const racun = await json(r);
    expect(r.status, JSON.stringify(racun)).toBe(201);
    // 3 × 0,33 = 0,99; 1,5 × 19,99 × 0,6667 = 19,9910… → 19,99; 0,5 × 0,01 = 0,005 → 0,01; −2,50
    expect(await iznosiStavki(racun.id)).toEqual(['0.99', '19.99', '0.01', '-2.50']);
    expect(racun.stavke.map((s: { iznos: string }) => s.iznos)).toEqual(['0.99', '19.99', '0.01', '-2.50']);
  });

  it('backfill iz migracije 0012 daje isto što i izracunajIznose', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stavke })) });
    const racun = await json(r);
    expect(r.status).toBe(201);

    // Dodatni retci izravno u bazu: rubne količine, cijene i popusti.
    const kombinacije: { kolicina: string; netoCijena: string; popustPosto: string }[] = [];
    for (const kolicina of ['1', '3', '0.001', '2.5', '12.345', '1000']) {
      for (const netoCijena of ['0.01', '0.33', '19.99', '-40.00', '1234567.89', '-0.05']) {
        for (const popustPosto of ['0', '5.5', '33.33', '99.99']) kombinacije.push({ kolicina, netoCijena, popustPosto });
      }
    }
    let rb = 100;
    for (const k of kombinacije) {
      await testEnv.DB
        .prepare(
          `INSERT INTO stavka (racun_id, redni_broj, naziv, kolicina, jedinica_mjere, neto_cijena, popust_posto, pdv_kategorija, pdv_stopa)
           VALUES (?, ?, 'x', ?, 'H87', ?, ?, 'S', '25')`,
        )
        .bind(racun.id, rb++, k.kolicina, k.netoCijena, k.popustPosto)
        .run();
    }

    await testEnv.DB.prepare('UPDATE stavka SET iznos = NULL WHERE racun_id = ?').bind(racun.id).run();
    await testEnv.DB.prepare(backfillSql()).run();

    const ocekivano = izracunajIznose(
      [...stavke.map((s) => ({ popustPosto: '0', ...s })), ...kombinacije].map(
        (s) => ({ ...s, pdvKategorija: 'S', pdvStopa: '25' }) as RazrijesenaStavka,
      ),
    ).osnovicePoStavci;
    expect(await iznosiStavki(racun.id)).toEqual(ocekivano);
  });

  it('backfill ne dira retke koji već imaju iznos', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stavke })) });
    const racun = await json(r);
    await testEnv.DB.prepare(`UPDATE stavka SET iznos = '7.77' WHERE racun_id = ? AND redni_broj = 1`).bind(racun.id).run();
    await testEnv.DB.prepare(backfillSql()).run();
    expect((await iznosiStavki(racun.id))[0]).toBe('7.77');
  });
});

describe('zastarjeli indeksi (K19)', () => {
  it('ix_racun_ceka_jir i ix_racun_eracun_ceka ne postoje, ix_racun_sweep postoji', async () => {
    const r = await testEnv.DB
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'ix_racun_%'`)
      .all<{ name: string }>();
    const imena = r.results.map((x) => x.name);
    expect(imena).not.toContain('ix_racun_ceka_jir');
    expect(imena).not.toContain('ix_racun_eracun_ceka');
    expect(imena).toContain('ix_racun_sweep');
  });
});
