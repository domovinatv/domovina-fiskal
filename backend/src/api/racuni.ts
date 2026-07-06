// Javni Bearer API — /api/v1/*. Dva auth moda na istim rutama:
//   * mašinski: 'Bearer dfk_…' → SHA-256 → api_kljuc → tenant (webshop/integracija);
//   * korisnički: 'Bearer <GoTrue JWT>' + 'X-Tenant-Id' → verify vs GoTrue →
//     korisnik_tenant membership → tenant (customer dashboard).
// Sve o izdavatelju (OIB, prostor, uređaji, slijednost) je server-side;
// payload je kupac + stavke + tip. Vidi docs/knowledge/16-dashboard-sso.md.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiVarijable, Env, RacunRow, TenantRow } from '../types';
import {
  bindKorisnikTenant,
  createNaplatniUredaj,
  createOperater,
  createPoslovniProstor,
  findKorisnikTenant,
  findOrCreateKupac,
  findTenantByApiKeyHash,
  getAktivniCertifikat,
  getNaplatniUredajByOznaka,
  getOperaterByOib,
  getPdvRaspodjela,
  getPoslovniProstorByOznaka,
  getProizvod,
  getRacun,
  getRacunKontekst,
  getStavke,
  getTenant,
  izdajSkicu,
  listMojiTenanti,
  listNaplatniUredjaji,
  listOperateri,
  listPoslovniProstori,
  listProizvodi,
  listRacuni,
  searchKpd,
  touchApiKljuc,
  upisiRacun,
  zabiljeziSlanjeEmaila,
  type NoviRacunStavka,
  type SekvencaVrsta,
} from '../db';
import { verificirajGotrueToken } from '../auth/gotrue';
import { fiskalizirajRacun, okolinaIzEnv } from '../fiskal/fiskalizacija';
import { emailKonfiguriran, posaljiRacunEmailom } from '../email';
import { generirajRacunPdf } from '../pdf/racun-pdf';
import { godinaZagreb, normalizirajTekst, sha256Hex, validanOib } from '../util';
import {
  formatirajGreske,
  izracunajIznose,
  provjeriPdvPravila,
  racunModelShema,
  type RacunModel,
  type RazrijesenaStavka,
} from '../validacija';

export const apiV1 = new Hono<{ Bindings: Env; Variables: ApiVarijable }>();

