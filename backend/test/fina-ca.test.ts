// K1 (pregled 2026-10-02): bundlani Fina CA PEM-ovi moraju postojati u repou,
// parsirati se u subtls i biti točno oni certifikati čiji su otisci zapisani u
// src/fiskal/ca/README.md. Promjena PEM-a bez promjene otiska ovdje = crveni test.

import { Cert, TrustedCert } from 'subtls';
import { describe, expect, it } from 'vitest';
import finaDemoCa2020 from '../src/fiskal/ca/fina-demo-ca-2020.pem';
import finaRdcCa2020 from '../src/fiskal/ca/fina-rdc-ca-2020.pem';

const CA = [
  {
    naziv: 'fina-demo-ca-2020.pem (CIS TEST)',
    pem: finaDemoCa2020,
    cn: 'Fina Demo CA 2020',
    sha256: '9771586d69dca73d70e196b7aa059def3d47b2de4bc080e738e5b1bc8a105bd2',
  },
  {
    naziv: 'fina-rdc-ca-2020.pem (CIS PROD)',
    pem: finaRdcCa2020,
    cn: 'Fina RDC 2020',
    sha256: '4140b70629fda4b8a36fd53fb0aa53237157869931b8b2308fd05df3ff7d78ab',
  },
];

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

describe('Fina CA trust anchori (K1)', () => {
  for (const ca of CA) {
    it(`${ca.naziv}: parsira se, subject i SHA-256 otisak odgovaraju`, async () => {
      const certovi = await Cert.fromPEM(ca.pem);
      expect(certovi).toHaveLength(1);
      const [cert] = certovi;
      expect(Cert.stringFromDistinguishedName(cert.subject)).toContain(`CN=${ca.cn}`);
      expect(cert.basicConstraints?.ca).toBe(true);
      expect(hex(await crypto.subtle.digest('SHA-256', cert.rawData))).toBe(ca.sha256);
      // Isti poziv kao u cis.ts — PEM mora biti upotrebljiv kao subtls trust store.
      await expect(TrustedCert.databaseFromPEM(ca.pem)).resolves.toBeDefined();
    });
  }
});
