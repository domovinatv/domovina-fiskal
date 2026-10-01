import { describe, expect, inject, it } from 'vitest';
import { izracunajZki, xmlDatum, zkiDatum } from '../src/fiskal/zki';

describe('ZKI', () => {
  const tc = inject('testniCertifikat');

  it('odgovara vektoru izračunatom neovisno (Node OpenSSL)', () => {
    expect(izracunajZki(tc.kljucPem, tc.zkiVektor.ulaz)).toBe(tc.zkiVektor.zki);
  });

  it('formati datuma: ZKI s razmakom, XML s T, zagrebačka zona', () => {
    expect(zkiDatum('2026-07-15T12:30:05.000Z')).toBe('15.07.2026 14:30:05');
    expect(xmlDatum('2026-07-15T12:30:05.000Z')).toBe('15.07.2026T14:30:05');
    expect(zkiDatum('2026-01-15T23:30:00.000Z')).toBe('16.01.2026 00:30:00'); // CET, prijelaz dana
  });
});
