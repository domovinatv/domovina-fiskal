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

// Konvencija POTVRĐENA probama na doku TEST okolini 2026-07-15: oporezive
// kategorije idu kao "KATEGORIJA-STOPA" s crticom (S-25, S-13, S-5), a
// oslobođeno/prijenos kao goli kôd (Z, E, AE, O). Svaki drugi format
// (S25, S, Z-0…) doku builder ruši s api.error.500.
export function dokuTaxCategory(kategorija: string, stopa: string): string {
  const k = (kategorija || 'S').toUpperCase();
  if (k === 'S' || k === 'AA') {
    const n = Math.round(Number(stopa) || 0);
    return `${k}-${n}`;
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

  // HR CIUS obveze potvrđene schematron probama na doku TEST okolini (2026-07-15):
  // HR-BR-37/HR-BR-9 (operater), HR-BR-25 (KPD po stavci), BR-61 (IBAN uz
  // kreditni transfer). Guard ovdje daje razumljivu poruku umjesto doku greške.
  if (!k.operaterIme || !k.operaterOib) {
    return { greska: 'eRačun traži operatera (ime + OIB, HR-BR-37/HR-BR-9) — pošalji operaterOib pri izdavanju' };
  }
  const bezKpd = k.stavke.filter((s) => !s.kpd);
  if (bezKpd.length) {
    return { greska: `eRačun traži KPD klasifikaciju za svaku stavku (HR-BR-25) — nedostaje za: ${bezKpd.map((s) => s.naziv).join(', ')}` };
  }

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
    // HR-BR-S-1: uz standardnu/sniženu stopu račun mora nositi PDV ID kupca
    // (BT-48); za HR kupce bez eksplicitnog VAT broja to je "HR" + OIB.
    taxCompanyID: k.kupac.vat_number || ((k.kupac.adr_drzava || 'HR') === 'HR' ? `HR${k.kupac.oib}` : null),
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

  const meansCode = MEANS_CODE[r.nacin_placanja ?? ''] ?? null;
  if (meansCode === '30' && !t.iban) {
    return { greska: 'eRačun s transakcijskim plaćanjem traži IBAN prodavatelja (BR-61) — postavi IBAN tenanta u adminu' };
  }

  const dueDate = r.datum_dospijeca ? r.datum_dospijeca.slice(0, 10) : undefined;
  const invoice: DokuInvoice = {
    id: r.broj_racuna_full,
    profileID: 'P1', // oznaka procesa (BT-23, HR-BR-34): P1 = izdavanje računa za isporuke po ugovoru
    invoiceTypeCode: '380', // standardni račun (UNTDID 1001); storno/odobrenje ide zasebnim tokom
    issueDate: (r.datum_vrijeme || '').slice(0, 10) || undefined,
    dueDate,
    documentCurrencyCode: r.valuta || 'EUR',
    note: r.napomena || null,
    supplier,
    buyer,
    payment: {
      meansCode,
      financialAccountID: t.iban || null,
      model: r.model_placanja || null,
      id: r.poziv_na_broj || null,
      // BR-CO-25: uz pozitivan iznos mora postojati dueDate ILI uvjeti plaćanja.
      terms: dueDate ? null : 'Plativo odmah po primitku računa.',
    },
    lines,
  };

  return { invoice };
}