// CORS za dashboard SPA (cross-origin) — MORA prije autha da preflight
// (OPTIONS bez Authorization headera) prođe. Origini iz DASHBOARD_ORIGIN (CSV).
apiV1.use('*', async (c, next) => {
  const dozvoljeni = (c.env.DASHBOARD_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const mw = cors({
    origin: (origin) => (dozvoljeni.includes(origin) ? origin : null),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86400,
  });
  return mw(c, next);
});

// Korisničke rute BEZ tenant scopea — JWT je dovoljan (dropdown/profil se pune
// prije nego što je tenant odabran).
const RUTE_BEZ_TENANTA = new Set(['/api/v1/moji-tenanti', '/api/v1/ja']);

// Bearer auth — grana po OBLIKU tokena (dfk_ prefiks vs JWT).
apiV1.use('*', async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    return c.json({ greska: "Nedostaje 'Authorization: Bearer <API ključ ili GoTrue JWT>' zaglavlje" }, 401);
  }
  const token = m[1];

  // ── Mašinski put (postojeći): dfk_… → SHA-256 → api_kljuc → tenant ──
  if (token.startsWith('dfk_')) {
    const hash = await sha256Hex(token);
    const rezultat = await findTenantByApiKeyHash(c.env.DB, hash);
    if (!rezultat) {
      return c.json({ greska: 'Nevažeći ili deaktiviran API ključ' }, 401);
    }
    c.set('tenant', rezultat.tenant);
    c.set('apiKljucId', rezultat.apiKljucId);
    c.executionCtx.waitUntil(touchApiKljuc(c.env.DB, rezultat.apiKljucId));
    return next();
  }

  // ── Korisnički put (dashboard): GoTrue JWT + X-Tenant-Id ──
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return c.json({ greska: 'Nevažeći token — očekivan API ključ (dfk_…) ili GoTrue JWT' }, 401);
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
    return c.json({ greska: 'Korisnička prijava nije konfigurirana (SUPABASE_URL/SUPABASE_ANON_KEY)' }, 503);
  }
  let gotrue;
  try {
    gotrue = await verificirajGotrueToken(c.env, token);
  } catch (e) {
    return c.json({ greska: `Provjera prijave nije uspjela (GoTrue nedostupan): ${(e as Error).message}` }, 502);
  }
  if (!gotrue) {
    return c.json({ greska: 'Nevažeća ili istekla prijava — prijavi se ponovno' }, 401);
  }

  // Rute bez tenant scopea: dovoljan je identitet.
  if (RUTE_BEZ_TENANTA.has(c.req.path)) {
    c.set('korisnik', { sub: gotrue.sub, email: gotrue.email });
    return next();
  }

  const tenantIdRaw = c.req.header('X-Tenant-Id') ?? '';
  const tenantId = Number(tenantIdRaw);
  if (!tenantIdRaw || !Number.isInteger(tenantId) || tenantId <= 0) {
    return c.json({ greska: "Nedostaje 'X-Tenant-Id' zaglavlje (odaberi tenanta)" }, 400);
  }

  // Membership: match po user_id (stabilan) ili email-bind fallback (§4).
  const kt = await findKorisnikTenant(c.env.DB, tenantId, gotrue.sub, gotrue.email);
  if (!kt) {
    return c.json({ greska: 'Korisnik nema pristup tom tenantu' }, 403);
  }
  if (!kt.user_id) {
    // Prva prijava: veži GoTrue sub na redak dodan po (verificiranom) emailu.
    await bindKorisnikTenant(c.env.DB, kt.id, gotrue.sub);
  }
  const tenant = await getTenant(c.env.DB, tenantId);
  if (!tenant || tenant.status !== 'active') {
    return c.json({ greska: 'Tenant nije aktivan' }, 403);
  }
  c.set('tenant', tenant);
  c.set('korisnik', { sub: gotrue.sub, email: gotrue.email, uloga: kt.uloga });
  return next();
});

// ── Korisnički endpointi (dashboard) ──

// Membershipi prijavljenog korisnika — puni dropdown za tenant-switch.
apiV1.get('/moji-tenanti', async (c) => {
  const korisnik = c.get('korisnik');
  if (!korisnik) {
    return c.json({ greska: 'Endpoint je dostupan samo uz korisničku prijavu (GoTrue JWT), ne uz API ključ' }, 400);
  }
  return c.json({ tenanti: await listMojiTenanti(c.env.DB, korisnik.sub, korisnik.email) });
});

// Profil + membershipi (opcionalni pogodniji oblik za frontend bootstrap).
apiV1.get('/ja', async (c) => {
  const korisnik = c.get('korisnik');
  if (!korisnik) {
    return c.json({ greska: 'Endpoint je dostupan samo uz korisničku prijavu (GoTrue JWT), ne uz API ključ' }, 400);
  }
  return c.json({
    email: korisnik.email,
    tenanti: await listMojiTenanti(c.env.DB, korisnik.sub, korisnik.email),
  });
});

