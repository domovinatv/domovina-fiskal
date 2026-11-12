// Korak 8 (§4): parsiranje CIS odgovora — HTTP (chunked/Content-Length), XML
// (JIR, greške, SOAP fault, echo, entiteti) i tablica retryja.
import { describe, expect, it } from 'vitest';
import { dechunk, greskaJeRetryable, parsirajHttp, parsirajOdgovor } from '../../src/fiskal/cis';

const b = (s: string) => new TextEncoder().encode(s);

describe('parsirajHttp / dechunk', () => {
  it('Content-Length reže višak', () => {
    expect(parsirajHttp(b('HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello-višak'))).toEqual({ status: 200, tijelo: 'hello' });
  });

  it('chunked s ekstenzijom i UTF-8 tijelom', () => {
    const tijelo = 'Čćž šđ';
    const bajtovi = b(tijelo);
    const prvi = bajtovi.subarray(0, 3); // presijeca dvobajtni znak
    const drugi = bajtovi.subarray(3);
    const dijelovi = [
      b(`HTTP/1.1 500 Internal Server Error\r\nTransfer-Encoding: chunked\r\n\r\n${prvi.length.toString(16)};ext=1\r\n`),
      prvi,
      b(`\r\n${drugi.length.toString(16)}\r\n`),
      drugi,
      b('\r\n0\r\n\r\n'),
    ];
    const sve = new Uint8Array(dijelovi.reduce((n, d) => n + d.length, 0));
    let i = 0;
    for (const d of dijelovi) {
      sve.set(d, i);
      i += d.length;
    }
    expect(parsirajHttp(sve)).toEqual({ status: 500, tijelo });
  });

  it('dechunk spaja više chunkova', () => {
    expect(new TextDecoder().decode(dechunk(b('3\r\nabc\r\nA\r\n0123456789\r\n0\r\n\r\n')))).toBe('abc0123456789');
  });

  it('neispravan chunk baca', () => {
    expect(() => dechunk(b('zz\r\nabc\r\n0\r\n\r\n'))).toThrow(/chunked/);
  });

  it('bez kraja zaglavlja i s neispravnom statusnom linijom baca', () => {
    expect(() => parsirajHttp(b('HTTP/1.1 200 OK\r\nContent-Length: 0'))).toThrow(/kraja zaglavlja/);
    expect(() => parsirajHttp(b('SMTP 220\r\n\r\n'))).toThrow(/statusna linija/);
  });
});

describe('parsirajOdgovor', () => {
  it('JIR iz RacunOdgovor', () => {
    const xml = `<soap:Envelope><soap:Body><tns:RacunOdgovor Id="x"><tns:Zaglavlje/><tns:Jir> 6b1b1b1b-0000-4000-8000-000000000001 </tns:Jir></tns:RacunOdgovor></soap:Body></soap:Envelope>`;
    expect(parsirajOdgovor(xml)).toEqual({ jir: '6b1b1b1b-0000-4000-8000-000000000001', greske: [], echoTekst: null });
  });

  it('više <Greska> s entitetima', () => {
    const xml = `<tns:RacunOdgovor><tns:Greske>
      <tns:Greska><tns:SifraGreske>s004</tns:SifraGreske><tns:PorukaGreske>Neispravan potpis &lt;Signature&gt; &amp; sl.</tns:PorukaGreske></tns:Greska>
      <tns:Greska><tns:SifraGreske>s006</tns:SifraGreske><tns:PorukaGreske>Sistemska pogreška</tns:PorukaGreske></tns:Greska>
    </tns:Greske></tns:RacunOdgovor>`;
    expect(parsirajOdgovor(xml)).toEqual({
      jir: null,
      greske: [
        { sifra: 's004', poruka: 'Neispravan potpis <Signature> & sl.' },
        { sifra: 's006', poruka: 'Sistemska pogreška' },
      ],
      echoTekst: null,
    });
  });

  it('SOAP fault bez <Greska> → sifra fault', () => {
    const xml = `<soap:Envelope><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Pogre&quot;ka</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    expect(parsirajOdgovor(xml).greske).toEqual([{ sifra: 'fault', poruka: 'Pogre"ka' }]);
  });

  it('echo', () => {
    expect(parsirajOdgovor('<tns:EchoResponse xmlns:tns="x">proba &amp; test</tns:EchoResponse>').echoTekst).toBe('proba & test');
  });

  it('prazno tijelo', () => {
    expect(parsirajOdgovor('')).toEqual({ jir: null, greske: [], echoTekst: null });
  });
});

describe('greskaJeRetryable', () => {
  it.each(['s006', 'transport', 'fault', 'http'])('%s → retry', (s) => expect(greskaJeRetryable(s)).toBe(true));
  it.each(['s001', 's002', 's003', 's004', 's005', 's007', 's013', 'v100', '?'])('%s → bez retryja', (s) =>
    expect(greskaJeRetryable(s)).toBe(false));
});
