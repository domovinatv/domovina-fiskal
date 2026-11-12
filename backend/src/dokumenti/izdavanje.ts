// Servis izdavanja dokumenata — zajednički za javni API (JSON) i admin (forma).
// Ne zna za HTTP: ishodi greške nose `vrsta`, a pozivatelj ih mapira u status
// (API) ili poruku (admin).

import {
  findOrCreateKupac,
  getAktivniCertifikat,
  getNaplatniUredajByOznaka,
  getOperaterByOib,
  getPoslovniProstorByOznaka,
  getProizvod,
  getRacun,
  getRacunPoReferenci,
  jeSukobReference,
  stornoGreskaTriggera,
  upisiRacun,
  zbrojStornaCenti,
  type NoviRacunStavka,
  type SekvencaVrsta,
} from '../db';
import { fiskalizirajRacun, okolinaIzEnv, type FiskalizacijaIshod } from '../fiskal/fiskalizacija';
import type { Env, RacunRow, TenantRow } from '../types';
import { godinaZagreb, izCenti, kanonskiJson, sha256Hex, uCente } from '../util';
import { izracunajIznose, provjeriPdvPravila, type RacunModel, type RazrijesenaStavka } from '../validacija';

const SEKVENCA_ZA_TIP: Record<string, SekvencaVrsta> = {
  PONUDA: 'ponuda',
  PREDRACUN: 'ponuda', // ponude i predračuni dijele slijed (Fira: tab "Ponude/Predračuni")
  RACUN: 'racun',
  FISKALNI_B2C: 'fiskalni', // odvojeni slijed — brojčana oznaka ide u ZKI/CIS
  ERACUN_B2B: 'racun', // eRačun je pravni račun — dijeli slijed računa
  ERACUN_B2G: 'racun',
};
export const TIP_U_DB: Record<string, 'ponuda' | 'predracun' | 'racun' | 'fiskalni_b2c' | 'eracun_b2b' | 'eracun_b2g'> = {
  PONUDA: 'ponuda',
  PREDRACUN: 'predracun',
  RACUN: 'racun',
  FISKALNI_B2C: 'fiskalni_b2c',
  ERACUN_B2B: 'eracun_b2b',
  ERACUN_B2G: 'eracun_b2g',
};

// Razrješavanje stavki: proizvodId → podaci iz kataloga (polja u payloadu nadjačavaju).
async function razrijesiStavke(
  db: D1Database,
  tenantId: number,
  stavke: RacunModel['stavke'],
): Promise<{ stavke: RazrijesenaStavka[] } | { greska: { polje: string; poruka: string } }> {
  const rezultat: RazrijesenaStavka[] = [];
  for (let i = 0; i < stavke.length; i++) {
    const s = stavke[i];
    if (s.proizvodId) {
      const p = await getProizvod(db, tenantId, s.proizvodId);
      if (!p) return { greska: { polje: `stavke.${i}.proizvodId`, poruka: `proizvod ${s.proizvodId} ne postoji u katalogu` } };
      rezultat.push({
        naziv: s.naziv ?? p.naziv,
        opis: s.opis ?? p.opis,
        kolicina: s.kolicina,
        jedinicaMjere: s.jedinicaMjere ?? p.jedinica_mjere,
        netoCijena: s.netoCijena ?? p.neto_cijena,
        popustPosto: s.popustPosto,
        pdvStopa: s.pdvStopa ?? p.pdv_stopa,
        pdvKategorija: s.pdvKategorija ?? p.pdv_kategorija,
        kpd: s.kpd ?? p.kpd,
        proizvodId: p.id,
      });
    } else {
      rezultat.push({
        naziv: s.naziv!,
        opis: s.opis ?? null,
        kolicina: s.kolicina,
        jedinicaMjere: s.jedinicaMjere ?? 'H87',
        netoCijena: s.netoCijena!,
        popustPosto: s.popustPosto,
        pdvStopa: s.pdvStopa!,
        pdvKategorija: s.pdvKategorija ?? (s.pdvStopa === '0' ? 'Z' : 'S'),
        kpd: s.kpd ?? null,
        proizvodId: null,
      });
    }
  }
  return { stavke: rezultat };
}

// Vrsta greške izdavanja; API je mapira u 400/404/409, admin u poruku forme.
export type GreskaVrsta = 'validacija' | 'ne_postoji' | 'sukob';

export interface IzdavanjeGreska {
  vrsta: GreskaVrsta;
  greska: string;
  detalji?: { polje: string; poruka: string }[];
  racunId?: number;
}

