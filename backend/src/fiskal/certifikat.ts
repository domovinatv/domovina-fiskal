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

// OID-ovi koje node-forge ne imenuje, a pojavljuju se u HR fiskalnim certifikatima
// (AKD/Certilia drži OIB u organizationIdentifier: 'VATHR-<OIB>'; FINA u O polju).
const DODATNI_OIDI: Record<string, string> = {
  '2.5.4.97': 'organizationIdentifier',
};

function dnString(attrs: forge.pki.CertificateField[]): string {
  // RFC 2253 stil: najspecifičniji RDN prvi (obrnuto od redoslijeda u certifikatu).
  return [...attrs]
    .reverse()
    .map((a) => `${a.shortName ?? a.name ?? DODATNI_OIDI[a.type ?? ''] ?? a.type}=${String(a.value ?? '')}`)
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

  // Certifikati iz P12 lanca. forge kod pkcs12FromAsn1 ne popuni `bag.cert` ako
  // ne zna izračunati hash potpisa (AKD/Certilia leaf je ECDSA-potpisan!) —
  // fallback: parsiraj iz bag.asn1 bez computeHash. EC intermediate koji forge
  // uopće ne zna ('OID is not RSA') slobodno preskačemo — treba nam samo leaf.
  // Čuvamo i ORIGINALNI DER (bez forge re-enkodiranja) za <X509Certificate>.
  const certBagovi = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certifikati: { cert: forge.pki.Certificate; derB64: string }[] = [];
  for (const bag of certBagovi) {
    let cert = bag.cert ?? null;
    if (!cert && bag.asn1) {
      try {
        cert = forge.pki.certificateFromAsn1(bag.asn1);
      } catch {
        continue; // npr. EC intermediate — nije leaf s našim RSA ključem
      }
    }
    if (!cert || !bag.asn1) continue;
    certifikati.push({ cert, derB64: forge.util.encode64(forge.asn1.toDer(bag.asn1).getBytes()) });
  }
  if (!certifikati.length) throw new Error('P12 ne sadrži čitljiv certifikat');

  // Leaf = certifikat čiji javni ključ odgovara privatnom (P12 nosi i CA lanac).
  const leaf =
    certifikati.find(({ cert }) => {
      const pub = cert.publicKey as forge.pki.rsa.PublicKey;
      return pub?.n && kljuc.n && pub.n.compareTo(kljuc.n) === 0;
    }) ?? null;
  if (!leaf) throw new Error('P12: nijedan certifikat ne odgovara privatnom ključu');

  // Privatni ključ u PKCS8 PEM (node:crypto createSign ga izravno prima).
  const pkcs8 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(kljuc));
  const privatniKljucPem = forge.pki.privateKeyInfoToPem(pkcs8);

  const subjectDn = dnString(leaf.cert.subject.attributes);
  // OIB: FINA ga drži u O polju ('… HR<OIB>'), AKD/Certilia u
  // organizationIdentifier ('VATHR-<OIB>') — 11 znamenki hvata oba oblika.
  const oib = subjectDn.match(/(\d{11})/)?.[1] ?? null;
  const serialHex = leaf.cert.serialNumber.replace(/^0+(?=.)/, '');

  return {
    privatniKljucPem,
    certPem: derB64UPem(leaf.derB64),
    subjectDn,
    issuerDn: dnString(leaf.cert.issuer.attributes),
    serialHex,
    serialDec: BigInt(`0x${serialHex || '0'}`).toString(10),
    oib,
    notBefore: leaf.cert.validity.notBefore.toISOString(),
    notAfter: leaf.cert.validity.notAfter.toISOString(),
  };
}

function derB64UPem(derB64: string): string {
  const linije = derB64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${linije.join('\n')}\n-----END CERTIFICATE-----\n`;
}

// PEM certifikat → čisti Base64 DER (sadržaj za <X509Certificate>).
export function certPemUDerB64(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
}
