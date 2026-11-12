// Korak 8 (§4): datumi u zagrebačkoj zoni, kanonski JSON/hash idempotencije,
// HUB3 i EPC QR payload.
import { describe, expect, it } from 'vitest';
import { qrDatum, xmlDatum, zkiDatum } from '../../src/fiskal/zki';
import { godinaZagreb, kanonskiJson } from '../../src/util';
import { hashZahtjeva } from '../../src/dokumenti/izdavanje';
import { racunModelShema } from '../../src/validacija';
import { epcQrPayload, hub3Payload, type Hub3Podaci } from '../../src/pdf/hub3';

describe('datumi (Europe/Zagreb)', () => {
  it('zimsko (+1) i ljetno (+2) vrijeme', () => {
    expect(zkiDatum('2026-01-15T10:00:00Z')).toBe('15.01.2026 11:00:00');
    expect(xmlDatum('2026-07-15T10:00:00Z')).toBe('15.07.2026T12:00:00');
  });

  it("ponoć je '00', ne '24'", () => {
    expect(zkiDatum('2026-03-01T23:00:00Z')).toBe('02.03.2026 00:00:00');
  });

  it('31. 12. 23:30 UTC je već sljedeća godina u Zagrebu', () => {
    expect(zkiDatum('2026-12-31T23:30:00Z')).toBe('01.01.2027 00:30:00');
    expect(godinaZagreb(new Date('2026-12-31T23:30:00Z'))).toBe(2027);
    expect(godinaZagreb(new Date('2026-12-31T22:59:59Z'))).toBe(2026);
  });

  it('qrDatum i neispravan datum', () => {
    expect(qrDatum('2026-07-15T10:05:00Z')).toBe('20260715_1205');
    expect(() => zkiDatum('nije-datum')).toThrow(/Neispravan datum/);
  });
});

describe('kanonskiJson / hashZahtjeva', () => {
  it('redoslijed ključeva ne utječe, undefined se izostavlja, nizovi zadržavaju redoslijed', () => {
    expect(kanonskiJson({ b: 1, a: { d: [2, 1], c: undefined } })).toBe('{"a":{"d":[2,1]},"b":1}');
    expect(kanonskiJson({ a: 1, b: 2 })).toBe(kanonskiJson({ b: 2, a: 1 }));
    expect(kanonskiJson([1, 2])).not.toBe(kanonskiJson([2, 1]));
    expect(kanonskiJson(null)).toBe('null');
  });

  it("K4: '10' / 10 / '10.0' i količina '2' / 2 / '2.000' daju isti hash; vanjskaReferenca ne ulazi", async () => {
    const tijelo = (cijena: unknown, kolicina: unknown, ref: string) =>
      racunModelShema.parse({
        tip: 'FISKALNI_B2C', poslovniProstor: 'WEB', naplatniUredaj: '1', operaterOib: '98765432106',
        nacinPlacanja: 'KARTICA', vanjskaReferenca: ref,
        stavke: [{ naziv: 'X', kolicina, netoCijena: cijena, pdvStopa: '25' }],
      });
    const h = await hashZahtjeva(tijelo('10', '2', 'a'));
    expect(await hashZahtjeva(tijelo(10, 2, 'b'))).toBe(h);
    expect(await hashZahtjeva(tijelo('10.0', '2.000', 'c'))).toBe(h);
    expect(await hashZahtjeva(tijelo('10.01', '2', 'a'))).not.toBe(h);
  });
});

const hub3: Hub3Podaci = {
  iznosCenti: 12345,
  primateljNaziv: 'Čokoladnica Žućkasti đir d.o.o.',
  primateljAdresa: 'Ilica 1',
  primateljMjesto: '10000 Zagreb',
  iban: 'HR12 1001 0051 8630 0016 0',
  model: 'HR00',
  pozivNaBroj: '12-2026',
  opisPlacanja: 'Račun 12/WEB/1 🙂',
};

describe('HUB3 / EPC QR', () => {
  it('HUB3: 15-znamenkasti iznos, transliteracija, limiti polja, IBAN bez razmaka', () => {
    const p = hub3Payload(hub3).split('\n');
    expect(p[0]).toBe('HRVHUB30');
    expect(p[2]).toBe('000000000012345');
    expect(p[6]).toBe('Cokoladnica Zuckasti dir'); // 25 znakova, bez dijakritika
    expect(p[9]).toBe('HR1210010051863000160');
    expect(p[13]).toBe('Racun 12/WEB/1'); // emoji uklonjen
  });

  it('HUB3: negativan iznos baca', () => {
    expect(() => hub3Payload({ ...hub3, iznosCenti: -1 })).toThrow(/negativan/);
  });

  it('EPC: iznos s točkom, opis s modelom i pozivom', () => {
    const p = epcQrPayload(hub3).split('\n');
    expect(p.slice(0, 4)).toEqual(['BCD', '002', '1', 'SCT']);
    expect(p[7]).toBe('EUR123.45');
    expect(p[10]).toBe('HR00 12-2026 Racun 12/WEB/1');
  });

  it('EPC: 0 i preko 999.999.999,99 € baca', () => {
    expect(() => epcQrPayload({ ...hub3, iznosCenti: 0 })).toThrow(/1 cent/);
    expect(() => epcQrPayload({ ...hub3, iznosCenti: 100_000_000_000 })).toThrow(/prelazi/);
  });
});