const SEKVENCA_ZA_TIP: Record<string, SekvencaVrsta> = {
  PONUDA: 'ponuda',
  PREDRACUN: 'ponuda', // ponude i predračuni dijele slijed (Fira: tab "Ponude/Predračuni")
  RACUN: 'racun',
  FISKALNI_B2C: 'fiskalni', // odvojeni slijed — brojčana oznaka ide u ZKI/CIS
};
const TIP_U_DB: Record<string, 'ponuda' | 'predracun' | 'racun' | 'fiskalni_b2c'> = {
  PONUDA: 'ponuda',
  PREDRACUN: 'predracun',
  RACUN: 'racun',
  FISKALNI_B2C: 'fiskalni_b2c',
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

// Zajednička logika kreiranja dokumenta — koristi je API (JSON) i admin (forma).
export async function kreirajDokument(
  env: Env,
  tenant: TenantRow,
  model: RacunModel,
): Promise<{ racun: RacunRow } | { status: 400 | 404 | 409; greska: string; detalji?: { polje: string; poruka: string }[] }> {
  const db = env.DB;
  const pp = await getPoslovniProstorByOznaka(db, tenant.id, model.poslovniProstor);
  if (!pp) return { status: 404, greska: `Poslovni prostor s oznakom '${model.poslovniProstor}' ne postoji` };
  if (pp.datum_zatvaranja) return { status: 409, greska: `Poslovni prostor '${pp.oznaka}' je zatvoren (${pp.datum_zatvaranja})` };

  // Fiskalni B2C preduvjeti se provjeravaju PRIJE trošenja broja iz sekvence —
  // izdani fiskalni račun bez certifikata bio bi trajno nefiskalizabilan.
  if (model.tip === 'FISKALNI_B2C') {
    if (pp.cis_status !== 'prijavljen') {
      return {
        status: 409,
        greska: `Poslovni prostor '${pp.oznaka}' nije označen kao prijavljen u CIS (prijava ide kroz ePoreznu; označi je u adminu)`,
      };
    }
    const okolina = okolinaIzEnv(env);
    const cert = await getAktivniCertifikat(db, tenant.id, okolina);
    if (!cert) return { status: 409, greska: `Tenant nema aktivan certifikat za okolinu '${okolina}' — uploadaj P12 u adminu` };
    if (!cert.kljuc_pem_encrypted) {
      return { status: 409, greska: 'Certifikat je spremljen bez izvučenog ključa (prije faze 2) — ponovno ga uploadaj s lozinkom' };
    }
    const sAe = model.stavke.findIndex((s) => s.pdvKategorija === 'AE');
    if (sAe >= 0) {
      return {
        status: 400,
        greska: 'Validacija nije prošla',
        detalji: [{ polje: `stavke.${sAe}.pdvKategorija`, poruka: "prijenos porezne obveze ('AE') je B2B mehanizam — ne može na B2C fiskalni račun" }],
      };
    }
    if (model.stornoZaId) {
      const original = await getRacun(db, tenant.id, model.stornoZaId);
      if (!original) return { status: 404, greska: `Original za storno (id ${model.stornoZaId}) ne postoji` };
    }
  }

  const nu = await getNaplatniUredajByOznaka(db, pp.id, model.naplatniUredaj);
  if (!nu) return { status: 404, greska: `Naplatni uređaj s oznakom '${model.naplatniUredaj}' ne postoji u prostoru '${pp.oznaka}'` };
  if (!nu.aktivan) return { status: 409, greska: `Naplatni uređaj '${nu.oznaka}' je deaktiviran` };

  let operaterId: number | null = null;
  if (model.operaterOib) {
    const operater = await getOperaterByOib(db, tenant.id, model.operaterOib);
    if (!operater) return { status: 404, greska: `Operater s OIB-om '${model.operaterOib}' ne postoji` };
    if (!operater.aktivan) return { status: 409, greska: `Operater '${model.operaterOib}' je deaktiviran` };
    operaterId = operater.id;
  }

  const razrijeseno = await razrijesiStavke(db, tenant.id, model.stavke);
  if ('greska' in razrijeseno) return { status: 400, greska: 'Validacija nije prošla', detalji: [razrijeseno.greska] };

  // PDV pravila ovisna o tenantu (ne-PDV obveznik, prijenos porezne obveze).
  const pravila = provjeriPdvPravila(!!tenant.u_sustavu_pdv, razrijeseno.stavke);
  if (pravila.greske.length) return { status: 400, greska: 'Validacija nije prošla', detalji: pravila.greske };

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
  const iznosi = izracunajIznose(razrijeseno.stavke);
  const stavkeZaUpis: NoviRacunStavka[] = razrijeseno.stavke.map((s) => ({
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

  const racun = await upisiRacun(db, {
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
  });
  return { racun };
}

// Izdavanje dokumenta (faza 1: nefiskalni — PONUDA, PREDRACUN, RACUN).
apiV1.post('/racun', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ greska: 'Tijelo zahtjeva mora biti valjan JSON (Content-Type: application/json)' }, 400);
  }

  const parsed = racunModelShema.safeParse(body);
  if (!parsed.success) {
    return c.json({ greska: 'Validacija nije prošla', detalji: formatirajGreske(parsed.error) }, 400);
  }
  const model = parsed.data;

  // Fiskalni tipovi tek u fazama 2–3 — jasna poruka umjesto tihog spremanja.
  if (!(model.tip in TIP_U_DB)) {
    return c.json(
      { greska: `Tip '${model.tip}' još nije podržan — fiskalizacija B2C dolazi u fazi 2, eRačun u fazi 3. Podržani tipovi: PONUDA, PREDRACUN, RACUN.` },
      501,
    );
  }

  const tenant = c.get('tenant');
  const rezultat = await kreirajDokument(c.env, tenant, model);
  if ('greska' in rezultat) {
    return c.json({ greska: rezultat.greska, ...(rezultat.detalji ? { detalji: rezultat.detalji } : {}) }, rezultat.status);
  }

  // Fiskalni B2C: ZKI + pokušaj JIR-a odmah (CIS cilja < 2 s). Ako CIS ne
  // odgovori, račun OSTAJE izdan (ZKI je dovoljan) — JIR stiže naknadnom
  // dostavom (cron sweep ili POST /racun/:id/fiskaliziraj).
  if (model.tip === 'FISKALNI_B2C') {
    const fiskal = await fiskalizirajRacun(c.env, tenant.id, rezultat.racun.id).catch((e) => ({
      ok: false as const, greska: `Fiskalizacija nije uspjela: ${(e as Error).message}`, retryable: true,
    }));
    const svjezi = (await getRacun(c.env.DB, tenant.id, rezultat.racun.id)) ?? rezultat.racun;
    return c.json(
      {
        ...(await racunUOdgovor(c.env.DB, svjezi)),
        fiskalizacija: fiskal.ok
          ? { status: 'fiskaliziran' }
          : { status: 'ceka_jir', greska: fiskal.greska ?? null, automatskiRetry: fiskal.retryable ?? false },
      },
      201,
    );
  }
  return c.json(await racunUOdgovor(c.env.DB, rezultat.racun), 201);
});

