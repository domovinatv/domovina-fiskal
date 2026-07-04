// Zod sheme za RacunModel — payload je SAMO kupac + stavke + tip (sve o
// izdavatelju je server-side, vezano na API ključ = tenant). Dizajn po
// docs/reference/fira-custom-webshop-api.md, ali strože: jasna obvezna polja,
// hrvatske poruke grešaka, dokumentirana normalizacija PDV stope.
//
// PDV obračun po docs/knowledge/10-* §5.2: osnovica zaokružena PO STAVCI
// (nakon popusta), PDV zaokružen jednom PO SKUPINI (kategorija+stopa) — EN 16931
// BR-CO pravila; NE zbrajamo zaokružene PDV-ove pojedinačnih stavki.

import { z } from 'zod';
import { izCenti, normalizirajTekst, uCente, uTisucinke, validanOib } from './util';

// Obvezne klauzule (docs/knowledge/09-* §1.1, 10-* §7.2 — čl. 90. st. 1. potvrđen
// na TEB izvoru 2026-07-04; do 31.12.2024. bio je st. 2.).
export const KLAUZULA_CL90 =
  'Oslobođeno plaćanja PDV-a prema čl. 90. st. 1. Zakona o porezu na dodanu vrijednost.';
export const KLAUZULA_PRIJENOS =
  'Prijenos porezne obveze prema čl. 75. st. 3. Zakona o porezu na dodanu vrijednost.';

// Dozvoljene HR PDV stope. Prihvaćamo postotak (25, '25') ILI decimalni udio
// (0.25, kao Fira) — sve se normalizira u postotni string ('25').
const DOZVOLJENE_STOPE = ['25', '13', '5', '0'] as const;

const pdvStopaShema = z
  .union([z.string(), z.number()], { errorMap: () => ({ message: 'pdvStopa mora biti broj ili string' }) })
  .transform((v, ctx) => {
    let n = Number(String(v).trim());
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `pdvStopa '${v}' nije broj` });
      return z.NEVER;
    }
    if (n > 0 && n < 1) n = n * 100; // decimalni udio (0.25) → postotak (25)
    const s = String(Math.round(n * 100) / 100);
    if (!DOZVOLJENE_STOPE.includes(s as (typeof DOZVOLJENE_STOPE)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `pdvStopa '${v}' nije dozvoljena — dozvoljene HR stope: 25, 13, 5, 0 (ili 0.25, 0.13, 0.05)`,
      });
      return z.NEVER;
    }
    return s;
  });

const oibShema = z
  .string()
  .trim()
  .refine(validanOib, { message: 'OIB mora imati 11 znamenki i valjanu kontrolnu znamenku (ISO 7064 MOD 11,10)' });

const tekstShema = (max: number, naziv: string) =>
  z
    .string({ required_error: `${naziv} je obavezan`, invalid_type_error: `${naziv} mora biti string` })
    .transform(normalizirajTekst)
    .pipe(z.string().min(1, `${naziv} ne smije biti prazan`).max(max, `${naziv} smije imati najviše ${max} znakova`));

const tekstOpcShema = (max: number, naziv: string) =>
  z.string().transform(normalizirajTekst).pipe(z.string().max(max, `${naziv} smije imati najviše ${max} znakova`)).optional();

const iznosShema = (naziv: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    try {
      uCente(v, naziv);
      return typeof v === 'number' ? v.toFixed(2) : String(v).trim();
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
      return z.NEVER;
    }
  });

const datumShema = (naziv: string) =>
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `${naziv} mora biti ISO datum (YYYY-MM-DD)`).optional();

// Popust u postotku, 0–100, do 2 decimale. Vraća string ('5.5').
const popustShema = z
  .union([z.string(), z.number()])
  .default(0)
  .transform((v, ctx) => {
    const n = Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0 || n >= 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `popustPosto '${v}' mora biti broj u rasponu [0, 100)` });
      return z.NEVER;
    }
    return String(Math.round(n * 100) / 100);
  });

export const PDV_KATEGORIJE = ['S', 'AA', 'Z', 'E', 'AE', 'O'] as const;

