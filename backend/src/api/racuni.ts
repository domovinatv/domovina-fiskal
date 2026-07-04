// Javni Bearer API — /api/v1/*. API ključ = tenant identitet: sve o izdavatelju
// (OIB, prostor, uređaji, slijednost) server-side; payload je kupac + stavke + tip.

import { Hono } from 'hono';
import type { ApiVarijable, Env, RacunRow } from '../types';
import {
  findOrCreateKupac,
  findTenantByApiKeyHash,
  getNaplatniUredajByOznaka,
  getOperaterByOib,
  getPdvRaspodjela,
  getPoslovniProstorByOznaka,
  getRacun,
  getStavke,
  izdajRacun,
  listRacuni,
  touchApiKljuc,
} from '../db';
import { godinaZagreb, sha256Hex } from '../util';
import { formatirajGreske, izracunajIznose, racunModelShema } from '../validacija';

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

// Izdavanje dokumenta (faza 0: samo nefiskalni — PONUDA i RACUN).
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

  // Fiskalni tipovi tek u fazama 2–3 — jasna poruka umjesto tihog spremanja
  // (nacrt fiskalnog računa bi trošio brojeve iz fiskalne sekvence).
  if (model.tip !== 'PONUDA' && model.tip !== 'RACUN') {
    return c.json(
      { greska: `Tip '${model.tip}' još nije podržan — fiskalizacija B2C dolazi u fazi 2, eRačun u fazi 3. Podržani tipovi: PONUDA, RACUN.` },
      501,
    );
  }

  const tenant = c.get('tenant');

  // Razrješavanje konteksta izdavanja po oznakama (server-side, iz tenanta).
  const pp = await getPoslovniProstorByOznaka(c.env.DB, tenant.id, model.poslovniProstor);
  if (!pp) return c.json({ greska: `Poslovni prostor s oznakom '${model.poslovniProstor}' ne postoji` }, 404);
  if (pp.datum_zatvaranja) return c.json({ greska: `Poslovni prostor '${pp.oznaka}' je zatvoren (${pp.datum_zatvaranja})` }, 409);

  const nu = await getNaplatniUredajByOznaka(c.env.DB, pp.id, model.naplatniUredaj);
  if (!nu) return c.json({ greska: `Naplatni uređaj s oznakom '${model.naplatniUredaj}' ne postoji u prostoru '${pp.oznaka}'` }, 404);
  if (!nu.aktivan) return c.json({ greska: `Naplatni uređaj '${nu.oznaka}' je deaktiviran` }, 409);

  let operaterId: number | null = null;
  if (model.operaterOib) {
    const operater = await getOperaterByOib(c.env.DB, tenant.id, model.operaterOib);
    if (!operater) return c.json({ greska: `Operater s OIB-om '${model.operaterOib}' ne postoji` }, 404);
    if (!operater.aktivan) return c.json({ greska: `Operater '${model.operaterOib}' je deaktiviran` }, 409);
    operaterId = operater.id;
  }

  let kupacId: number | null = null;
  if (model.kupac) {
    kupacId = await findOrCreateKupac(c.env.DB, tenant.id, {
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
  const iznosi = izracunajIznose(model.stavke);

  const racun = await izdajRacun(c.env.DB, {
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
    tipDokumenta: model.tip === 'PONUDA' ? 'ponuda' : 'racun',
    valuta: model.valuta,
    nacinPlacanja: model.nacinPlacanja.toLowerCase(),
    neto: iznosi.neto,
    iznosBezPdv: iznosi.iznosBezPdv,
    pdv: iznosi.pdv,
    iznosSPdv: iznosi.iznosSPdv,
    dospijevaZaPlacanje: iznosi.dospijevaZaPlacanje,
    status: model.status,
    stavke: model.stavke.map((s) => ({
      naziv: s.naziv,
      kolicina: String(s.kolicina),
      jedinicaMjere: s.jedinicaMjere,
      netoCijena: s.netoCijena,
      pdvKategorija: s.pdvKategorija,
      pdvStopa: s.pdvStopa,
      kpd: s.kpd ?? null,
    })),
    pdvRaspodjela: iznosi.raspodjela,
  });

  return c.json(await racunUOdgovor(c.env.DB, racun), 201);
});

apiV1.get('/racun/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ greska: 'id mora biti pozitivan cijeli broj' }, 400);
  const racun = await getRacun(c.env.DB, c.get('tenant').id, id);
  if (!racun) return c.json({ greska: `Račun ${id} ne postoji` }, 404);
  return c.json(await racunUOdgovor(c.env.DB, racun));
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

// Puni JSON prikaz računa (za 201 i GET po id-u).
async function racunUOdgovor(db: D1Database, r: RacunRow) {
  const [stavke, raspodjela] = await Promise.all([getStavke(db, r.id), getPdvRaspodjela(db, r.id)]);
  return {
    id: r.id,
    brojRacuna: r.broj_racuna_full,
    redniBroj: r.redni_broj,
    godina: r.godina,
    tip: r.tip_dokumenta,
    status: r.status,
    datumVrijeme: r.datum_vrijeme,
    valuta: r.valuta,
    nacinPlacanja: r.nacin_placanja,
    iznosi: {
      neto: r.neto,
      iznosBezPdv: r.iznos_bez_pdv,
      pdv: r.pdv,
      iznosSPdv: r.iznos_s_pdv,
      dospijevaZaPlacanje: r.dospijeva_za_placanje,
    },
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
      pdvKategorija: s.pdv_kategorija,
      pdvStopa: s.pdv_stopa,
      kpd: s.kpd,
    })),
    // JIR/ZKI/QR dolaze s fiskalizacijom (faza 2) — do tada null.
    zki: r.zki,
    jir: r.jir,
  };
}