// Ručno okidanje (naknadne) fiskalizacije — npr. nakon ispravka certifikata.
apiV1.post('/racun/:id/fiskaliziraj', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ greska: 'id mora biti pozitivan cijeli broj' }, 400);
  const tenant = c.get('tenant');
  const racun = await getRacun(c.env.DB, tenant.id, id);
  if (!racun) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  if (racun.tip_dokumenta !== 'fiskalni_b2c') return c.json({ greska: 'Samo FISKALNI_B2C dokumenti se fiskaliziraju' }, 409);
  if (racun.jir) return c.json({ greska: `Račun je već fiskaliziran (JIR ${racun.jir})` }, 409);

  const fiskal = await fiskalizirajRacun(c.env, tenant.id, id);
  const svjezi = (await getRacun(c.env.DB, tenant.id, id)) ?? racun;
  return c.json(
    {
      ...(await racunUOdgovor(c.env.DB, svjezi)),
      fiskalizacija: fiskal.ok
        ? { status: 'fiskaliziran' }
        : { status: 'ceka_jir', greska: fiskal.greska ?? null, automatskiRetry: fiskal.retryable ?? false },
    },
    fiskal.ok ? 200 : 502,
  );
});

// Izdavanje skice: dodijeli broj + status 'izdano'.
apiV1.post('/racun/:id/izdaj', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ greska: 'id mora biti pozitivan cijeli broj' }, 400);
  const tenant = c.get('tenant');
  const k = await getRacunKontekst(c.env.DB, tenant.id, id);
  if (!k) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  if (k.racun.status !== 'nacrt') return c.json({ greska: `Dokument ${k.racun.broj_racuna_full} je već izdan` }, 409);

  const sada = new Date();
  const izdan = await izdajSkicu(c.env.DB, {
    tenantId: tenant.id,
    racunId: id,
    sekvencaVrsta: k.racun.sekvenca_vrsta,
    oznakaSlijednosti: k.racun.oznaka_slijednosti,
    poslovniProstorId: k.racun.poslovni_prostor_id,
    naplatniUredajId: k.racun.naplatni_uredaj_id,
    oznPP: k.ppOznaka,
    oznNU: k.nuOznaka,
    godina: godinaZagreb(sada),
    datumVrijeme: sada.toISOString(),
  });
  if (!izdan) return c.json({ greska: 'Skica je u međuvremenu izdana ili obrisana' }, 409);
  return c.json(await racunUOdgovor(c.env.DB, izdan));
});