const stavkaShema = z
  .object({
    // Stavka iz kataloga: proizvodId + kolicina (server popuni ostalo, polja
    // dolje smiju nadjačati katalog) ILI slobodna stavka (naziv+cijena+stopa).
    proizvodId: z.number().int().positive().optional(),
    naziv: tekstShema(500, 'stavke[].naziv').optional(),
    opis: tekstOpcShema(2000, 'stavke[].opis'),
    kolicina: z
      .union([z.string(), z.number()])
      .default(1)
      .transform((v, ctx) => {
        try {
          uTisucinke(v, 'stavke[].kolicina');
          return String(v).trim();
        } catch (e) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
          return z.NEVER;
        }
      }),
    // EN 16931 unitCode (UN/ECE Rec 20), npr. 'H87' komad, 'C62' jedinica, 'HUR' sat.
    jedinicaMjere: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{2,3}$/, "jedinicaMjere mora biti EN 16931 unitCode (npr. 'H87', 'C62', 'HUR')")
      .optional(),
    netoCijena: iznosShema('stavke[].netoCijena').optional(), // smije biti negativna (popust kao stavka)
    popustPosto: popustShema,
    pdvStopa: pdvStopaShema.optional(),
    pdvKategorija: z
      .enum(PDV_KATEGORIJE, {
        errorMap: () => ({ message: "pdvKategorija mora biti UNTDID 5305 kod: 'S', 'AA', 'Z', 'E', 'AE' ili 'O'" }),
      })
      .optional(),
    kpd: z
      .string()
      .trim()
      .regex(/^\d{2}\.\d{2}\.\d{2}$/, "kpd mora biti KPD 2025 potkategorija u obliku 'NN.NN.NN' (npr. '62.02.30')")
      .optional(),
  })
  .superRefine((s, ctx) => {
    if (!s.proizvodId) {
      for (const [polje, naziv] of [
        [s.naziv, 'naziv'],
        [s.netoCijena, 'netoCijena'],
        [s.pdvStopa, 'pdvStopa'],
      ] as const) {
        if (polje === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [naziv],
            message: `stavke[].${naziv} je obavezan kad stavka nema proizvodId (slobodna stavka)`,
          });
        }
      }
    }
    // EN 16931: S → stopa > 0; Z/E/AE/O → stopa 0 (docs/knowledge/06-* §2.1).
    if (s.pdvStopa !== undefined && s.pdvKategorija !== undefined) {
      const nula = s.pdvStopa === '0';
      if (s.pdvKategorija === 'S' && nula) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pdvKategorija'], message: "kategorija 'S' zahtijeva stopu > 0 — za stopu 0 koristi 'Z' (nulta), 'E' (oslobođeno) ili 'AE' (prijenos obveze)" });
      }
      if (['Z', 'E', 'AE', 'O'].includes(s.pdvKategorija) && !nula) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pdvStopa'], message: `kategorija '${s.pdvKategorija}' zahtijeva stopu 0` });
      }
    }
  });

const adresaShema = z.object({
  ulica: tekstShema(200, 'kupac.adresa.ulica').optional(),
  grad: tekstShema(100, 'kupac.adresa.grad').optional(),
  postanskiBroj: z.string().trim().max(16).optional(),
  drzava: z.string().trim().length(2, "kupac.adresa.drzava mora biti ISO 3166-1 alpha-2 (npr. 'HR')").default('HR'),
});

const kupacShema = z.object({
  naziv: tekstShema(300, 'kupac.naziv'),
  oib: oibShema.optional(),
  vatNumber: z.string().trim().max(20).optional(),
  adresa: adresaShema.optional(),
  email: z.string().trim().email('kupac.email nije valjana e-mail adresa').optional(),
  tip: z.enum(['fizicka', 'pravna', 'drzava']).optional(),
});

