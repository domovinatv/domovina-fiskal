// CIS XML poruke (namespace fin/2012/types/f73) + XML-DSIG enveloped potpis.
//
// Umjesto xml-crypto/C14N biblioteke (⚠️ u 11-* §1 za Workers runtime), XML se
// gradi KANONSKI PO KONSTRUKCIJI: serijalizacija ispod je već u Exclusive C14N
// obliku (bez međuprostora, namespace deklaracije prije atributa, escape &<>,
// CR kao &#xD;, prazni elementi kao par tagova). Time je digest/potpis računat
// nad točno onim bajtovima koje će CIS-ov parser + exc-C14N reproducirati.
//
// Algoritmi potpisa: exc-C14N + RSA-SHA256 + SHA-256 digest. ⚠️ Empirijski
// nalaz (2026-07-05, CIS TEST): RSA-SHA1/SHA1 iz spec. v2.6 §7 danas vraća
// `s004 Neispravan digitalni potpis` — CIS je prešao na SHA-256 (kao i
// referentne implementacije, npr. nticaric/fiskalizacija). ZKI i dalje koristi
// RSA-SHA1+MD5 (PU 4616, 99-gap R2 ✅) — to su dva neovisna potpisa!

import { createHash, createSign } from 'node:crypto';
import { xmlDatum } from './zki';

export const CIS_TNS = 'http://www.apis-it.hr/fin/2012/types/f73'; // ⚠️ P10: sufiks 'f73' = verzija sheme; kod promjene verzije ažurirati OVDJE
const DSIG = 'http://www.w3.org/2000/09/xmldsig#';

// C14N escape za tekstualne čvorove: & < > i CR.
export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

// <tns:Ime>sadržaj</tns:Ime> — samo za neprazan sadržaj; null/undefined preskače element.
function el(ime: string, sadrzaj: string | null | undefined): string {
  if (sadrzaj == null || sadrzaj === '') return '';
  return `<tns:${ime}>${escXml(sadrzaj)}</tns:${ime}>`;
}

// Decimalni string '25' / '2.5' → '25.00' (CIS iznosi/stope su uvijek 2 decimale).
export function dvijeDec(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`'${s}' nije broj (CIS decimalno polje)`);
  return n.toFixed(2);
}

export interface CisRacun {
  oib: string;
  uSustPdv: boolean;
  datVrijIso: string;       // izdavanje računa (isti trenutak kao u ZKI-ju!)
  oznSlijed: 'P' | 'N';
  brOznRac: string;
  oznPosPr: string;
  oznNapUr: string;
  pdv: { stopa: string; osnovica: string; iznos: string }[]; // prazno → bez <Pdv>
  iznosOslobPdv: string | null;
  iznosNePodlOpor: string | null;
  iznosUkupno: string;
  nacinPlac: 'G' | 'K' | 'T' | 'O'; // 'C' ukinut 01.09.2025. (P3)
  oibOper: string;
  zastKod: string;
  nakDost: boolean;
  oibPrimatelja: string | null;
}