apiV1.get('/racun/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ greska: 'id mora biti pozitivan cijeli broj' }, 400);
  const racun = await getRacun(c.env.DB, c.get('tenant').id, id);
  if (!racun) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  return c.json(await racunUOdgovor(c.env.DB, racun));
});

// PDF vizualizacija dokumenta.
apiV1.get('/racun/:id/pdf', async (c) => {
  const id = Number(c.req.param('id'));
  const k = await getRacunKontekst(c.env.DB, c.get('tenant').id, id);
  if (!k) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  const pdf = await generirajRacunPdf(k);
  const ime = `${k.racun.tip_dokumenta}-${(k.racun.broj_racuna_full ?? 'skica').replace(/\//g, '-')}.pdf`;
  return new Response(pdf.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${ime}"`,
    },
  });
});

// Slanje dokumenta e-mailom (PDF privitak). Body: { "na": "adresa" } — default kupčev email.
apiV1.post('/racun/:id/posalji', async (c) => {
  if (!emailKonfiguriran(c.env)) {
    return c.json({ greska: 'Slanje e-maila nije konfigurirano (ni send_email binding ni RESEND_API_KEY)' }, 503);
  }
  const id = Number(c.req.param('id'));
  const tenant = c.get('tenant');
  const k = await getRacunKontekst(c.env.DB, tenant.id, id);
  if (!k) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  if (k.racun.status === 'nacrt') return c.json({ greska: 'Skica se ne šalje — prvo izdaj dokument (POST /racun/:id/izdaj)' }, 409);

  const body = await c.req.json().catch(() => ({}));
  const na = String((body as Record<string, unknown>).na ?? '').trim() || k.kupac?.email || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(na)) {
    return c.json({ greska: "Nema valjane adrese primatelja — pošalji { \"na\": \"adresa@primjer.hr\" } ili postavi email kupca" }, 400);
  }

  const pdf = await generirajRacunPdf(k);
  let kanal: string;
  try {
    ({ kanal } = await posaljiRacunEmailom(c.env, k, pdf, na));
  } catch (e) {
    const kod = (e as { code?: string }).code ?? '';
    return c.json({ greska: `Slanje nije uspjelo${kod ? ` (${kod})` : ''}: ${(e as Error).message}` }, 502);
  }
  await zabiljeziSlanjeEmaila(c.env.DB, tenant.id, id, na);
  return c.json({ ok: true, poslanoNa: na, kanal });
});

apiV1.get('/racun', async (c) => {
  const limit = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  const racuni = await listRacuni(c.env.DB, {
    tenantId: c.get('tenant').id,
    limit,
    offset,
    status: c.req.query('status') || undefined,
    tip: c.req.query('tip') || undefined,
  });
  return c.json({
    racuni: racuni.map((r) => ({
      id: r.id,
      brojRacuna: r.broj_racuna_full,
      tip: r.tip_dokumenta,
      status: r.status,
      datumVrijeme: r.datum_vrijeme,
      valuta: r.valuta,
      iznosSPdv: r.iznos_s_pdv,
    })),
    limit,
    offset,
  });
});

