// Parsiranje P12/PFX certifikata (node-forge, čisti JS — radi na Workers).
// P12 se raspakira JEDNOM, pri uploadu u adminu (docs/knowledge/11-* §1: PKCS#12
// se ne može uvesti u WebCrypto; FINA P12 koristi legacy RC2/3DES koji forge
// podržava nativno). Plaintext ključ živi samo u memoriji zahtjeva.

import forge from 'node-forge';

export interface ParsiraniCertifikat {
  privatniKljucPem: string; // PKCS8 PEM
  certPem: string;          // leaf certifikat, PEM
  subjectDn: string;
  issuerDn: string;         // za KeyInfo/X509IssuerSerial
  serialHex: string;
  serialDec: string;        // X509SerialNumber je decimalni
  oib: string | null;       // 11 znamenki iz Subject-a (FINA: serialNumber = HR<OIB>)
  notBefore: string;        // ISO
  notAfter: string;         // ISO
}

function dnString(attrs: forge.pki.CertificateField[]): string {
  // RFC 2253 stil: najspecifičniji RDN prvi (obrnuto od redoslijeda u certifikatu).
  return [...attrs]
    .reverse()
    .map((a) => `${a.shortName ?? a.name ?? a.type}=${String(a.value ?? '')}`)
    .join(',');
}

export function parsirajP12(p12Buf: ArrayBuffer, lozinka: string): ParsiraniCertifikat {
  const binarno = forge.util.binary.raw.encode(new Uint8Array(p12Buf));
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binarno));
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, lozinka);
  } catch (e) {
    throw new Error(`P12 se ne može otvoriti — pogrešna lozinka ili oštećena datoteka (${(e as Error).message})`);
  }

  const kljucBagovi = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const kljuc = kljucBagovi[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!kljuc) throw new Error('P12 ne sadrži privatni ključ');

  const certBagovi = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certifikati = certBagovi.map((b) => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  if (!certifikati.length) throw new Error('P12 ne sadrži certifikat');

  // Leaf = certifikat čiji javni ključ odgovara privatnom (P12 zna nositi i CA lanac).
  const leaf =
    certifikati.find((c) => {
      const pub = c.publicKey as forge.pki.rsa.PublicKey;
      return pub?.n && kljuc.n && pub.n.compareTo(kljuc.n) === 0;
    }) ?? certifikati[0];

  // Privatni ključ u PKCS8 PEM (node:crypto createSign ga izravno prima).
  const pkcs8 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(kljuc));
  const privatniKljucPem = forge.pki.privateKeyInfoToPem(pkcs8);

  const subjectDn = dnString(leaf.subject.attributes);
  const oib = subjectDn.match(/(\d{11})/)?.[1] ?? null;
  const serialHex = leaf.serialNumber.replace(/^0+(?=.)/, '');

  return {
    privatniKljucPem,
    certPem: forge.pki.certificateToPem(leaf),
    subjectDn,
    issuerDn: dnString(leaf.issuer.attributes),
    serialHex,
    serialDec: BigInt(`0x${serialHex || '0'}`).toString(10),
    oib,
    notBefore: leaf.validity.notBefore.toISOString(),
    notAfter: leaf.validity.notAfter.toISOString(),
  };
}

// PEM certifikat → čisti Base64 DER (sadržaj za <X509Certificate>).
export function certPemUDerB64(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
}