export type KreiranjeIshod = { racun: RacunRow; ponovljen: boolean } | IzdavanjeGreska;

// SHA-256 kanoničkog JSON-a modela BEZ reference: isti sadržaj (neovisno o
// redoslijedu polja i obliku brojeva — zod ih normalizira) = isti hash.
export async function hashZahtjeva(model: RacunModel): Promise<string> {
  const { vanjskaReferenca: _ref, ...sadrzaj } = model;
  return sha256Hex(kanonskiJson(sadrzaj));
}

// Referenca već postoji: isti sadržaj → ponovljeni zahtjev (vrati postojeći,
// NE izdaji ni ne fiskaliziraj ponovno); drugi sadržaj → sukob.
function ishodPostojeceg(postojeci: RacunRow, zahtjevHash: string | null): KreiranjeIshod {
  if (postojeci.zahtjev_hash && postojeci.zahtjev_hash === zahtjevHash) return { racun: postojeci, ponovljen: true };
  return { vrsta: 'sukob', greska: 'vanjskaReferenca je već iskorištena za drukčiji račun', racunId: postojeci.id };
}

// Zajednička logika kreiranja dokumenta — koristi je API (JSON) i admin (forma).
// S vanjskaReferenca je idempotentna (Faza 4.1): ponovljeni zahtjev vraća
// postojeći dokument (ponovljen: true) i ne troši broj iz slijeda.
export async function kreirajDokument(env: Env, tenant: TenantRow, model: RacunModel): Promise<KreiranjeIshod> {
  const db = env.DB;
  const referenca = model.vanjskaReferenca ?? null;
  const zahtjevHash = referenca ? await hashZahtjeva(model) : null;
  // Provjera reference PRIJE preduvjeta: ponovljeni zahtjev dobiva postojeći
  // račun i kad se preduvjeti u međuvremenu promijene (npr. istekne certifikat).
  if (referenca) {
    const postojeci = await getRacunPoReferenci(db, tenant.id, referenca);
    if (postojeci) return ishodPostojeceg(postojeci, zahtjevHash);
  }

  const pp = await getPoslovniProstorByOznaka(db, tenant.id, model.poslovniProstor);
  if (!pp) return { vrsta: 'ne_postoji', greska: `Poslovni prostor s oznakom '${model.poslovniProstor}' ne postoji` };
  if (pp.datum_zatvaranja) return { vrsta: 'sukob', greska: `Poslovni prostor '${pp.oznaka}' je zatvoren (${pp.datum_zatvaranja})` };

  // Fiskalni B2C preduvjeti se provjeravaju PRIJE trošenja broja iz sekvence —
  // izdani fiskalni račun bez certifikata bio bi trajno nefiskalizabilan.
  if (model.tip === 'FISKALNI_B2C') {
    if (pp.cis_status !== 'prijavljen') {
      return {
        vrsta: 'sukob',
        greska: `Poslovni prostor '${pp.oznaka}' nije označen kao prijavljen u CIS (prijava ide kroz ePoreznu; označi je u adminu)`,
      };
    }
    const okolina = okolinaIzEnv(env);
    const cert = await getAktivniCertifikat(db, tenant.id, okolina);
    if (!cert) return { vrsta: 'sukob', greska: `Tenant nema aktivan certifikat za okolinu '${okolina}' — uploadaj P12 u adminu` };
    if (!cert.kljuc_pem_encrypted) {
      return { vrsta: 'sukob', greska: 'Certifikat je spremljen bez izvučenog ključa (prije faze 2) — ponovno ga uploadaj s lozinkom' };
    }
    // Istekao cert: račun izdan sada ne bi se mogao fiskalizirati (ni ZKI) — N2.
    if (cert.not_after && new Date(cert.not_after).getTime() <= Date.now()) {
      return { vrsta: 'sukob', greska: `Certifikat je istekao ${cert.not_after} — obnovi ga (upload novog P12 u adminu) prije izdavanja fiskalnih računa` };
    }
    if (cert.oib_certifikata && cert.oib_certifikata !== tenant.oib) {
      return { vrsta: 'sukob', greska: `OIB certifikata (${cert.oib_certifikata}) ne odgovara OIB-u tenanta (${tenant.oib}) — CIS bi odbio račun (s005)` };
    }
    const sAe = model.stavke.findIndex((s) => s.pdvKategorija === 'AE');
    if (sAe >= 0) {
      return {
        vrsta: 'validacija',
        greska: 'Validacija nije prošla',
        detalji: [{ polje: `stavke.${sAe}.pdvKategorija`, poruka: "prijenos porezne obveze ('AE') je B2B mehanizam — ne može na B2C fiskalni račun" }],
      };
    }
  }

  // Storno (Faza 4.3, N6): original istog tenanta, fiskalni, sa ZKI-jem, ne
  // storniran; iznos se provjerava niže (nakon izračuna). Trigger 0009 čuva
  // istu granicu i kod utrke dva storna.
  let original: RacunRow | null = null;
  if (model.stornoZaId) {
    if (model.tip !== 'FISKALNI_B2C') {
      return { vrsta: 'validacija', greska: "stornoZaId je podržan samo za tip 'FISKALNI_B2C'" };
    }
    original = await getRacun(db, tenant.id, model.stornoZaId);
    if (!original) return { vrsta: 'ne_postoji', greska: `Original za storno (id ${model.stornoZaId}) ne postoji` };
    if (original.tip_dokumenta !== 'fiskalni_b2c') {
      return { vrsta: 'validacija', greska: `Dokument ${original.broj_racuna_full ?? original.id} nije fiskalni B2C račun — storno je moguć samo za fiskalni račun` };
    }
    if (original.storno_racun_id) return { vrsta: 'validacija', greska: 'Original je i sam storno — storno storna nije dopušten' };
    if (!original.zki) {
      return { vrsta: 'sukob', greska: `Račun ${original.broj_racuna_full} nema ZKI (fiskalizacija nije ni započela) — prvo ga fiskaliziraj` };
    }
    if (original.status === 'storniran') return { vrsta: 'sukob', greska: `Račun ${original.broj_racuna_full} je već u cijelosti storniran` };
  }

  const nu = await getNaplatniUredajByOznaka(db, pp.id, model.naplatniUredaj);
  if (!nu) return { vrsta: 'ne_postoji', greska: `Naplatni uređaj s oznakom '${model.naplatniUredaj}' ne postoji u prostoru '${pp.oznaka}'` };
  if (!nu.aktivan) return { vrsta: 'sukob', greska: `Naplatni uređaj '${nu.oznaka}' je deaktiviran` };

  let operaterId: number | null = null;
  if (model.operaterOib) {
    const operater = await getOperaterByOib(db, tenant.id, model.operaterOib);
    if (!operater) return { vrsta: 'ne_postoji', greska: `Operater s OIB-om '${model.operaterOib}' ne postoji` };
    if (!operater.aktivan) return { vrsta: 'sukob', greska: `Operater '${model.operaterOib}' je deaktiviran` };
    operaterId = operater.id;
  }

  const razrijeseno = await razrijesiStavke(db, tenant.id, model.stavke);
  if ('greska' in razrijeseno) return { vrsta: 'validacija', greska: 'Validacija nije prošla', detalji: [razrijeseno.greska] };

  // PDV pravila ovisna o tenantu (ne-PDV obveznik, prijenos porezne obveze).
  const pravila = provjeriPdvPravila(!!tenant.u_sustavu_pdv, razrijeseno.stavke);
  if (pravila.greske.length) return { vrsta: 'validacija', greska: 'Validacija nije prošla', detalji: pravila.greske };
  const stavke = pravila.stavke; // normalizirane (ne-PDV → kategorija E, K3)

  let kupacId: number | null = null;
  if (model.kupac) {
    kupacId = await findOrCreateKupac(db, tenant.id, {
      naziv: model.kupac.naziv,
      oib: model.kupac.oib ?? null,
      vatNumber: model.kupac.vatNumber ?? null,
      adrUlica: model.kupac.adresa?.ulica ?? null,
      adrGrad: model.kupac.adresa?.grad ?? null,
      adrPostanskiBroj: model.kupac.adresa?.postanskiBroj ?? null,
      adrDrzava: model.kupac.adresa?.drzava ?? 'HR',
      email: model.kupac.email ?? null,
      tip: model.kupac.tip ?? null,
    });
  }

  const sada = new Date();
  const iznosi = izracunajIznose(stavke);

  if (original) {
    const stornoCenti = uCente(iznosi.iznosSPdv, 'iznosSPdv');
    if (stornoCenti >= 0) {
      return { vrsta: 'validacija', greska: 'Storno mora imati negativan ukupni iznos (negativne cijene stavki, pozitivne količine)' };
    }
    const vecStornirano = await zbrojStornaCenti(db, original.id);
    const originalCenti = uCente(original.iznos_s_pdv ?? '0', 'iznosOriginala');
    if (-(vecStornirano + stornoCenti) > originalCenti) {
      return {
        vrsta: 'sukob',
        greska: `Storno ${izCenti(-stornoCenti)} premašuje preostali iznos računa ${original.broj_racuna_full} (${izCenti(originalCenti + vecStornirano)} od ${izCenti(originalCenti)})`,
      };
    }
  }
  const stavkeZaUpis: NoviRacunStavka[] = stavke.map((s) => ({
    naziv: s.naziv,
    opis: s.opis,
    kolicina: String(s.kolicina),
    jedinicaMjere: s.jedinicaMjere,
    netoCijena: s.netoCijena,
    popustPosto: s.popustPosto,
    pdvKategorija: s.pdvKategorija,
    pdvStopa: s.pdvStopa,
    kpd: s.kpd,
    proizvodId: s.proizvodId,
  }));

  let racun: RacunRow;
  try {
    racun = await upisiRacun(db, {
      tenantId: tenant.id,
      poslovniProstorId: pp.id,
      naplatniUredajId: nu.id,
      operaterId,
      kupacId,
      oznakaSlijednosti: tenant.oznaka_slijednosti_def,
      oznPP: pp.oznaka,
      oznNU: nu.oznaka,
      godina: godinaZagreb(sada),
      datumVrijeme: sada.toISOString(),
      tipDokumenta: TIP_U_DB[model.tip],
      sekvencaVrsta: SEKVENCA_ZA_TIP[model.tip],
      valuta: model.valuta,
      nacinPlacanja: model.nacinPlacanja.toLowerCase(),
      datumDospijeca: model.datumDospijeca ?? null,
      vrijediDo: model.vrijediDo ?? null,
      datumIsporuke: model.datumIsporuke ?? null,
      napomena: model.napomena || null,
      internaBiljeska: model.internaBiljeska || null,
      uvjeti: model.uvjeti || null,
      klauzulaPdv: pravila.klauzula,
      neto: iznosi.neto,
      iznosBezPdv: iznosi.iznosBezPdv,
      pdv: iznosi.pdv,
      iznosSPdv: iznosi.iznosSPdv,
      dospijevaZaPlacanje: iznosi.dospijevaZaPlacanje,
      status: model.status,
      stavke: stavkeZaUpis,
      pdvRaspodjela: iznosi.raspodjela,
      stornoRacunId: model.stornoZaId ?? null,
      vanjskaReferenca: referenca,
      zahtjevHash,
    });
  } catch (e) {
    // Utrka: istodobni zahtjev s istom referencom upisao je prvi. Batch je
    // vraćen unatrag u cijelosti (i sekvenca+1) — broj NIJE potrošen.
    const stornoGreska = stornoGreskaTriggera(e);
    if (stornoGreska) return { vrsta: 'sukob', greska: `Storno odbijen: ${stornoGreska}` };
    if (!referenca || !jeSukobReference(e)) throw e;
    const postojeci = await getRacunPoReferenci(db, tenant.id, referenca);
    if (!postojeci) throw e;
    return ishodPostojeceg(postojeci, zahtjevHash);
  }
  return { racun, ponovljen: false };
}