// ── Proizvodi (katalog) + KPD pretraga ──

apiV1.get('/proizvod', async (c) => {
  const proizvodi = await listProizvodi(c.env.DB, c.get('tenant').id);
  return c.json({
    proizvodi: proizvodi.map((p) => ({
      id: p.id, naziv: p.naziv, sifra: p.sifra, jedinicaMjere: p.jedinica_mjere,
      netoCijena: p.neto_cijena, pdvStopa: p.pdv_stopa, pdvKategorija: p.pdv_kategorija,
      kpd: p.kpd, aktivan: !!p.aktivan,
    })),
  });
});

apiV1.get('/kpd', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.trim().length < 2) return c.json({ greska: "Parametar 'q' mora imati barem 2 znaka" }, 400);
  return c.json({ rezultati: await searchKpd(c.env.DB, q, Number(c.req.query('limit') ?? 20)) });
});

// ── Postavke (prostori / uređaji / operateri) — self-service za dashboard ──
// Uloge (v1, minimalno): vlasnik/knjigovodja = puni pristup; operater smije
// izdavati/fiskalizirati, ali NE mijenjati postavke. Mašinski dfk_ ključ
// (bez korisnika) je tenant-scoped puni pristup — bez dodatnih ograničenja.

function operaterBezPostavki(c: { get: (k: 'korisnik') => ApiVarijable['korisnik'] }): boolean {
  return c.get('korisnik')?.uloga === 'operater';
}

apiV1.get('/postavke', async (c) => {
  const tenant = c.get('tenant');
  const [prostori, uredjaji, operateri] = await Promise.all([
    listPoslovniProstori(c.env.DB, tenant.id),
    listNaplatniUredjaji(c.env.DB, tenant.id),
    listOperateri(c.env.DB, tenant.id),
  ]);
  return c.json({
    tenant: { id: tenant.id, oib: tenant.oib, naziv: tenant.naziv, uSustavuPdv: !!tenant.u_sustavu_pdv },
    prostori: prostori.map((p) => ({
      id: p.id, oznaka: p.oznaka, ulica: p.adr_ulica, naselje: p.adr_naselje,
      primjenaOd: p.datum_pocetka_primjene, zatvoren: p.datum_zatvaranja, cisStatus: p.cis_status,
    })),
    uredjaji: uredjaji.map((u) => ({
      id: u.id, prostorOznaka: u.pp_oznaka, oznaka: u.oznaka, opis: u.opis, aktivan: !!u.aktivan,
    })),
    operateri: operateri.map((o) => ({ id: o.id, oib: o.oib_operatera, ime: o.ime, aktivan: !!o.aktivan })),
  });
});

apiV1.post('/postavke/prostor', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const oznaka = normalizirajTekst(String(body.oznaka ?? ''));
  const primjenaOd = String(body.primjenaOd ?? '').trim();
  if (!oznaka || !/^\d{4}-\d{2}-\d{2}$/.test(primjenaOd)) {
    return c.json({ greska: "Obavezno: 'oznaka' i 'primjenaOd' (YYYY-MM-DD)" }, 400);
  }
  try {
    const p = await createPoslovniProstor(c.env.DB, c.get('tenant').id, {
      oznaka,
      adrUlica: String(body.ulica ?? '').trim() || null,
      adrNaselje: String(body.naselje ?? '').trim() || null,
      datumPocetkaPrimjene: primjenaOd,
    });
    return c.json({ id: p.id, oznaka: p.oznaka }, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ greska: `Prostor '${oznaka}' već postoji` }, 409);
    throw e;
  }
});

