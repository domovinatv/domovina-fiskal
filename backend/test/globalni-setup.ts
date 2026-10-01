// Globalni setup testova (izvodi se u Node.js-u, ne u workerd-u): svaki put
// generira SVJEŽ testni RSA ključ i samopotpisani certifikat — u repou nema
// nikakvog ključa ni certifikata (repo je javan). Uz njih računa i ZKI vektor
// Nodeovim OpenSSL-om, neovisno o kodu koji se testira (workerd node:crypto).

import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';
import type { TestProject } from 'vitest/node';

export const TEST_OIB = '12345678903';

export interface TestniCertifikat {
  kljucPem: string;
  certPem: string;
  issuerDn: string;
  serialDec: string;
  zkiVektor: { ulaz: { oib: string; datVrijIso: string; brOznRac: string; oznPosPr: string; oznNapUr: string; iznosUkupno: string }; medjurezultat: string; zki: string };
}

declare module 'vitest' {
  export interface ProvidedContext {
    testniCertifikat: TestniCertifikat;
  }
}

export function generirajTestniCertifikat(): TestniCertifikat {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kljucPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString());
  cert.serialNumber = '0a1b2c3d4e5f';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [
    { shortName: 'C', value: 'HR' },
    { shortName: 'O', value: `TESTNI OBVEZNIK D.O.O. HR${TEST_OIB}` },
    { shortName: 'CN', value: 'FISKAL TEST 1' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forge.pki.privateKeyFromPem(kljucPem), forge.md.sha256.create());

  // 15.07.2026. 14:30:05 po zagrebačkom vremenu (CEST = UTC+2).
  const ulaz = { oib: TEST_OIB, datVrijIso: '2026-07-15T12:30:05.000Z', brOznRac: '17', oznPosPr: 'WEB', oznNapUr: '1', iznosUkupno: '125.00' };
  const medjurezultat = `${TEST_OIB}15.07.2026 14:30:0517WEB1125.00`;
  const potpis = createSign('RSA-SHA1').update(medjurezultat, 'utf8').sign(kljucPem);
  const zki = createHash('md5').update(potpis).digest('hex');

  return {
    kljucPem,
    certPem: forge.pki.certificateToPem(cert),
    issuerDn: `CN=FISKAL TEST 1,O=TESTNI OBVEZNIK D.O.O. HR${TEST_OIB},C=HR`,
    serialDec: BigInt('0x0a1b2c3d4e5f').toString(10),
    zkiVektor: { ulaz, medjurezultat, zki },
  };
}

export default function setup(project: TestProject) {
  project.provide('testniCertifikat', generirajTestniCertifikat());
}
