// Korisnički endpointi (dashboard: moji-tenanti, ja) i self-service postavke
// (prostori / uređaji / operateri).

import { Hono } from 'hono';
import {
  createNaplatniUredaj,
  createOperater,
  createPoslovniProstor,
  getPoslovniProstorByOznaka,
  listMojiTenanti,
  listNaplatniUredjaji,
  listOperateri,
  listPoslovniProstori,
  jeUniqueGreska,
} from '../db';
import { normalizirajTekst, validanOib } from '../util';
import { jsonTijelo } from './pomocno';
import type { ApiHono, ApiKontekst } from './tipovi';

export const postavkeRute = new Hono<ApiHono>();

// ── Korisnički endpointi (dashboard) ──

// Membershipi prijavljenog korisnika — puni dropdown za tenant-switch.
postavkeRute.get('/moji-tenanti', async (c) => {
  const korisnik = c.get('korisnik');
  if (!korisnik) {
    return c.json({ greska: 'Endpoint je dostupan samo uz korisničku prijavu (GoTrue JWT), ne uz API ključ' }, 400);
  }
  return c.json({ tenanti: await listMojiTenanti(c.env.DB, korisnik.sub, korisnik.emailPotvrdjen ? korisnik.email : null) });
});

// Profil + membershipi (opcionalni pogodniji oblik za frontend bootstrap).
postavkeRute.get('/ja', async (c) => {
  const korisnik = c.get('korisnik');
  if (!korisnik) {
    return c.json({ greska: 'Endpoint je dostupan samo uz korisničku prijavu (GoTrue JWT), ne uz API ključ' }, 400);
  }
  return c.json({
    email: korisnik.email,
    tenanti: await listMojiTenanti(c.env.DB, korisnik.sub, korisnik.emailPotvrdjen ? korisnik.email : null),
  });
});

// ── Postavke (prostori / uređaji / operateri) — self-service za dashboard ──
// Uloge (v1, minimalno): vlasnik/knjigovodja = puni pristup; operater smije
// izdavati/fiskalizirati, ali NE mijenjati postavke. Mašinski dfk_ ključ
// (bez korisnika) je tenant-scoped puni pristup — bez dodatnih ograničenja.

function operaterBezPostavki(c: ApiKontekst): boolean {
  return c.get('korisnik')?.uloga === 'operater';
}

postavkeRute.get('/postavke', async (c) => {
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

postavkeRute.post('/postavke/prostor', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = await jsonTijelo(c);
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
    if (jeUniqueGreska(e)) return c.json({ greska: `Prostor '${oznaka}' već postoji` }, 409);
    throw e;
  }
});

postavkeRute.post('/postavke/uredjaj', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = await jsonTijelo(c);
  const prostorOznaka = String(body.prostorOznaka ?? '').trim();
  const oznaka = normalizirajTekst(String(body.oznaka ?? ''));
  if (!prostorOznaka || !oznaka) return c.json({ greska: "Obavezno: 'prostorOznaka' i 'oznaka'" }, 400);
  const pp = await getPoslovniProstorByOznaka(c.env.DB, c.get('tenant').id, prostorOznaka);
  if (!pp) return c.json({ greska: `Poslovni prostor '${prostorOznaka}' ne postoji` }, 404);
  try {
    const u = await createNaplatniUredaj(c.env.DB, pp.id, { oznaka, opis: String(body.opis ?? '').trim() || null });
    return c.json({ id: u.id, oznaka: u.oznaka }, 201);
  } catch (e) {
    if (jeUniqueGreska(e)) return c.json({ greska: `Uređaj '${oznaka}' već postoji u tom prostoru` }, 409);
    throw e;
  }
});

postavkeRute.post('/postavke/operater', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = await jsonTijelo(c);
  const oib = String(body.oib ?? '').trim();
  if (!validanOib(oib)) return c.json({ greska: `OIB operatera '${oib}' nije valjan` }, 400);
  try {
    const o = await createOperater(c.env.DB, c.get('tenant').id, {
      oibOperatera: oib,
      ime: normalizirajTekst(String(body.ime ?? '')) || null,
    });
    return c.json({ id: o.id, oib: o.oib_operatera }, 201);
  } catch (e) {
    if (jeUniqueGreska(e)) return c.json({ greska: `Operater ${oib} već postoji` }, 409);
    throw e;
  }
});
