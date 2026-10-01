// Mock CIS transporta preko postaviCisTransport (src/fiskal/cis.ts). Svaka
// funkcija ovdje postavlja novi vi.fn() i vraća ga za provjere poziva.

import { vi, type Mock } from 'vitest';
import { postaviCisTransport, type CisTransport } from '../../src/fiskal/cis';

export function jirOdgovor(jir = crypto.randomUUID()): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
    `<tns:RacunOdgovor xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"><tns:Zaglavlje><tns:IdPoruke>x</tns:IdPoruke></tns:Zaglavlje>` +
    `<tns:Jir>${jir}</tns:Jir></tns:RacunOdgovor></soap:Body></soap:Envelope>`
  );
}

export function greskaOdgovor(sifra: string, poruka: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
    `<tns:RacunOdgovor xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"><tns:Greske><tns:Greska>` +
    `<tns:SifraGreske>${sifra}</tns:SifraGreske><tns:PorukaGreske>${poruka}</tns:PorukaGreske>` +
    `</tns:Greska></tns:Greske></tns:RacunOdgovor></soap:Body></soap:Envelope>`
  );
}

export function postaviMock(impl: CisTransport): Mock<CisTransport> {
  const mock = vi.fn(impl);
  postaviCisTransport(mock);
  return mock;
}

export function echoOdgovor(envelopa: string) {
  const tekst = envelopa.match(/<tns:EchoRequest[^>]*>([^<]*)</)?.[1] ?? '';
  return { status: 200, tijelo: `<x:EchoResponse xmlns:x="y">${tekst}</x:EchoResponse>` };
}

// CIS odmah vraća JIR. Vraća listu poslanih envelopa (RacunZahtjev).
export function cisVracaJir(): string[] {
  const poslano: string[] = [];
  postaviMock(async (_okolina, operacija, envelopa) => {
    if (operacija === 'echo') return echoOdgovor(envelopa);
    poslano.push(envelopa);
    return { status: 200, tijelo: jirOdgovor() };
  });
  return poslano;
}

export function cisNedostupan(): Mock<CisTransport> {
  return postaviMock(async () => {
    throw new Error('connect ECONNREFUSED (mock)');
  });
}