export type IzdavanjeIshod =
  | { racun: RacunRow; ponovljen: boolean; fiskalizacija?: FiskalizacijaIshod }
  | IzdavanjeGreska;

// Kreiranje + (za novi FISKALNI_B2C) sinkroni pokušaj fiskalizacije: ZKI mora
// biti na računu u trenutku izdavanja; JIR ako CIS odgovori (cilj < 2 s), inače
// račun OSTAJE izdan i JIR dovršava naknadna dostava (cron sweep ili
// POST /racun/:id/fiskaliziraj). Ponovljeni zahtjev se NE fiskalizira ponovno.
// `racun` je svjež redak nakon fiskalizacije (zki/jir/greška upisani).
export async function izdajDokument(env: Env, tenant: TenantRow, model: RacunModel): Promise<IzdavanjeIshod> {
  const rezultat = await kreirajDokument(env, tenant, model);
  if ('greska' in rezultat || rezultat.ponovljen || model.tip !== 'FISKALNI_B2C') return rezultat;
  const fiskalizacija: FiskalizacijaIshod = await fiskalizirajRacun(env, tenant.id, rezultat.racun.id).catch((e) => ({
    ok: false, greska: `Fiskalizacija nije uspjela: ${(e as Error).message}`, retryable: true,
  }));
  const svjezi = (await getRacun(env.DB, tenant.id, rezultat.racun.id)) ?? rezultat.racun;
  return { racun: svjezi, ponovljen: false, fiskalizacija };
}
