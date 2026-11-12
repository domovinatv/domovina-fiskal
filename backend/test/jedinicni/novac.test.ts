// Korak 8 (§4 pregleda 2026-10-02): čiste novčane funkcije, izravno, bez D1.
import { describe, expect, it } from 'vitest';
import { izracunajIznose, type RazrijesenaStavka } from '../../src/validacija';
import {
  izCenti,
  izTisucinki,
  osnovicaStavkeCenti,
  pdvIznos,
  pomnoziCijenuKolicinu,
  uCente,
  uTisucinke,
} from '../../src/util';

const st = (netoCijena: string, kolicina: string, pdvStopa = '25', popustPosto = '0', pdvKategorija = 'S') =>
  ({ naziv: 'x', jedinicaMjere: 'H87', netoCijena, kolicina, pdvStopa, popustPosto, pdvKategorija, kpd: null, proizvodId: null }) as RazrijesenaStavka;

describe('uCente / izCenti', () => {
  it.each([
    ['500', 50000],
    ['500.00', 50000],
    ['12.5', 1250],
    ['0.01', 1],
    ['-0.5', -50],
    ['-12.34', -1234],
    [' 7.10 ', 710],
    [3, 300],
    ['99999999.99', 9999999999],
  ])('uCente(%j) = %d', (ulaz, centi) => {
    expect(uCente(ulaz, 'x')).toBe(centi);
  });

  it.each(['0.005', '1e3', '1,50', '', '-', '.5', '5.', 'abc', '1.234'])('uCente(%j) baca', (ulaz) => {
    expect(() => uCente(ulaz, 'polje')).toThrow(/polje/);
  });

  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [-5, '-0.05'],
    [-50, '-0.50'],
    [1250, '12.50'],
    [9999999999, '99999999.99'],
  ])('izCenti(%d) = %s', (centi, tekst) => {
    expect(izCenti(centi)).toBe(tekst);
  });

  it('izCenti(uCente(x)) je kanonski oblik', () => {
    expect(izCenti(uCente('10', 'x'))).toBe('10.00');
    expect(izCenti(uCente('-0.5', 'x'))).toBe('-0.50');
  });
});

describe('uTisucinke / izTisucinki', () => {
  it.each([
    ['1', 1000],
    ['0.001', 1],
    ['2.5', 2500],
    ['12.345', 12345],
    [3, 3000],
  ])('uTisucinke(%j) = %d', (ulaz, t) => {
    expect(uTisucinke(ulaz, 'kol')).toBe(t);
  });

  it.each(['0', '0.000', '-1', '1.2345', '1e3', ''])('uTisucinke(%j) baca', (ulaz) => {
    expect(() => uTisucinke(ulaz, 'kol')).toThrow(/kol/);
  });

  it.each([
    [1000, '1'],
    [2500, '2.5'],
    [1, '0.001'],
    [12340, '12.34'],
  ])('izTisucinki(%d) = %s', (t, tekst) => {
    expect(izTisucinki(t)).toBe(tekst);
  });
});

describe('pomnoziCijenuKolicinu / pdvIznos — half-up, simetrično', () => {
  it('half-up na granici …5', () => {
    expect(pomnoziCijenuKolicinu(1, 500)).toBe(1); // 0,01 × 0,5 = 0,005 → 0,01
    expect(pomnoziCijenuKolicinu(1, 499)).toBe(0);
    expect(pomnoziCijenuKolicinu(-1, 500)).toBe(-1);
    expect(pdvIznos(2, 25)).toBe(1); // 0,02 × 25 % = 0,005 → 0,01
    expect(pdvIznos(-2, 25)).toBe(-1);
    expect(pdvIznos(1, 25)).toBe(0);
  });
});

describe('osnovicaStavkeCenti', () => {
  it('cijena × količina × (1 − popust), half-up', () => {
    expect(osnovicaStavkeCenti(1999, 1500, '33.33')).toBe(1999); // 19,9910… → 19,99
    expect(osnovicaStavkeCenti(1, 500, '0')).toBe(1);
    expect(osnovicaStavkeCenti(-250, 1000, '0')).toBe(-250);
    expect(osnovicaStavkeCenti(-1, 500, '0')).toBe(-1); // simetrično, ne prema +∞
  });

  it('točno i iznad 2^53 (velik iznos × velika količina)', () => {
    // 623 904,85 € × 950,5 = 593 021 559,925 € → half-up 593 021 559,93 €.
    // U doubleu je međuumnožak 5,93·10^18 netočan i daje cent manje.
    expect(osnovicaStavkeCenti(62390485, 950500, '0')).toBe(59302155993);
  });
});

describe('izracunajIznose', () => {
  it('3 × 0,33 @ 25 %: osnovica po stavci, PDV jednom po skupini', () => {
    const r = izracunajIznose([st('0.33', '1'), st('0.33', '1'), st('0.33', '1')]);
    expect(r.neto).toBe('0.99');
    expect(r.pdv).toBe('0.25'); // 0,99 × 25 % = 0,2475 → 0,25 (po stavci bi bilo 3 × 0,08 = 0,24)
    expect(r.iznosSPdv).toBe('1.24');
    expect(r.ukupnoCenti).toBe(124);
  });

  it('popust 33,33 %', () => {
    const r = izracunajIznose([st('100.00', '1', '25', '33.33')]);
    expect(r.osnovicePoStavci).toEqual(['66.67']);
    expect(r.pdv).toBe('16.67'); // 66,67 × 25 % = 16,6675 → 16,67
  });

  it('storno: negativne cijene daju negativne iznose', () => {
    const r = izracunajIznose([st('-40.00', '2'), st('-4.00', '1')]);
    expect(r.neto).toBe('-84.00');
    expect(r.pdv).toBe('-21.00');
    expect(r.iznosSPdv).toBe('-105.00');
    expect(r.dospijevaZaPlacanje).toBe('-105.00');
  });

  it('miješane kategorije: zasebne skupine u raspodjeli', () => {
    const r = izracunajIznose([st('10.00', '1', '25'), st('10.00', '1', '13'), st('10.00', '1', '0', '0', 'Z'), st('5.00', '1', '25')]);
    expect(r.raspodjela).toEqual([
      { kategorija: 'S', stopa: '25', oporeziviIznos: '15.00', iznosPoreza: '3.75' },
      { kategorija: 'S', stopa: '13', oporeziviIznos: '10.00', iznosPoreza: '1.30' },
      { kategorija: 'Z', stopa: '0', oporeziviIznos: '10.00', iznosPoreza: '0.00' },
    ]);
    expect(r.iznosSPdv).toBe('40.05');
  });

  it('zbroj osnovicePoStavci = neto', () => {
    const r = izracunajIznose([st('0.33', '3'), st('19.99', '1.5', '13', '33.33'), st('0.01', '0.5'), st('-2.50', '1')]);
    const zbroj = r.osnovicePoStavci.reduce((a, x) => a + uCente(x, 'x'), 0);
    expect(izCenti(zbroj)).toBe(r.neto);
  });
});