// Tijelo zahtjeva (RacunZahtjev ili ProvjeraZahtjev — isti podatkovni skup,
// 02-* §4.8). Redoslijed elemenata točno po XSD sekvenci.
export function zahtjevXml(
  root: 'RacunZahtjev' | 'ProvjeraZahtjev',
  r: CisRacun,
  idPoruke: string,
  vrijemeSlanjaIso: string,
): string {
  const pdvBlok = r.pdv.length
    ? `<tns:Pdv>${r.pdv
        .map(
          (p) =>
            `<tns:Porez>${el('Stopa', dvijeDec(p.stopa))}${el('Osnovica', dvijeDec(p.osnovica))}${el('Iznos', dvijeDec(p.iznos))}</tns:Porez>`,
        )
        .join('')}</tns:Pdv>`
    : '';

  // Kanonski oblik: xmlns PRIJE atributa Id (C14N: namespace čvorovi prvi).
  return (
    `<tns:${root} xmlns:tns="${CIS_TNS}" Id="${root}">` +
    `<tns:Zaglavlje>${el('IdPoruke', idPoruke)}${el('DatumVrijeme', xmlDatum(vrijemeSlanjaIso))}</tns:Zaglavlje>` +
    `<tns:Racun>` +
    el('Oib', r.oib) +
    el('USustPdv', r.uSustPdv ? 'true' : 'false') +
    el('DatVrijeme', xmlDatum(r.datVrijIso)) +
    el('OznSlijed', r.oznSlijed) +
    `<tns:BrRac>${el('BrOznRac', r.brOznRac)}${el('OznPosPr', r.oznPosPr)}${el('OznNapUr', r.oznNapUr)}</tns:BrRac>` +
    pdvBlok +
    el('IznosOslobPdv', r.iznosOslobPdv ? dvijeDec(r.iznosOslobPdv) : null) +
    el('IznosNePodlOpor', r.iznosNePodlOpor ? dvijeDec(r.iznosNePodlOpor) : null) +
    el('IznosUkupno', dvijeDec(r.iznosUkupno)) +
    el('NacinPlac', r.nacinPlac) +
    el('OibOper', r.oibOper) +
    el('ZastKod', r.zastKod) +
    el('NakDost', r.nakDost ? 'true' : 'false') +
    el('OibPrimateljaRacuna', r.oibPrimatelja) +
    `</tns:Racun>` +
    `</tns:${root}>`
  );
}

export function echoXml(tekst: string): string {
  return `<tns:EchoRequest xmlns:tns="${CIS_TNS}">${escXml(tekst)}</tns:EchoRequest>`;
}

export interface PotpisniMaterijal {
  privatniKljucPem: string;
  certDerB64: string; // Base64 DER leaf certifikata (X509Certificate)
  issuerDn: string;   // X509IssuerName
  serialDec: string;  // X509SerialNumber (decimalno)
}

// Enveloped XML-DSIG nad root elementom zahtjeva (02-* §6): digest SHA-256 nad
// kanonskim elementom BEZ potpisa (enveloped transform), potpis RSA-SHA256 nad
// kanonskim <SignedInfo>. Vraća element s umetnutim <Signature> prije </root>.
export function potpisiZahtjev(elementXml: string, refId: string, m: PotpisniMaterijal): string {
  const digest = createHash('sha256').update(elementXml, 'utf8').digest('base64');

  const signedInfo =
    `<SignedInfo xmlns="${DSIG}">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${refId}">` +
    `<Transforms>` +
    `<Transform Algorithm="${DSIG}enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const potpis = createSign('RSA-SHA256').update(signedInfo, 'utf8').sign(m.privatniKljucPem).toString('base64');

  const signature =
    `<Signature xmlns="${DSIG}">` +
    signedInfo +
    `<SignatureValue>${potpis}</SignatureValue>` +
    `<KeyInfo><X509Data>` +
    `<X509Certificate>${m.certDerB64}</X509Certificate>` +
    `<X509IssuerSerial>` +
    `<X509IssuerName>${escXml(m.issuerDn)}</X509IssuerName>` +
    `<X509SerialNumber>${m.serialDec}</X509SerialNumber>` +
    `</X509IssuerSerial>` +
    `</X509Data></KeyInfo>` +
    `</Signature>`;

  const zavrsni = elementXml.lastIndexOf('</tns:');
  if (zavrsni < 0) throw new Error('Element za potpis nema završni tag');
  return elementXml.slice(0, zavrsni) + signature + elementXml.slice(zavrsni);
}

// SOAP 1.1 document/literal envelopa — potpisani element ide izravno u Body
// (bez WS-Security headera, 02-* §6.3).
export function soapEnvelopa(tijelo: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body>${tijelo}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}
