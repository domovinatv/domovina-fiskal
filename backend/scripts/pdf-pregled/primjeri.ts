// Ogledni računi za vizualni pregled PDF-a (scripts/pdf-pregled/generiraj.sh).
// Izmišljeni podaci — ne koriste se u testovima ni produkciji.
import type { RacunKontekst } from '../../src/db';
import type { RacunRow, StavkaRow, TenantRow } from '../../src/types';
import type { PdfBranding } from '../../src/pdf/racun-pdf';

const tenant: TenantRow = {
  id: 1, oib: '12345678903', naziv: 'Primjer obrt, vl. Ivana Horvat',
  adr_ulica: 'Ilica', adr_kucni_broj: '42', adr_mjesto: 'Zagreb', adr_postanski_broj: '10000',
  adr_drzava: 'HR', u_sustavu_pdv: 1, iban: 'HR1210010051863000160',
  oznaka_slijednosti_def: 'P', status: 'active', email: 'racuni@primjer.hr', created_at: '2026-01-01',
};

function racun(p: Partial<RacunRow>): RacunRow {
  return {
    id: 1, tenant_id: 1, poslovni_prostor_id: 1, naplatni_uredaj_id: 1, operater_id: 1, kupac_id: null,
    sekvenca_vrsta: 'fiskalni', redni_broj: 154, godina: 2026, broj_racuna_full: '154/WEB/1',
    oznaka_slijednosti: 'P', datum_vrijeme: '2026-11-23T13:20:00.000Z', tip_dokumenta: 'fiskalni_b2c',
    valuta: 'EUR', nacin_placanja: 'Kartica', datum_dospijeca: null, vrijedi_do: null, datum_isporuke: '2026-11-23',
    model_placanja: 'HR00', poziv_na_broj: '154-2026', neto: '59.16', iznos_bez_pdv: '59.16', pdv: '0.80',
    iznos_s_pdv: '59.96', dospijeva_za_placanje: '59.96', klauzula_pdv: null, napomena: null, interna_biljeska: null,
    uvjeti: null, poslano_email_ts: null, poslano_email_na: null,
    zki: '6b6d483986ca36ebc35810b463d96814', jir: 'e2fe6266-856f-4fdd-9e35-ec4580d9c409',
    qr_payload: 'https://porezna.gov.hr/rn?jir=e2fe6266-856f-4fdd-9e35-ec4580d9c409&datv=20261123_1420&izn=5996',
    doku_id: null, eracun_status: null, eracun_delivery_block: null, eracun_zadnja_provjera: null, eracun_greska: null,
    status: 'fiskaliziran', fiskal_nak_dost: 0, fiskal_pokusaja: 1, fiskal_zadnji_pokusaj: null, fiskal_greska: null, storno_racun_id: null,
    ...p,
  } as RacunRow;
}

function stavka(i: number, p: Partial<StavkaRow>): StavkaRow {
  return {
    id: i, racun_id: 1, redni_broj: i, naziv: '', opis: null, kolicina: '1', jedinica_mjere: 'kom',
    neto_cijena: '0.00', popust_posto: '0', pdv_kategorija: 'S', pdv_stopa: '25', kpd: null, kpd_shema: 'CG',
    proizvod_id: null, iznos: null, ...p,
  };
}

export const primjeri: Record<string, RacunKontekst> = {
  'b2c-fiskalni': {
    racun: racun({}),
    stavke: [
      stavka(1, { naziv: 'Ulaznica „Tribina” — Hrvatska za Život, Sportska dvorana Zeleni brijeg', kolicina: '2', neto_cijena: '28.00', pdv_stopa: '0', pdv_kategorija: 'O', iznos: '56.00' }),
      stavka(2, { naziv: 'Naknada za izdavanje ulaznice', kolicina: '2', neto_cijena: '1.58', iznos: '3.16' }),
    ],
    raspodjela: [
      { id: 1, racun_id: 1, kategorija_pdv: 'O', stopa: '0', oporezivi_iznos: '56.00', iznos_poreza: '0.00' },
      { id: 2, racun_id: 1, kategorija_pdv: 'S', stopa: '25', oporezivi_iznos: '3.16', iznos_poreza: '0.80' },
    ],
    tenant, ppOznaka: 'WEB', nuOznaka: '1', operaterIme: 'Ivana Horvat', operaterOib: '12345678903',
    stornoOriginal: null, kupac: null,
  },
  'r1-nalog': {
    racun: racun({
      sekvenca_vrsta: 'racun', tip_dokumenta: 'racun', broj_racuna_full: '37/1/1', nacin_placanja: 'Transakcijski račun',
      datum_dospijeca: '2026-12-08', zki: null, jir: null, qr_payload: null, kupac_id: 1,
      neto: '1240.00', iznos_bez_pdv: '1240.00', pdv: '310.00', iznos_s_pdv: '1550.00', dospijeva_za_placanje: '1550.00',
      poziv_na_broj: '37-2026', napomena: 'Usluge izvršene prema ponudi br. 12/1/1 od 02.11.2026.',
      uvjeti: 'Plaćanje u roku 15 dana. Za zakašnjela plaćanja obračunava se zakonska zatezna kamata.',
    }),
    stavke: [
      stavka(1, { naziv: 'Izrada web stranice — dizajn i implementacija (prema specifikaciji)', kolicina: '1', jedinica_mjere: 'usl', neto_cijena: '900.00', iznos: '900.00', kpd: '62.01.11' }),
      stavka(2, { naziv: 'Održavanje — studeni 2026.', kolicina: '4', jedinica_mjere: 'h', neto_cijena: '50.00', iznos: '200.00' }),
      stavka(3, { naziv: 'Hosting (godišnji)', kolicina: '1', neto_cijena: '175.00', popust_posto: '20', iznos: '140.00' }),
    ],
    raspodjela: [{ id: 1, racun_id: 1, kategorija_pdv: 'S', stopa: '25', oporezivi_iznos: '1240.00', iznos_poreza: '310.00' }],
    tenant, ppOznaka: '1', nuOznaka: '1', operaterIme: 'Ivana Horvat', operaterOib: '12345678903', stornoOriginal: null,
    kupac: { naziv: 'Kupac d.o.o.', oib: '98765432106', vat_number: null, adr_ulica: 'Savska cesta 1', adr_grad: 'Zagreb', adr_postanski_broj: '10000', adr_drzava: 'HR', email: null, tip: 'pravna' },
  },
};

