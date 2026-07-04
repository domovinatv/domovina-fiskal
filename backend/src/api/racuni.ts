// Javni Bearer API — /api/v1/*. API ključ = tenant identitet: sve o izdavatelju
// (OIB, prostor, uređaji, slijednost) server-side; payload je kupac + stavke + tip.

import { Hono } from 'hono';
import type { ApiVarijable, Env, RacunRow, TenantRow } from '../types';
import {
  findOrCreateKupac,
  findTenantByApiKeyHash,
  getNaplatniUredajByOznaka,
  getOperaterByOib,
  getPdvRaspodjela,
  getPoslovniProstorByOznaka,
  getProizvod,
  getRacun,
  getRacunKontekst,
  getStavke,
  izdajSkicu,
  listProizvodi,
  listRacuni,
  searchKpd,
  touchApiKljuc,
  upisiRacun,
  zabiljeziSlanjeEmaila,
  type NoviRacunStavka,
  type SekvencaVrsta,
} from '../db';
import { posaljiRacunEmailom } from '../email';
import { generirajRacunPdf } from '../pdf/racun-pdf';
import { godinaZagreb, sha256Hex } from '../util';
import {
  formatirajGreske,
  izracunajIznose,
  provjeriPdvPravila,
  racunModelShema,
  type RacunModel,
  type RazrijesenaStavka,
} from '../validacija';

export const apiV1 = new Hono<{ Bindings: Env; Variables: ApiVarijable }>();

// Bearer auth: 'Authorization: Bearer dfk_…' → SHA-256 → api_kljuc → tenant.
apiV1.use('*', async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    return c.json({ greska: "Nedostaje 'Authorization: Bearer <API ključ>' zaglavlje" }, 401);
  }
  const hash = await sha256Hex(m[1]);
  const rezultat = await findTenantByApiKeyHash(c.env.DB, hash);
  if (!rezultat) {
    return c.json({ greska: 'Nevažeći ili deaktiviran API ključ' }, 401);
  }
  c.set('tenant', rezultat.tenant);
  c.set('apiKljucId', rezultat.apiKljucId);
  c.executionCtx.waitUntil(touchApiKljuc(c.env.DB, rezultat.apiKljucId));
  await next();
});

const SEKVENCA_ZA_TIP: Record<string, SekvencaVrsta> = {
  PONUDA: 'ponuda',
  PREDRACUN: 'ponuda', // ponude i predračuni dijele slijed (Fira: tab "Ponude/Predračuni")
  RACUN: 'racun',
};
const TIP_U_DB: Record<string, 'ponuda' | 'predracun' | 'racun'> = {
  PONUDA: 'ponuda',
  PREDRACUN: 'predracun',
  RACUN: 'racun',
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
  db: D1Database,
  tenant: TenantRow,
  model: RacunModel,
): Promise<{ racun: RacunRow } | { status: 400 | 404 | 409; greska: string; detalji?: { polje: string; poruka: string }[] }> {
  const pp = await getPoslovniProstorByOznaka(db, tenant.id, model.poslovniProstor);
  if (!pp) return { status: 404, greska: `Poslovni prostor s oznakom '${model.poslovniProstor}' ne postoji` };
  if (pp.datum_zatvaranja) return { status: 409, greska: `Poslovni prostor '${pp.oznaka}' je zatvoren (${pp.datum_zatvaranja})` };

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

  const rezultat = await kreirajDokument(c.env.DB, c.get('tenant'), model);
  if ('greska' in rezultat) {
    return c.json({ greska: rezultat.greska, ...(rezultat.detalji ? { detalji: rezultat.detalji } : {}) }, rezultat.status);
  }
  return c.json(await racunUOdgovor(c.env.DB, rezultat.racun), 201);
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
  if (!c.env.EMAIL) {
    return c.json({ greska: 'Slanje e-maila nije konfigurirano (send_email binding / Email Sending nije uključen za domenu)' }, 503);
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
  try {
    await posaljiRacunEmailom(c.env.EMAIL, k, pdf, na);
  } catch (e) {
    const kod = (e as { code?: string }).code ?? '';
    return c.json({ greska: `Slanje nije uspjelo${kod ? ` (${kod})` : ''}: ${(e as Error).message}` }, 502);
  }
  await zabiljeziSlanjeEmaila(c.env.DB, tenant.id, id, na);
  return c.json({ ok: true, poslanoNa: na });
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
    // JIR/ZKI/QR dolaze s fiskalizacijom (faza 2) — do tada null.
    zki: r.zki,
    jir: r.jir,
  };
}
