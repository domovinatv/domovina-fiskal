// Korak 8 (§4): mapirajZaCis — PDV raščlamba u CIS blokove i odbijanja.
import { describe, expect, it } from 'vitest';
import type { RacunKontekst } from '../../src/db';
import { mapirajZaCis } from '../../src/fiskal/fiskalizacija';
import type { PdvRaspodjelaRow, RacunRow, TenantRow } from '../../src/types';

function kontekst(
  raspodjela: [kategorija: string, stopa: string, osnovica: string, porez: string][],
  izmjene: { racun?: Partial<RacunRow>; tenant?: Partial<TenantRow>; operaterOib?: string | null; kupacOib?: string | null } = {},
): RacunKontekst {
  return {
    racun: {
      id: 1, redni_broj: 7, godina: 2026, datum_vrijeme: '2026-11-12T10:00:00.000Z', oznaka_slijednosti: 'P',
      nacin_placanja: 'kartica', iznos_s_pdv: '12.50', zki: 'a'.repeat(32),
      ...izmjene.racun,
    } as RacunRow,
    stavke: [],
    raspodjela: raspodjela.map(([kategorija_pdv, stopa, oporezivi_iznos, iznos_poreza], i) => (
      { id: i, racun_id: 1, kategorija_pdv, stopa, oporezivi_iznos, iznos_poreza } as PdvRaspodjelaRow
    )),
    tenant: { oib: '12345678903', u_sustavu_pdv: 1, ...izmjene.tenant } as TenantRow,
    ppOznaka: 'PP1',
    nuOznaka: '1',
    operaterIme: 'Op',
    operaterOib: izmjene.operaterOib === undefined ? '98765432106' : izmjene.operaterOib,
    stornoOriginal: null,
    kupac: izmjene.kupacOib === undefined ? null : ({ oib: izmjene.kupacOib } as RacunKontekst['kupac']),
  };
}

function cis(k: RacunKontekst, nakDost = false) {
  const m = mapirajZaCis(k, nakDost);
  if ('greska' in m) throw new Error(m.greska);
  return m.cis;
}

describe('mapirajZaCis', () => {
  it('S i AA idu u pdv[], bez oslobođenja', () => {
    const c = cis(kontekst([['S', '25', '10.00', '2.50'], ['AA', '13', '5.00', '0.65']]));
    expect(c.pdv).toEqual([
      { stopa: '25', osnovica: '10.00', iznos: '2.50' },
      { stopa: '13', osnovica: '5.00', iznos: '0.65' },
    ]);
    expect(c.iznosOslobPdv).toBeNull();
    expect(c.iznosNePodlOpor).toBeNull();
    expect(c).toMatchObject({ oib: '12345678903', uSustPdv: true, brOznRac: '7', oznPosPr: 'PP1', oznNapUr: '1', nacinPlac: 'K', nakDost: false });
  });

  it('Z ide u pdv[] sa stopom 0', () => {
    expect(cis(kontekst([['Z', '0', '10.00', '0.00']])).pdv).toEqual([{ stopa: '0', osnovica: '10.00', iznos: '0.00' }]);
  });

  it('E → IznosOslobPdv (zbroj skupina), O → IznosNePodlOpor, negativno za storno', () => {
    const c = cis(kontekst([['E', '0', '-40.00', '0.00'], ['E', '0', '-4.05', '0.00'], ['O', '0', '-1.00', '0.00']], { tenant: { u_sustavu_pdv: 0 } }));
    expect(c.pdv).toEqual([]);
    expect(c.iznosOslobPdv).toBe('-44.05');
    expect(c.iznosNePodlOpor).toBe('-1.00');
    expect(c.uSustPdv).toBe(false);
  });

  it('oibPrimatelja iz kupca, nakDost se prenosi', () => {
    const c = cis(kontekst([['S', '25', '10.00', '2.50']], { kupacOib: '11111111119' }), true);
    expect(c.oibPrimatelja).toBe('11111111119');
    expect(c.nakDost).toBe(true);
  });

  it.each([
    ['AE', kontekst([['AE', '0', '10.00', '0.00']]), /AE/],
    ['skica', kontekst([['S', '25', '10.00', '2.50']], { racun: { redni_broj: null } }), /skica/],
    ['bez operatera', kontekst([['S', '25', '10.00', '2.50']], { operaterOib: null }), /operatera/],
    ['nepoznat način plaćanja', kontekst([['S', '25', '10.00', '2.50']], { racun: { nacin_placanja: 'bitcoin' } }), /bitcoin/],
  ])('%s → greška', (_, k, poruka) => {
    const m = mapirajZaCis(k, false);
    expect('greska' in m && m.greska).toMatch(poruka);
  });
});
