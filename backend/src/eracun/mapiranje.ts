// Mapiranje internog RacunKontekst (D1) → doku strukturirani model (DokuInvoice).
// doku iz ovog JSON-a gradi UBL 2.1 (HR CIUS 2025 + ext) i šalje ga svojim certom.
//
// Namjerno pokriva SAMO ono što doku /create traži; doku sam računa PDV raščlambu
// i ukupne iznose iz stavki (unitPrice × quantity × taxCategory).

import type { RacunKontekst } from '../db';
import type { DokuInvoice, DokuStavka, DokuStranka } from './doku';

// UNTDID 4461 (način plaćanja) iz naše interne oznake.
const MEANS_CODE: Record<string, string> = {
  transakcijski: '30', // kreditni transfer
  kartica: '48', // bankovna kartica
  gotovina: '10', // gotovina
  ostalo: '1', // instrument nije definiran
};

// ⚠️ KONVENCIJA KOJU TREBA POTVRDITI S DOKU-om (openapi ne dokumentira značenje
// `taxCategory` stringa, a stavka NEMA zasebno polje za stopu). Do potvrde na
// doku TEST okolini pretpostavljamo: kategorija + cijela stopa za oporezive
// (S25/S13/S5), goli kôd kategorije za oslobođeno/prijenos (Z/E/AE/O).
// Ovo je JEDINA točka koju treba uskladiti kad dobijemo doku pristupne podatke.
export function dokuTaxCategory(kategorija: string, stopa: string): string {
  const k = (kategorija || 'S').toUpperCase();
  if (k === 'S' || k === 'AA') {
    const n = Math.round(Number(stopa) || 0);
    return `${k}${n}`;
  }
  return k; // Z (nulta), E (izuzeto), AE (prijenos obveze), O (izvan PDV-a)
}

function brojIliNula(s: string | null | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function adresa(a: { ulica: string | null; grad: string | null; posta: string | null; drzava: string | null }): DokuStranka['address'] {
  return {
    streetName: a.ulica || null,
    cityName: a.grad || null,
    postalZone: a.posta || null,
    countryCode: a.drzava || 'HR',
  };
}

export function mapirajZaDoku(k: RacunKontekst): { invoice: DokuInvoice } | { greska: string } {
  const r = k.racun;
  if (r.redni_broj == null || !r.broj_racuna_full) {
    return { greska: 'Račun nema dodijeljen broj (skica se ne šalje kao eRačun)' };
  }
  if (!k.kupac || !k.kupac.oib) {
    return { greska: 'eRačun (B2B/B2G) traži kupca s OIB-om — nadopuni podatke kupca' };
  }
  if (!k.stavke.length) return { greska: 'Račun nema stavki' };

  const t = k.tenant;
  const supplier: DokuStranka = {
    endpointID: t.oib,
    endpointSchemeID: 'OIB',
    name: t.naziv,
    registrationName: t.naziv,
    companyID: t.oib,
    taxCompanyID: t.u_sustavu_pdv ? `HR${t.oib}` : null,
    operatorName: k.operaterIme,
    operatorOIB: k.operaterOib,
    address: adresa({
      ulica: [t.adr_ulica, t.adr_kucni_broj].filter(Boolean).join(' ') || null,
      grad: t.adr_mjesto,
      posta: t.adr_postanski_broj,
      drzava: t.adr_drzava,
    }),
  };

  const buyer: DokuStranka = {
    endpointID: k.kupac.oib,
    endpointSchemeID: 'OIB',
    name: k.kupac.naziv,
    registrationName: k.kupac.naziv,
    companyID: k.kupac.oib,
    address: adresa({ ulica: k.kupac.adr_ulica, grad: k.kupac.adr_grad, posta: k.kupac.adr_postanski_broj, drzava: k.kupac.adr_drzava }),
    contact: k.kupac.email ? { email: k.kupac.email } : undefined,
  };

  const lines: DokuStavka[] = k.stavke.map((s) => ({
    item: {
      name: s.naziv,
      description: s.opis || null,
      quantity: brojIliNula(s.kolicina),
      unitOfMeasure: s.jedinica_mjere,
      unitPrice: brojIliNula(s.neto_cijena),
      commodityClassification: s.kpd || null,
      commodityClassificationListID: s.kpd ? s.kpd_shema || 'CG' : null,
      taxCategory: dokuTaxCategory(s.pdv_kategorija, s.pdv_stopa),
    },
  }));

  const invoice: DokuInvoice = {
    id: r.broj_racuna_full,
    invoiceTypeCode: '380', // standardni račun (UNTDID 1001); storno/odobrenje ide zasebnim tokom
    issueDate: (r.datum_vrijeme || '').slice(0, 10) || undefined,
    dueDate: r.datum_dospijeca ? r.datum_dospijeca.slice(0, 10) : undefined,
    documentCurrencyCode: r.valuta || 'EUR',
    note: r.napomena || null,
    supplier,
    buyer,
    payment: {
      meansCode: MEANS_CODE[r.nacin_placanja ?? ''] ?? null,
      financialAccountID: t.iban || null,
      model: r.model_placanja || null,
      id: r.poziv_na_broj || null,
    },
    lines,
  };

  return { invoice };
}
