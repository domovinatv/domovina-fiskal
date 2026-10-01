import { describe, expect, inject, it } from 'vitest';
import { parsirajP12 } from '../src/fiskal/certifikat';
import { P12_LOZINKA, TEST_OIB } from './globalni-setup';

describe('parsirajP12', () => {
  const tc = inject('testniCertifikat');
  const p12 = Uint8Array.from(atob(tc.p12B64), (z) => z.charCodeAt(0)).buffer;

  it('FINA-oblik P12 (forge popuni bag.cert, bez bag.asn1) — cert, ključ, OIB, serijski', () => {
    const p = parsirajP12(p12, P12_LOZINKA);
    expect(p.oib).toBe(TEST_OIB);
    expect(p.serialDec).toBe(tc.serialDec);
    expect(p.certPem.replace(/\s+/g, '')).toBe(tc.certPem.replace(/\s+/g, ''));
    expect(p.privatniKljucPem).toContain('BEGIN PRIVATE KEY');
    expect(p.issuerDn).toBe(tc.issuerDn);
  });

  it('kriva lozinka → jasna greška', () => {
    expect(() => parsirajP12(p12, 'kriva')).toThrow(/pogrešna lozinka|oštećena/);
  });
});
