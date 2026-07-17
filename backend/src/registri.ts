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

const SUDREG_API = 'https://sudreg-data.gov.hr/api';
const VIES_API = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

export interface OibInfo {
  oib: string;
  izvor: 'sudreg' | 'vies' | null;
  naziv: string | null;
  ulica: string | null; // ulica + kućni broj
  mjesto: string | null;
  postanskiBroj: string | null;
  email: string | null; // službeni e-mail iz sudskog registra (koristan za SSO pristup)
  pravniOblik: string | null; // kratica, npr. 'd.o.o.' (samo sudreg)
  viesValjan: boolean | null; // aktivan PDV ID; null = VIES nedostupan
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

export async function dohvatiPoOibu(env: Env, oib: string): Promise<OibInfo> {
  const info: OibInfo = {
    oib, izvor: null, naziv: null, ulica: null, mjesto: null, postanskiBroj: null,
    email: null, pravniOblik: null, viesValjan: null, upozorenja: [],
  };

  const imaSudregKredencijale = !!(env.SUDREG_CLIENT_ID && env.SUDREG_CLIENT_SECRET);
  if (!imaSudregKredencijale) {
    info.upozorenja.push('SUDREG_CLIENT_ID/SECRET secreti nisu postavljeni — dohvat samo iz VIES-a.');
  }

  // Paralelno: sudreg (ako ima kredencijala) + VIES.
  const [sudregIshod, viesIshod] = await Promise.allSettled([
    imaSudregKredencijale ? dohvatiSudreg(env, oib) : Promise.resolve(null),
    dohvatiVies(oib),
  ]);

  const vies = viesIshod.status === 'fulfilled' ? viesIshod.value : null;
  if (vies) info.viesValjan = vies.valid;
  else info.upozorenja.push(`VIES trenutno nedostupan (${(viesIshod as PromiseRejectedResult).reason}).`);

  if (sudregIshod.status === 'rejected') {
    info.upozorenja.push(`Sudski registar nedostupan (${sudregIshod.reason}) — pokušaj ponovno ili unesi ručno.`);
  }
  const sudreg = sudregIshod.status === 'fulfilled' ? sudregIshod.value : null;

  const viesAdresa = vies?.valid && vies.address ? parsirajViesAdresu(vies.address) : null;

  if (sudreg) {
    info.izvor = 'sudreg';
    info.naziv = sudreg.tvrtka?.ime ?? sudreg.skracena_tvrtka?.ime ?? null;
    const s = sudreg.sjediste;
    info.ulica = s?.ulica ? `${s.ulica} ${s.kucni_broj ?? ''}`.trim() : null;
    info.mjesto = s?.naziv_naselja ?? null;
    info.postanskiBroj = viesAdresa?.postanskiBroj ?? null; // sudreg nema PBR — dopuna iz VIES-a
    info.email = sudreg.email_adrese?.[0]?.adresa ?? null;
    info.pravniOblik = sudreg.pravni_oblik?.vrsta_pravnog_oblika?.kratica ?? null;
  } else if (vies?.valid) {
    info.izvor = 'vies';
    info.naziv = vies.name ?? null;
    if (viesAdresa) Object.assign(info, viesAdresa);
    if (imaSudregKredencijale && sudregIshod.status === 'fulfilled') {
      info.upozorenja.push(
        'Subjekt nije u sudskom registru (vjerojatno obrt/OPG) — podaci iz VIES-a; za obrt je naziv često ime vlasnika, provjeri i dopuni naziv obrta ručno.',
      );
    }
  } else if (vies && !vies.valid) {
    info.upozorenja.push(
      'OIB nije pronađen ni u sudskom registru ni u VIES-u (subjekt bez PDV ID-a) — unesi podatke ručno.',
    );
  }

  // Uvijek: što se NE može dohvatiti javno.
  info.upozorenja.push(
    'PDV status obavezno provjeri na PU aplikaciji (VIES "valjan" ≠ u sustavu PDV-a!): https://provjeri-rpo-pdv.porezna-uprava.hr/',
    'IBAN nema javnog izvora — unesi ručno.',
  );
  return info;
}
