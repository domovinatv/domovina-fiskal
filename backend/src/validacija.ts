// Zod sheme za RacunModel — payload je SAMO kupac + stavke + tip (sve o
// izdavatelju je server-side, vezano na API ključ = tenant). Dizajn po
// docs/reference/fira-custom-webshop-api.md, ali strože: jasna obvezna polja,
// hrvatske poruke grešaka, dokumentirana normalizacija PDV stope.

import { z } from 'zod';
import { izCenti, normalizirajTekst, pdvIznos, pomnoziCijenuKolicinu, uCente, uTisucinke, validanOib } from './util';

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

const stavkaShema = z.object({
  naziv: tekstShema(500, 'stavke[].naziv'),
  kolicina: z.union([z.string(), z.number()]).transform((v, ctx) => {
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
    .default('H87'),
  netoCijena: iznosShema('stavke[].netoCijena'), // smije biti negativna (popust kao stavka)
  pdvStopa: pdvStopaShema,
  pdvKategorija: z
    .enum(['S', 'AA', 'Z', 'E', 'AE', 'O'], {
      errorMap: () => ({ message: "pdvKategorija mora biti UNTDID 5305 kod: 'S', 'AA', 'Z', 'E', 'AE' ili 'O'" }),
    })
    .default('S'),
  kpd: z
    .string()
    .trim()
    .regex(/^[\d.]{2,10}$/, "kpd mora biti KPD šifra (npr. '62.02.30')")
    .optional(),
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
    // FISKALNI_B2C / ERACUN_B2B / ERACUN_B2G dolaze u fazama 2–3; ovdje su u enumu
    // da poruka greške bude točna (501, ne "nepoznat tip").
    tip: z.enum(['PONUDA', 'RACUN', 'FISKALNI_B2C', 'ERACUN_B2B', 'ERACUN_B2G'], {
      errorMap: () => ({
        message: "tip mora biti jedan od: 'PONUDA', 'RACUN', 'FISKALNI_B2C', 'ERACUN_B2B', 'ERACUN_B2G'",
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
    kupac: kupacShema.optional(),
    stavke: z.array(stavkaShema).min(1, 'racun mora imati barem jednu stavku').max(500, 'najviše 500 stavki'),
    status: z.enum(['nacrt', 'izdano']).default('izdano'),
  })
  .superRefine((r, ctx) => {
    if ((r.tip === 'ERACUN_B2B' || r.tip === 'ERACUN_B2G') && !r.kupac?.oib) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kupac', 'oib'],
        message: `kupac.oib je obavezan za tip '${r.tip}' (Primatelj oibPorezniBroj, BT-48)`,
      });
    }
  });

export type RacunModel = z.infer<typeof racunModelShema>;

// zod issues → naš format greške: [{ polje, poruka }]
export function formatirajGreske(error: z.ZodError): { polje: string; poruka: string }[] {
  return error.issues.map((i) => ({ polje: i.path.join('.') || '(korijen)', poruka: i.message }));
}

// ── Izračun iznosa i PDV raščlambe (integer centi, half-up po stavci) ──

export interface IzracunatiIznosi {
  neto: string;
  iznosBezPdv: string;
  pdv: string;
  iznosSPdv: string;
  dospijevaZaPlacanje: string;
  raspodjela: { kategorija: string; stopa: string; oporeziviIznos: string; iznosPoreza: string }[];
}

export function izracunajIznose(stavke: RacunModel['stavke']): IzracunatiIznosi {
  const poKljucu = new Map<string, { kategorija: string; stopa: string; osnovica: number; porez: number }>();
  let netoUkupno = 0;
  let pdvUkupno = 0;

  for (const st of stavke) {
    const osnovica = pomnoziCijenuKolicinu(uCente(st.netoCijena, 'netoCijena'), uTisucinke(st.kolicina, 'kolicina'));
    const porez = pdvIznos(osnovica, Number(st.pdvStopa));
    netoUkupno += osnovica;
    pdvUkupno += porez;
    const kljuc = `${st.pdvKategorija}|${st.pdvStopa}`;
    const grupa = poKljucu.get(kljuc) ?? { kategorija: st.pdvKategorija, stopa: st.pdvStopa, osnovica: 0, porez: 0 };
    grupa.osnovica += osnovica;
    grupa.porez += porez;
    poKljucu.set(kljuc, grupa);
  }

  return {
    neto: izCenti(netoUkupno),
    iznosBezPdv: izCenti(netoUkupno),
    pdv: izCenti(pdvUkupno),
    iznosSPdv: izCenti(netoUkupno + pdvUkupno),
    dospijevaZaPlacanje: izCenti(netoUkupno + pdvUkupno),
    raspodjela: [...poKljucu.values()].map((g) => ({
      kategorija: g.kategorija,
      stopa: g.stopa,
      oporeziviIznos: izCenti(g.osnovica),
      iznosPoreza: izCenti(g.porez),
    })),
  };
}