export const racunModelShema = z
  .object({
    // FISKALNI_B2C / ERACUN_* dolaze u fazama 2–3; u enumu su da poruka greške
    // bude točna (501, ne "nepoznat tip").
    tip: z.enum(['PONUDA', 'PREDRACUN', 'RACUN', 'FISKALNI_B2C', 'ERACUN_B2B', 'ERACUN_B2G'], {
      errorMap: () => ({
        message: "tip mora biti jedan od: 'PONUDA', 'PREDRACUN', 'RACUN', 'FISKALNI_B2C', 'ERACUN_B2B', 'ERACUN_B2G'",
      }),
    }),
    poslovniProstor: tekstShema(20, 'poslovniProstor'), // oznaka PP (oznPP)
    naplatniUredaj: tekstShema(20, 'naplatniUredaj'), // oznaka NU (oznNU)
    operaterOib: oibShema.optional(),
    nacinPlacanja: z
      .enum(['GOTOVINA', 'KARTICA', 'TRANSAKCIJSKI', 'OSTALO'], {
        errorMap: () => ({ message: "nacinPlacanja mora biti: 'GOTOVINA', 'KARTICA', 'TRANSAKCIJSKI' ili 'OSTALO'" }),
      })
      .default('TRANSAKCIJSKI'),
    valuta: z.string().trim().length(3, "valuta mora biti ISO 4217 kod (npr. 'EUR')").toUpperCase().default('EUR'),
    datumDospijeca: datumShema('datumDospijeca'),
    vrijediDo: datumShema('vrijediDo'), // za ponude/predračune
    datumIsporuke: datumShema('datumIsporuke'),
    napomena: tekstOpcShema(2000, 'napomena'), // vidljiva na PDF-u
    internaBiljeska: tekstOpcShema(2000, 'internaBiljeska'), // NIJE na PDF-u
    uvjeti: tekstOpcShema(4000, 'uvjeti'),
    kupac: kupacShema.optional(),
    stavke: z.array(stavkaShema).min(1, 'racun mora imati barem jednu stavku').max(500, 'najviše 500 stavki'),
    status: z.enum(['nacrt', 'izdano']).default('izdano'), // 'nacrt' = skica bez broja
    stornoZaId: z.number().int().positive().optional(), // interna veza storna na original (10-* §2.3)
  })
  .superRefine((r, ctx) => {
    if ((r.tip === 'ERACUN_B2B' || r.tip === 'ERACUN_B2G') && !r.kupac?.oib) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kupac', 'oib'],
        message: `kupac.oib je obavezan za tip '${r.tip}' (Primatelj oibPorezniBroj, BT-48)`,
      });
    }
    if (r.tip === 'FISKALNI_B2C') {
      // CIS RacunZahtjev: OibOper je obavezan element (02-* §4.3).
      if (!r.operaterOib) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['operaterOib'],
          message: "operaterOib je obavezan za tip 'FISKALNI_B2C' (CIS element OibOper)",
        });
      }
      // Fiskalni račun je izdan u trenutku kreiranja (ZKI odmah) — skica nema smisla.
      if (r.status === 'nacrt') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['status'],
          message: "tip 'FISKALNI_B2C' ne podržava skicu — račun se izdaje i fiskalizira odmah",
        });
      }
    }
  });

export type RacunModel = z.infer<typeof racunModelShema>;
export type StavkaModel = z.infer<typeof stavkaShema>;

// zod issues → naš format greške: [{ polje, poruka }]
export function formatirajGreske(error: z.ZodError): { polje: string; poruka: string }[] {
  return error.issues.map((i) => ({ polje: i.path.join('.') || '(korijen)', poruka: i.message }));
}

// ── Izračun iznosa i PDV raščlambe ──
// Integer centi. Osnovica: half-up PO STAVCI (nakon popusta); PDV: half-up
// jednom PO SKUPINI (kategorija+stopa) — docs/knowledge/10-* §5.2.

export interface RazrijesenaStavka {
  naziv: string;
  opis: string | null;
  kolicina: string;
  jedinicaMjere: string;
  netoCijena: string;
  popustPosto: string;
  pdvStopa: string;
  pdvKategorija: string;
  kpd: string | null;
  proizvodId: number | null;
}

export interface IzracunatiIznosi {
  neto: string;
  iznosBezPdv: string;
  pdv: string;
  iznosSPdv: string;
  dospijevaZaPlacanje: string;
  ukupnoCenti: number; // za HUB3 barkod (iznos u centima)
  osnovicePoStavci: string[]; // za PDF prikaz iznosa po retku
  raspodjela: { kategorija: string; stopa: string; oporeziviIznos: string; iznosPoreza: string }[];
}