const nePdvTenant: TenantRow = { ...tenant, id: 2, naziv: 'Obrt za usluge SUSRET, vl. Marko Marić', u_sustavu_pdv: 0, adr_ulica: 'Vlaška', adr_kucni_broj: '70a' };

primjeri['ne-pdv-skica'] = {
  ...primjeri['r1-nalog'],
  tenant: nePdvTenant,
  racun: racun({
    ...primjeri['r1-nalog'].racun, status: 'nacrt', redni_broj: null, broj_racuna_full: null, tip_dokumenta: 'ponuda',
    vrijedi_do: '2026-12-15', datum_dospijeca: null, pdv: '0.00', iznos_bez_pdv: '620.00', iznos_s_pdv: '620.00', dospijeva_za_placanje: '620.00',
    klauzula_pdv: 'Oslobođeno PDV-a temeljem čl. 90. st. 2. Zakona o PDV-u.',
  } as Partial<RacunRow>),
  stavke: [
    stavka(1, { naziv: 'Radionica komunikacije u obitelji (4 susreta)', opis: 'Termini: utorkom 18–20 h, prostorija župe sv. Marka', kolicina: '1', jedinica_mjere: 'usl', neto_cijena: '480.00', pdv_stopa: '0', pdv_kategorija: 'E', iznos: '480.00' }),
    stavka(2, { naziv: 'Priručnik', kolicina: '2', neto_cijena: '70.00', pdv_stopa: '0', pdv_kategorija: 'E', iznos: '140.00' }),
  ],
  raspodjela: [],
};

primjeri['storno'] = {
  ...primjeri['b2c-fiskalni'],
  racun: racun({ broj_racuna_full: '155/WEB/1', neto: '-59.16', iznos_bez_pdv: '-59.16', pdv: '-0.80', iznos_s_pdv: '-59.96', dospijeva_za_placanje: '-59.96', storno_racun_id: 1 }),
  stavke: primjeri['b2c-fiskalni'].stavke.map((s) => ({ ...s, kolicina: `-${s.kolicina}`, iznos: `-${s.iznos}` })),
  raspodjela: primjeri['b2c-fiskalni'].raspodjela.map((p) => ({ ...p, oporezivi_iznos: `-${p.oporezivi_iznos}`, iznos_poreza: p.iznos_poreza === '0.00' ? '0.00' : `-${p.iznos_poreza}` })),
  stornoOriginal: { broj: '154/WEB/1', datumVrijeme: '2026-11-23T13:20:00.000Z' },
};

// Branding: isti B2C račun s logom i akcentnom bojom tenanta.
export const branding: Record<string, PdfBranding> = {
  'b2c-brand': { boja: '#C8102E', podnozje: 'www.kavana-primjer.hr  ·  +385 1 234 5678' },
  'r1-brand-svijetla': { boja: '#F2B705' },
};
primjeri['b2c-brand'] = primjeri['b2c-fiskalni'];
primjeri['r1-brand-svijetla'] = primjeri['r1-nalog'];

// Više stranica: zaglavlje tablice se ponavlja, podnožje broji stranice.
primjeri['vise-stranica'] = {
  ...primjeri['r1-nalog'],
  stavke: Array.from({ length: 34 }, (_, i) => stavka(i + 1, { naziv: `Artikl ${i + 1}${i % 5 === 0 ? ' — duži naziv koji se lomi u dva retka da provjerimo visinu retka' : ''}`, neto_cijena: '36.47', iznos: '36.47' })),
};
