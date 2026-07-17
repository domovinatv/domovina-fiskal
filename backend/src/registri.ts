// Dohvat javnih podataka o subjektu po OIB-u — predpopunjavanje admin forme tenanta.
//
// Izvori (oba besplatna, deterministička):
//  - Sudski registar open-data API (sudreg-data.gov.hr) — trgovačka društva
//    (d.o.o., j.d.o.o., d.d. …). OAuth2 client_credentials; SUDREG_CLIENT_ID/
//    SECRET su wrangler secreti. Obrti/udruge → 404.
//  - VIES (ec.europa.eu) — svatko s aktivnim PDV ID-om, uključivo obrte; bez
//    registracije. Vraća naziv + adresu (s poštanskim brojem, koji sudreg nema).
//
// VAŽNO: VIES valid=true znači "ima PDV ID", NE "u sustavu PDV-a" (i paušalac
// dobiva PDV ID za EU usluge). Autoritativna provjera PDV statusa je isključivo
// PU aplikacija (reCAPTCHA → ručno): https://provjeri-rpo-pdv.porezna-uprava.hr/
// IBAN nema javnog strojnog izvora (FINA registar računa nije otvoren).

import type { Env } from './types';
import { validanOib } from './util';

const SUDREG_API = 'https://sudreg-data.gov.hr/api';
const VIES_API = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

export interface OibInfo {
  oib: string;
  izvori: ('sudreg' | 'vies' | 'companywall')[]; // koji su izvori doprinijeli podacima
  naziv: string | null;
  ulica: string | null; // ulica + kućni broj
  mjesto: string | null;
  postanskiBroj: string | null;
  iban: string | null; // samo companywall (registri ga nemaju)
  email: string | null; // službeni e-mail iz sudskog registra (koristan za SSO pristup)
  pravniOblik: string | null; // kratica, npr. 'd.o.o.' (samo sudreg)
  mbs: string | null; // samo companywall
  status: string | null; // samo companywall (aktivan / blokiran …)
  uSustavuPdv: boolean | null; // samo ako izvor eksplicitno prikazuje (rijetko) — inače null
  viesValjan: boolean | null; // aktivan PDV ID; null = VIES nedostupan
  companywallUrl: string | null; // pronađeni profil (za ručnu provjeru)
  upozorenja: string[];
}

// Sudreg token vrijedi 6 h — keš po izolatu (worker restart = novi token, benigno).
let sudregToken: { vrijednost: string; isticeMs: number } | null = null;

async function dohvatiSudregToken(env: Env): Promise<string> {
  if (sudregToken && Date.now() < sudregToken.isticeMs - 60_000) return sudregToken.vrijednost;
  const r = await fetch(`${SUDREG_API}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SUDREG_CLIENT_ID}:${env.SUDREG_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`sudreg token HTTP ${r.status}`);
  const { access_token, expires_in } = (await r.json()) as { access_token: string; expires_in?: number };
  sudregToken = { vrijednost: access_token, isticeMs: Date.now() + (expires_in ?? 21_600) * 1000 };
  return access_token;
}

interface SudregSubjekt {
  tvrtka?: { ime?: string };
  skracena_tvrtka?: { ime?: string };
  sjediste?: { ulica?: string; kucni_broj?: number | string; naziv_naselja?: string };
  email_adrese?: { adresa?: string }[];
  pravni_oblik?: { vrsta_pravnog_oblika?: { kratica?: string } };
}

// null = subjekt nije trgovačko društvo (404) — NIJE greška; greške bacaju.
async function dohvatiSudreg(env: Env, oib: string): Promise<SudregSubjekt | null> {
  const token = await dohvatiSudregToken(env);
  const r = await fetch(
    `${SUDREG_API}/javni/detalji_subjekta?expand_relations=true&tip_identifikatora=oib&identifikator=${oib}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`sudreg HTTP ${r.status}`);
  return (await r.json()) as SudregSubjekt;
}

interface ViesOdgovor {
  valid: boolean;
  name?: string;
  address?: string;
}

