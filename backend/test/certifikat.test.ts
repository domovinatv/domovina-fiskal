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

  it('AKD-oblik P12 (ECDSA-potpisan leaf: forge popuni bag.asn1, ne bag.cert)', () => {
    const akd = Uint8Array.from(atob(tc.p12AkdB64), (z) => z.charCodeAt(0)).buffer;
    const p = parsirajP12(akd, P12_LOZINKA);
    expect(p.oib).toBe(TEST_OIB);
    expect(p.serialDec).toBe(BigInt('0x7f0e0d').toString(10));
    expect(p.issuerDn).toContain('TEST EC CA');
    expect(p.certPem.replace(/\s+/g, '')).toBe(tc.certAkdPem.replace(/\s+/g, ''));
    expect(p.privatniKljucPem).toContain('BEGIN PRIVATE KEY');
  });

  it('kriva lozinka → jasna greška', () => {
    expect(() => parsirajP12(p12, 'kriva')).toThrow(/pogrešna lozinka|oštećena/);
  });
});

describe('K16: P12 se ne čuva', () => {
  it('tablica certifikat nema pkcs12_encrypted ni enc_iv; potpis radi iz kljuc_pem_encrypted', async () => {
    const { env } = await import('cloudflare:test');
    const stupci = await (env as { DB: D1Database }).DB.prepare(`PRAGMA table_info(certifikat)`).all<{ name: string }>();
    const imena = stupci.results.map((s) => s.name);
    expect(imena).not.toContain('pkcs12_encrypted');
    expect(imena).not.toContain('enc_iv');
    expect(imena).toContain('kljuc_pem_encrypted');
  });
});
