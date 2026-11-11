// K3 (pregled 2026-10-02): izdavatelj izvan sustava PDV-a — sve stavke dobivaju
// kategoriju 'E' (oslobođeno, čl. 90. st. 1.), CIS XML nosi IznosOslobPdv i
// NE nosi <Pdv> blok; eRačun (doku) dobiva taxCategory 'E' + razlog izuzeća.
import { beforeEach, describe, expect, it } from 'vitest';
import { b2cTijelo, json, napraviTenanta, poziv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';
import { testEnv } from './pomocno/okolina';
import { getRacunKontekst } from '../src/db';
import { mapirajZaDoku } from '../src/eracun/mapiranje';

const nePdvStavke = [
  { naziv: 'Savjetovanje', kolicina: '2', netoCijena: '40.00', pdvStopa: '0' },
  { naziv: 'Materijal', kolicina: 1, netoCijena: 4, pdvStopa: 0 },
];

describe('ne-PDV obveznik (K3)', () => {
  let poslano: string[];
  beforeEach(() => {
    poslano = cisVracaJir();
  });

  it('stavke bez kategorije → E, XML ima IznosOslobPdv i nema <Pdv>', async () => {
    const t = await napraviTenanta({ uSustavuPdv: false });
    const r = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify(b2cTijelo(t, { stavke: nePdvStavke })),
    });
    const racun = await json(r);
    expect(r.status, JSON.stringify(racun)).toBe(201);

    const kategorije = await testEnv.DB
      .prepare('SELECT DISTINCT pdv_kategorija AS k FROM stavka WHERE racun_id = ?')
      .bind(racun.id)
      .all<{ k: string }>();
    expect(kategorije.results.map((x) => x.k)).toEqual(['E']);
    const raspodjela = await testEnv.DB
      .prepare('SELECT kategorija_pdv AS k FROM pdv_raspodjela WHERE racun_id = ?')
      .bind(racun.id)
      .all<{ k: string }>();
    expect(raspodjela.results.map((x) => x.k)).toEqual(['E']);

    expect(poslano).toHaveLength(1);
    expect(poslano[0]).toContain('<tns:USustPdv>false</tns:USustPdv>');
    expect(poslano[0]).toContain('<tns:IznosOslobPdv>84.00</tns:IznosOslobPdv>');
    expect(poslano[0]).not.toContain('<tns:Pdv>');
    expect(poslano[0]).toContain('<tns:IznosUkupno>84.00</tns:IznosUkupno>');
  });

  it("eksplicitna kategorija 'Z' za ne-PDV tenanta se normalizira u E", async () => {
    const t = await napraviTenanta({ uSustavuPdv: false });
    const r = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify(
        b2cTijelo(t, { stavke: [{ naziv: 'Savjetovanje', kolicina: '1', netoCijena: '10.00', pdvStopa: '0', pdvKategorija: 'Z' }] }),
      ),
    });
    const racun = await json(r);
    expect(r.status, JSON.stringify(racun)).toBe(201);
    expect(poslano[0]).toContain('<tns:IznosOslobPdv>10.00</tns:IznosOslobPdv>');
    expect(poslano[0]).not.toContain('<tns:Pdv>');
  });

  it('PDV obveznik sa stopom 0 i dalje dobiva Z (nepromijenjeno)', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify(b2cTijelo(t, { stavke: [{ naziv: 'Knjiga', kolicina: '1', netoCijena: '10.00', pdvStopa: '0' }] })),
    });
    expect(r.status).toBe(201);
    expect(poslano[0]).toContain('<tns:Pdv>');
    expect(poslano[0]).not.toContain('IznosOslobPdv');
  });
});

describe('ne-PDV obveznik — eRačun mapiranje (K3)', () => {
  it("doku stavka dobiva taxCategory 'E' i razlog izuzeća čl. 90.", async () => {
    cisVracaJir();
    const t = await napraviTenanta({ uSustavuPdv: false });
    const r = await poziv('/api/v1/racun', {
      method: 'POST',
      kljuc: t.kljuc,
      body: JSON.stringify({
        ...b2cTijelo(t, { stavke: nePdvStavke.map((s) => ({ ...s, kpd: '70.22.11' })) }),
        kupac: { naziv: 'Kupac d.o.o.', oib: '69435151530' },
      }),
    });
    const racun = await json(r);
    expect(r.status, JSON.stringify(racun)).toBe(201);
    const k = await getRacunKontekst(testEnv.DB, t.tenant.id, racun.id);
    const m = mapirajZaDoku(k!);
    expect('invoice' in m, JSON.stringify(m)).toBe(true);
    if (!('invoice' in m)) return;
    for (const l of m.invoice.lines) {
      expect(l.item.taxCategory).toBe('E');
      expect(l.item.taxExemptionReason).toMatch(/čl\. 90\. st\. 1\./);
    }
  });
});