async function dohvatiVies(oib: string): Promise<ViesOdgovor> {
  const r = await fetch(VIES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode: 'HR', vatNumber: oib }),
  });
  if (!r.ok) throw new Error(`VIES HTTP ${r.status}`);
  return (await r.json()) as ViesOdgovor;
}

// VIES adresa je jedan string, npr. "ŠKOLSKA 5, DONJA LOMNICA, 10410 Velika Gorica".
function parsirajViesAdresu(adresa: string): { ulica: string | null; mjesto: string | null; postanskiBroj: string | null } {
  const dijelovi = adresa.split(',').map((d) => d.trim()).filter(Boolean);
  const pbr = adresa.match(/\b(\d{5})\b/)?.[1] ?? null;
  return {
    ulica: dijelovi[0] ?? null,
    // Naselje je srednji dio; kad ga nema, mjesto iz zadnjeg dijela bez PBR-a.
    mjesto: dijelovi.length >= 3 ? dijelovi[1] : (dijelovi[1]?.replace(/\b\d{5}\b/, '').trim() || null),
    postanskiBroj: pbr,
  };
}

// Jedinstveni dohvat po OIB-u: paralelno sudreg + VIES + companywall, pa spoji.
// Registri (sudreg/VIES) su autoritativni za naziv/adresu; companywall dodaje
// IBAN i MBS (i služi kao fallback kad registri ne vrate ništa). Svaki izvor
// smije pasti neovisno — dohvat vraća što je uspjelo.
export async function dohvatiPoOibu(env: Env, oib: string): Promise<OibInfo> {
  const info: OibInfo = {
    oib, izvori: [], naziv: null, ulica: null, mjesto: null, postanskiBroj: null,
    iban: null, email: null, pravniOblik: null, mbs: null, status: null,
    uSustavuPdv: null, viesValjan: null, companywallUrl: null, upozorenja: [],
  };

  const imaSudreg = !!(env.SUDREG_CLIENT_ID && env.SUDREG_CLIENT_SECRET);
  const imaFirecrawl = !!env.FIRECRAWL_API_KEY;
  if (!imaSudreg) info.upozorenja.push('SUDREG_CLIENT_ID/SECRET secreti nisu postavljeni — bez sudskog registra.');

  // Sva tri izvora paralelno. Companywall = 2 firecrawl poziva (pretraga + profil),
  // najsporiji je (~30–60 s); ostali ga ne čekaju ako padne.
  const [sudregIshod, viesIshod, cwIshod] = await Promise.allSettled([
    imaSudreg ? dohvatiSudreg(env, oib) : Promise.resolve(null),
    dohvatiVies(oib),
    imaFirecrawl ? dohvatiCompanywallPoOibu(env, oib) : Promise.resolve(null),
  ]);

  const vies = viesIshod.status === 'fulfilled' ? viesIshod.value : null;
  if (vies) info.viesValjan = vies.valid;
  else info.upozorenja.push(`VIES trenutno nedostupan (${(viesIshod as PromiseRejectedResult).reason}).`);

  if (sudregIshod.status === 'rejected') {
    info.upozorenja.push(`Sudski registar nedostupan (${sudregIshod.reason}) — pokušaj ponovno ili unesi ručno.`);
  }
  const sudreg = sudregIshod.status === 'fulfilled' ? sudregIshod.value : null;

  const cw = cwIshod.status === 'fulfilled' ? cwIshod.value : null;
  if (imaFirecrawl && cwIshod.status === 'rejected') {
    info.upozorenja.push(`CompanyWall nedostupan (${cwIshod.reason}) — IBAN provjeri ručno.`);
  }

  const viesAdresa = vies?.valid && vies.address ? parsirajViesAdresu(vies.address) : null;

  // Popuni polje samo ako je prazno (poziva se od najautoritativnijeg prema fallbacku).
  const uzmi = (polje: 'naziv' | 'ulica' | 'mjesto' | 'postanskiBroj' | 'email', v: string | null | undefined) => {
    if (!info[polje] && v) info[polje] = v;
  };

  // 1) Sudreg — najautoritativniji za trgovačka društva.
  if (sudreg) {
    info.izvori.push('sudreg');
    uzmi('naziv', sudreg.tvrtka?.ime ?? sudreg.skracena_tvrtka?.ime);
    const s = sudreg.sjediste;
    uzmi('ulica', s?.ulica ? `${s.ulica} ${s.kucni_broj ?? ''}`.trim() : null);
    uzmi('mjesto', s?.naziv_naselja);
    uzmi('email', sudreg.email_adrese?.[0]?.adresa);
    info.pravniOblik = sudreg.pravni_oblik?.vrsta_pravnog_oblika?.kratica ?? null;
  }

  // 2) VIES — naziv/adresa (uz obrte) i JEDINI izvor poštanskog broja.
  if (vies?.valid) {
    if (!info.izvori.includes('sudreg')) {
      info.izvori.push('vies');
      uzmi('naziv', vies.name);
    }
    if (viesAdresa) {
      uzmi('ulica', viesAdresa.ulica);
      uzmi('mjesto', viesAdresa.mjesto);
      uzmi('postanskiBroj', viesAdresa.postanskiBroj);
    }
  }

  // 3) CompanyWall — IBAN + MBS + status; popunjava i preostale rupe u nazivu/adresi.
  if (cw) {
    info.izvori.push('companywall');
    info.companywallUrl = cw.url;
    info.iban = cw.iban;
    info.mbs = cw.mbs;
    info.status = cw.status;
    if (typeof cw.uSustavuPdv === 'boolean') info.uSustavuPdv = cw.uSustavuPdv;
    uzmi('naziv', cw.naziv);
    uzmi('ulica', cw.ulica);
    uzmi('mjesto', cw.mjesto);
    uzmi('postanskiBroj', cw.postanskiBroj);
    uzmi('email', cw.email);
    info.upozorenja.push(...cw.upozorenja);
  }

  // Kontekstualna upozorenja.
  if (!sudreg && vies?.valid && imaSudreg && sudregIshod.status === 'fulfilled') {
    info.upozorenja.push('Subjekt nije u sudskom registru (vjerojatno obrt/OPG) — za obrt je naziv često ime vlasnika, provjeri ga.');
  }
  if (info.izvori.length === 0) {
    info.upozorenja.push('OIB nije pronađen ni u jednom izvoru — unesi podatke ručno.');
  }
  if (!info.iban) {
    info.upozorenja.push('IBAN nije dohvaćen — unesi ručno.');
  }
  // PDV status: nijedan javni izvor ne daje pouzdano — uvijek uputi na PU.
  info.upozorenja.push('PDV status obavezno provjeri na PU aplikaciji (VIES "valjan" ≠ u sustavu PDV-a!): https://provjeri-rpo-pdv.porezna-uprava.hr/');
  return info;
}