export function izracunajIznose(stavke: RazrijesenaStavka[]): IzracunatiIznosi {
  const poKljucu = new Map<string, { kategorija: string; stopa: string; osnovica: number }>();
  const osnovicePoStavci: string[] = [];
  let netoUkupno = 0;

  for (const st of stavke) {
    const cijenaCenti = uCente(st.netoCijena, 'netoCijena');
    const kolTis = uTisucinke(st.kolicina, 'kolicina');
    const popustBps = Math.round(Number(st.popustPosto) * 100); // 5.5% → 550
    // osnovica = cijena × količina × (1 − popust); jedno zaokruživanje po stavci
    const sirovo = cijenaCenti * kolTis * (10000 - popustBps);
    const osnovica = Math.sign(sirovo) * Math.round(Math.abs(sirovo) / (1000 * 10000));
    osnovicePoStavci.push(izCenti(osnovica));
    netoUkupno += osnovica;

    const kljuc = `${st.pdvKategorija}|${st.pdvStopa}`;
    const grupa = poKljucu.get(kljuc) ?? { kategorija: st.pdvKategorija, stopa: st.pdvStopa, osnovica: 0 };
    grupa.osnovica += osnovica;
    poKljucu.set(kljuc, grupa);
  }

  let pdvUkupno = 0;
  const raspodjela = [...poKljucu.values()].map((g) => {
    const sirovo = g.osnovica * Number(g.stopa);
    const porez = Math.sign(sirovo) * Math.round(Math.abs(sirovo) / 100); // jednom po skupini
    pdvUkupno += porez;
    return { kategorija: g.kategorija, stopa: g.stopa, oporeziviIznos: izCenti(g.osnovica), iznosPoreza: izCenti(porez) };
  });

  const ukupno = netoUkupno + pdvUkupno;
  return {
    neto: izCenti(netoUkupno),
    iznosBezPdv: izCenti(netoUkupno),
    pdv: izCenti(pdvUkupno),
    iznosSPdv: izCenti(ukupno),
    dospijevaZaPlacanje: izCenti(ukupno),
    ukupnoCenti: ukupno,
    osnovicePoStavci,
    raspodjela,
  };
}

// Pravila na razini dokumenta ovisna o tenantu — poziva ih API sloj nakon zoda.
// Vraća poruke grešaka (prazno = OK) + klauzulu za PDF.
export function provjeriPdvPravila(
  uSustavuPdv: boolean,
  stavke: RazrijesenaStavka[],
): { greske: { polje: string; poruka: string }[]; klauzula: string | null } {
  const greske: { polje: string; poruka: string }[] = [];

  if (!uSustavuPdv) {
    // Mali obveznik (izvan sustava PDV-a): sve stavke stopa 0, kategorija E,
    // klauzula čl. 90. st. 1. (docs/knowledge/10-* §7.2/§7.3).
    stavke.forEach((s, i) => {
      if (s.pdvStopa !== '0') {
        greske.push({
          polje: `stavke.${i}.pdvStopa`,
          poruka: 'izdavatelj nije u sustavu PDV-a — PDV se ne obračunava, stopa mora biti 0 (klauzula čl. 90. st. 1. dodaje se automatski)',
        });
      }
    });
    return { greske, klauzula: greske.length ? null : KLAUZULA_CL90 };
  }

  // Prijenos porezne obveze: AE se ne miješa s oporezivim stavkama (06-* §2.1).
  const imaAE = stavke.some((s) => s.pdvKategorija === 'AE');
  if (imaAE && !stavke.every((s) => s.pdvKategorija === 'AE')) {
    greske.push({
      polje: 'stavke',
      poruka: "kod prijenosa porezne obveze ('AE') SVE stavke dokumenta moraju biti 'AE' — ne miješa se s oporezivim stavkama",
    });
  }
  return { greske, klauzula: imaAE && !greske.length ? KLAUZULA_PRIJENOS : null };
}