apiV1.post('/postavke/uredjaj', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const prostorOznaka = String(body.prostorOznaka ?? '').trim();
  const oznaka = normalizirajTekst(String(body.oznaka ?? ''));
  if (!prostorOznaka || !oznaka) return c.json({ greska: "Obavezno: 'prostorOznaka' i 'oznaka'" }, 400);
  const pp = await getPoslovniProstorByOznaka(c.env.DB, c.get('tenant').id, prostorOznaka);
  if (!pp) return c.json({ greska: `Poslovni prostor '${prostorOznaka}' ne postoji` }, 404);
  try {
    const u = await createNaplatniUredaj(c.env.DB, pp.id, { oznaka, opis: String(body.opis ?? '').trim() || null });
    return c.json({ id: u.id, oznaka: u.oznaka }, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ greska: `Uređaj '${oznaka}' već postoji u tom prostoru` }, 409);
    throw e;
  }
});

apiV1.post('/postavke/operater', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const oib = String(body.oib ?? '').trim();
  if (!validanOib(oib)) return c.json({ greska: `OIB operatera '${oib}' nije valjan` }, 400);
  try {
    const o = await createOperater(c.env.DB, c.get('tenant').id, {
      oibOperatera: oib,
      ime: normalizirajTekst(String(body.ime ?? '')) || null,
    });
    return c.json({ id: o.id, oib: o.oib_operatera }, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ greska: `Operater ${oib} već postoji` }, 409);
    throw e;
  }
});

// Puni JSON prikaz dokumenta (za 201 i GET po id-u).
async function racunUOdgovor(db: D1Database, r: RacunRow) {
  const [stavke, raspodjela] = await Promise.all([getStavke(db, r.id), getPdvRaspodjela(db, r.id)]);
  return {
    id: r.id,
    brojRacuna: r.broj_racuna_full, // null za skicu
    redniBroj: r.redni_broj,
    godina: r.godina,
    tip: r.tip_dokumenta,
    status: r.status,
    datumVrijeme: r.datum_vrijeme,
    datumDospijeca: r.datum_dospijeca,
    vrijediDo: r.vrijedi_do,
    datumIsporuke: r.datum_isporuke,
    valuta: r.valuta,
    nacinPlacanja: r.nacin_placanja,
    placanje: r.broj_racuna_full ? { model: r.model_placanja, pozivNaBroj: r.poziv_na_broj } : null,
    iznosi: {
      neto: r.neto,
      iznosBezPdv: r.iznos_bez_pdv,
      pdv: r.pdv,
      iznosSPdv: r.iznos_s_pdv,
      dospijevaZaPlacanje: r.dospijeva_za_placanje,
    },
    klauzulaPdv: r.klauzula_pdv,
    napomena: r.napomena,
    pdvRaspodjela: raspodjela.map((p) => ({
      kategorija: p.kategorija_pdv,
      stopa: p.stopa,
      oporeziviIznos: p.oporezivi_iznos,
      iznosPoreza: p.iznos_poreza,
    })),
    stavke: stavke.map((s) => ({
      redniBroj: s.redni_broj,
      naziv: s.naziv,
      kolicina: s.kolicina,
      jedinicaMjere: s.jedinica_mjere,
      netoCijena: s.neto_cijena,
      popustPosto: s.popust_posto,
      pdvKategorija: s.pdv_kategorija,
      pdvStopa: s.pdv_stopa,
      kpd: s.kpd,
      proizvodId: s.proizvod_id,
    })),
    pdf: `/api/v1/racun/${r.id}/pdf`,
    poslanoEmail: r.poslano_email_ts ? { kada: r.poslano_email_ts, na: r.poslano_email_na } : null,
    // Fiskalizacija (faza 2) — popunjeno samo za tip fiskalni_b2c.
    zki: r.zki,
    jir: r.jir,
    fiskalniQr: r.qr_payload,
    ...(r.tip_dokumenta === 'fiskalni_b2c'
      ? {
          fiskalGreska: r.fiskal_greska,
          fiskalPokusaja: r.fiskal_pokusaja,
          naknadnaDostava: !!r.fiskal_nak_dost,
          stornoZaId: r.storno_racun_id,
        }
      : {}),
  };
}