// ──────────── CompanyWall preko firecrawla (LLM ekstrakcija) — iteracija 2 ────────────
// CompanyWall agregira i podatke kojih u javnim registrima nema (IBAN!), ali nema
// javni API — firecrawl v2 /scrape s JSON shemom radi ekstrakciju na svojoj strani.
// ⚠️ PDV status ni companywall javno ne prikazuje — i dalje isključivo PU aplikacija.

export interface CompanywallInfo {
  url: string;
  naziv: string | null;
  oib: string | null;
  ulica: string | null;
  mjesto: string | null;
  postanskiBroj: string | null;
  iban: string | null;
  uSustavuPdv: boolean | null;
  mbs: string | null;
  email: string | null;
  status: string | null; // aktivan / blokiran / u stečaju …
  upozorenja: string[];
}

// JSON shema za firecrawl ekstrakciju — polja koja admin forma tenanta treba.
const CW_SHEMA = {
  type: 'object',
  properties: {
    naziv: { type: ['string', 'null'], description: 'puni naziv subjekta (tvrtke ili obrta)' },
    oib: { type: ['string', 'null'], description: 'OIB, 11 znamenki' },
    ulica: { type: ['string', 'null'], description: 'ulica i kućni broj sjedišta' },
    mjesto: { type: ['string', 'null'] },
    postanskiBroj: { type: ['string', 'null'] },
    iban: { type: ['string', 'null'], description: 'IBAN glavnog aktivnog računa, HR format' },
    uSustavuPdv: { type: ['boolean', 'null'], description: 'je li subjekt u sustavu PDV-a — SAMO ako je eksplicitno navedeno na stranici' },
    mbs: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    status: { type: ['string', 'null'], description: 'status subjekta: aktivan / blokiran / u stečaju / brisan' },
  },
} as const;

