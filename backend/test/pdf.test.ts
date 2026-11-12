// Korak 8 (§4): generirajRacunPdf kroz GET /api/v1/racun/:id/pdf.
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, type TestniTenant } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

async function pdf(t: TestniTenant, id: number) {
  const r = await poziv(`/api/v1/racun/${id}/pdf`, { kljuc: t.kljuc });
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toContain('application/pdf');
  const bajtovi = new Uint8Array(await r.arrayBuffer());
  expect(new TextDecoder().decode(bajtovi.subarray(0, 5))).toBe('%PDF-');
  return PDFDocument.load(bajtovi);
}

async function izdaj(t: TestniTenant, tijelo: Record<string, unknown>) {
  const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(tijelo) });
  const d = await json(r);
  expect(r.status, JSON.stringify(d).slice(0, 300)).toBe(201);
  return d;
}

describe('PDF računa', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('fiskalni B2C: jedna stranica', async () => {
    const t = await napraviTenanta();
    const r = await izdaj(t, b2cTijelo(t));
    expect((await pdf(t, r.id)).getPageCount()).toBe(1);
  });

  it('RACUN sa 60 stavki: više stranica', async () => {
    const t = await napraviTenanta();
    const stavke = Array.from({ length: 60 }, (_, i) => ({ naziv: `Artikl ${i + 1}`, kolicina: '1', netoCijena: '1.00', pdvStopa: '25' }));
    const r = await izdaj(t, { ...b2cTijelo(t, { stavke }), tip: 'RACUN', nacinPlacanja: 'TRANSAKCIJSKI' });
    expect((await pdf(t, r.id)).getPageCount()).toBeGreaterThan(1);
  });

  it('storno (negativan iznos) se generira', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t, b2cTijelo(t));
    const s = await poziv(`/api/v1/racun/${original.id}/storno`, { method: 'POST', kljuc: t.kljuc, body: '{}' });
    const storno = await json(s);
    expect(s.status, JSON.stringify(storno)).toBe(201);
    expect((await pdf(t, storno.id)).getPageCount()).toBe(1);
  });
});
