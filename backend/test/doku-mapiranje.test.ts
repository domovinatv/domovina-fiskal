// Korak 8 (§4): mapirajZaDoku — taxCategory, kupac, obvezna polja eRačuna.
import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';
import { getRacunKontekst } from '../src/db';
import { mapirajZaDoku } from '../src/eracun/mapiranje';

const KUPAC = { naziv: 'Kupac d.o.o.', oib: '69435151530' };

async function mapiraj(t: TestniTenant, dodatno: Record<string, unknown> = {}) {
  const r = await poziv('/api/v1/racun', {
    method: 'POST',
    kljuc: t.kljuc,
    body: JSON.stringify({
      ...b2cTijelo(t, {
        stavke: [
          { naziv: 'Usluga', kolicina: '1', netoCijena: '100.00', pdvStopa: '25', kpd: '70.22.11' },
          { naziv: 'Knjiga', kolicina: '1', netoCijena: '10.00', pdvStopa: '0', kpd: '58.11.11' },
        ],
      }),
      tip: 'RACUN',
      nacinPlacanja: 'TRANSAKCIJSKI',
      kupac: KUPAC,
      ...dodatno,
    }),
  });
  const racun = await json(r);
  expect(r.status, JSON.stringify(racun)).toBe(201);
  return mapirajZaDoku((await getRacunKontekst(testEnv.DB, t.tenant.id, racun.id))!);
}

describe('mapirajZaDoku', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it("PDV obveznik: 'S-25' i 'Z', kupac HR+OIB, prodavatelj HR+OIB", async () => {
    const t = await napraviTenanta({ certifikat: false });
    const m = await mapiraj(t);
    if (!('invoice' in m)) throw new Error(m.greska);
    expect(m.invoice.lines.map((l) => l.item.taxCategory)).toEqual(['S-25', 'Z']);
    expect(JSON.stringify(m.invoice)).toContain(`"taxCompanyID":"HR${KUPAC.oib}"`);
    expect(JSON.stringify(m.invoice)).toContain(`"taxCompanyID":"HR${t.tenant.oib}"`);
  });

  it('stavka bez KPD → greška HR-BR-25', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const m = await mapiraj(t, { stavke: [{ naziv: 'Bez KPD', kolicina: '1', netoCijena: '1.00', pdvStopa: '25' }] });
    expect('greska' in m && m.greska).toMatch(/KPD.*Bez KPD/);
  });

  it('transakcijsko plaćanje bez IBAN-a → greška BR-61', async () => {
    const t = await napraviTenanta({ certifikat: false });
    await testEnv.DB.prepare('UPDATE tenant SET iban = NULL WHERE id = ?').bind(t.tenant.id).run();
    const m = await mapiraj(t);
    expect('greska' in m && m.greska).toMatch(/IBAN/);
  });

  it('bez kupca → greška', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const m = await mapiraj(t, { kupac: undefined });
    expect('greska' in m && m.greska).toMatch(/kupca s OIB-om/);
  });
});