// OIB → URL profila preko companywall pretrage (?n=OIB). Deterministički:
// firecrawl 'links' format (bez LLM-a) pa filter na /tvrtka/ ili /obrt/ linkove;
// pretraga po OIB-u vraća najviše jedan subjekt.
export async function nadjiCompanywallUrl(env: Env, oib: string): Promise<string | null> {
  const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://www.companywall.hr/pretraga?n=${oib}`, formats: ['links'] }),
  });
  const odgovor = (await r.json()) as { success?: boolean; error?: string; data?: { links?: string[] } };
  if (!r.ok || !odgovor.success) throw new Error(odgovor.error ?? `firecrawl HTTP ${r.status}`);
  return (odgovor.data?.links ?? []).find((l) => /https:\/\/www\.companywall\.hr\/(tvrtka|obrt)\//.test(l)) ?? null;
}

// OIB → (pretraga → profil → ekstrakcija) u jednom pozivu; null ako profil ne postoji.
export async function dohvatiCompanywallPoOibu(env: Env, oib: string): Promise<CompanywallInfo | null> {
  const url = await nadjiCompanywallUrl(env, oib);
  if (!url) return null;
  return dohvatiCompanywall(env, url);
}

export async function dohvatiCompanywall(env: Env, url: string): Promise<CompanywallInfo> {
  const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      formats: [{
        type: 'json',
        prompt: 'Izvuci podatke o tvrtki/obrtu s ove companywall stranice. Ako podatak nije naveden, vrati null — ništa ne izmišljaj.',
        schema: CW_SHEMA,
      }],
    }),
  });
  const odgovor = (await r.json()) as { success?: boolean; error?: string; data?: { json?: Record<string, unknown> } };
  if (!r.ok || !odgovor.success) throw new Error(odgovor.error ?? `firecrawl HTTP ${r.status}`);
  const j = odgovor.data?.json ?? {};
  const s = (k: string): string | null => (typeof j[k] === 'string' && (j[k] as string).trim() ? (j[k] as string).trim() : null);

  const info: CompanywallInfo = {
    url,
    naziv: s('naziv'),
    oib: s('oib'),
    ulica: s('ulica'),
    mjesto: s('mjesto'),
    postanskiBroj: s('postanskiBroj'),
    iban: s('iban')?.replace(/\s+/g, '') ?? null,
    uSustavuPdv: typeof j.uSustavuPdv === 'boolean' ? j.uSustavuPdv : null,
    mbs: s('mbs'),
    email: s('email'),
    status: s('status'),
    upozorenja: [],
  };

  // LLM ekstrakcija = provjeri što se provjeriti da (OIB mod-11, IBAN oblik).
  if (info.oib && !validanOib(info.oib)) {
    info.upozorenja.push(`Izvučeni OIB '${info.oib}' ne prolazi mod-11 provjeru — NE koristi ga bez provjere na izvoru.`);
    info.oib = null;
  }
  if (info.iban && !/^HR\d{19}$/.test(info.iban)) {
    info.upozorenja.push(`Izvučeni IBAN '${info.iban}' nije valjan HR IBAN oblik — provjeri na izvoru.`);
    info.iban = null;
  }
  if (info.status && !/aktivan/i.test(info.status)) {
    info.upozorenja.push(`Status subjekta: '${info.status}' — provjeri prije onboardinga!`);
  }
  if (info.uSustavuPdv === null) {
    info.upozorenja.push('CompanyWall ne prikazuje PDV status — obavezno provjeri na PU: https://provjeri-rpo-pdv.porezna-uprava.hr/');
  }
  info.upozorenja.push('Podaci su LLM ekstrakcija s agregatora (mogu biti zastarjeli) — pregledaj prije spremanja.');
  return info;
}
