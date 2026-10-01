import { createHash, createVerify } from 'node:crypto';
import { describe, expect, inject, it } from 'vitest';
import { potpisiZahtjev, zahtjevXml, type CisRacun } from '../src/fiskal/xml';

const racun: CisRacun = {
  oib: '12345678903', uSustPdv: true, datVrijIso: '2026-07-15T12:30:05.000Z', oznSlijed: 'P',
  brOznRac: '17', oznPosPr: 'WEB', oznNapUr: '1',
  pdv: [{ stopa: '25', osnovica: '100.00', iznos: '25.00' }],
  iznosOslobPdv: null, iznosNePodlOpor: null, iznosUkupno: '125.00',
  nacinPlac: 'K', oibOper: '98765432106', zastKod: 'b334e9150c51f302837ee83c0dbff447', nakDost: false, oibPrimatelja: null,
};

describe('XML-DSIG potpis RacunZahtjev', () => {
  const tc = inject('testniCertifikat');
  const materijal = { privatniKljucPem: tc.kljucPem, certDerB64: 'AAAA', issuerDn: tc.issuerDn, serialDec: tc.serialDec };
  const xml = zahtjevXml('RacunZahtjev', racun, '00000000-0000-4000-8000-000000000001', '2026-07-15T12:30:06.000Z');
  const potpisano = potpisiZahtjev(xml, 'RacunZahtjev', materijal);

  it('struktura: elementi po XSD redoslijedu, Signature prije zatvaranja roota', () => {
    expect(xml).toMatch(/^<tns:RacunZahtjev xmlns:tns="[^"]+" Id="RacunZahtjev"><tns:Zaglavlje>/);
    const redoslijed = ['Oib', 'USustPdv', 'DatVrijeme', 'OznSlijed', 'BrRac', 'Pdv', 'IznosUkupno', 'NacinPlac', 'OibOper', 'ZastKod', 'NakDost'];
    const pozicije = redoslijed.map((e) => xml.indexOf(`<tns:${e}>`));
    expect(pozicije.every((p) => p > 0)).toBe(true);
    expect([...pozicije].sort((a, b) => a - b)).toEqual(pozicije);
    expect(xml).toContain('<tns:DatVrijeme>15.07.2026T14:30:05</tns:DatVrijeme>');
    expect(potpisano).toMatch(/<\/Signature><\/tns:RacunZahtjev>$/);
    expect(potpisano).toContain('<X509SerialNumber>' + tc.serialDec + '</X509SerialNumber>');
  });

  it('digest = SHA-256 kanonskog elementa bez potpisa; potpis RSA-SHA256 nad SignedInfo verificira', () => {
    const digest = potpisano.match(/<DigestValue>([^<]+)</)![1];
    expect(digest).toBe(createHash('sha256').update(xml, 'utf8').digest('base64'));
    // Enveloped transform: uklanjanje <Signature> vraća točno originalni element.
    expect(potpisano.replace(/<Signature [\s\S]*<\/Signature>/, '')).toBe(xml);
    const signedInfo = potpisano.match(/<SignedInfo[\s\S]*<\/SignedInfo>/)![0];
    const vrijednost = potpisano.match(/<SignatureValue>([^<]+)</)![1];
    const javni = tc.certPem;
    expect(createVerify('RSA-SHA256').update(signedInfo, 'utf8').verify(javni, vrijednost, 'base64')).toBe(true);
  });
});
