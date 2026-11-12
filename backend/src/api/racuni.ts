// Rute dokumenata javnog API-ja: izdavanje (s idempotencijom), storno,
// fiskalizacija, skice, dohvat, PDF, e-mail, eRačun (doku) i popis.
// Sve o izdavatelju (OIB, prostor, uređaji, slijednost) je server-side;
// payload je kupac + stavke + tip.

import { Hono } from 'hono';
import { z } from 'zod';
import { getRacun, getRacunKontekst, getRacunPoReferenci, izdajSkicu, listRacuni, zabiljeziSlanjeEmaila } from '../db';
import { izdajDokument, TIP_U_DB } from '../dokumenti/izdavanje';
import { osvjeziEracunStatus, posaljiEracun, provjeriPrimatelja } from '../eracun/eracun';
import { fiskalizirajRacun } from '../fiskal/fiskalizacija';
import { emailKonfiguriran, posaljiRacunEmailom } from '../email';
import { generirajRacunPdf } from '../pdf/racun-pdf';
import { godinaZagreb, izCenti, uCente, uTisucinke, validanOib } from '../util';
import { formatirajGreske, racunModelShema, vanjskaReferencaShema, type RacunModel } from '../validacija';
import { cijeliBroj, HTTP_ZA_VRSTU, idIzParametra, jsonTijelo } from './pomocno';
import { racunUOdgovor, racunUPopis } from './serializacija';
import type { ApiHono, ApiKontekst } from './tipovi';

export const racuniRute = new Hono<ApiHono>();

// Izdavanje dokumenta (svi tipovi iz TIP_U_DB; FISKALNI_B2C se fiskalizira odmah).
racuniRute.post('/racun', async (c) => {
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
  const greskaKljuca = spojiIdempotencijskiKljuc(c, model);
  if (greskaKljuca) return greskaKljuca;

  // Nepoznat tip (izvan mapiranja) — jasna poruka umjesto tihog spremanja.
  if (!(model.tip in TIP_U_DB)) {
    return c.json(
      { greska: `Tip '${model.tip}' nije podržan. Podržani tipovi: ${Object.keys(TIP_U_DB).join(', ')}.` },
      501,
    );
  }
  return izdajIOdgovori(c, model);
});

// Idempotency-Key zaglavlje = isto što i polje vanjskaReferenca (Faza 4.1).
// Vraća grešku (400) ili null; spaja ključ u model.
function spojiIdempotencijskiKljuc(c: ApiKontekst, model: RacunModel): Response | null {
  const kljucZaglavlje = c.req.header('Idempotency-Key');
  if (kljucZaglavlje === undefined) return null;
  const k = vanjskaReferencaShema.safeParse(kljucZaglavlje);
  if (!k.success) {
    return c.json({ greska: 'Validacija nije prošla', detalji: formatirajGreske(k.error).map((g) => ({ ...g, polje: 'Idempotency-Key' })) }, 400);
  }
  if (model.vanjskaReferenca && model.vanjskaReferenca !== k.data) {
    return c.json({ greska: "Zaglavlje 'Idempotency-Key' i polje 'vanjskaReferenca' se razlikuju — pošalji jedno ili oba ista" }, 400);
  }
  model.vanjskaReferenca = k.data;
  return null;
}

// Izdavanje + (za FISKALNI_B2C) sinkroni pokušaj fiskalizacije + JSON odgovor.
// Zajedničko za POST /racun i POST /racun/:id/storno; logika je u izdajDokument.
async function izdajIOdgovori(c: ApiKontekst, model: RacunModel): Promise<Response> {
  const rezultat = await izdajDokument(c.env, c.get('tenant'), model);
  if ('greska' in rezultat) {
    return c.json(
      {
        greska: rezultat.greska,
        ...(rezultat.detalji ? { detalji: rezultat.detalji } : {}),
        ...(rezultat.racunId ? { racunId: rezultat.racunId } : {}),
      },
      HTTP_ZA_VRSTU[rezultat.vrsta],
    );
  }
  // Ponovljeni zahtjev: postojeći dokument, bez ponovne fiskalizacije (JIR
  // dovršava sweep naknadne dostave).
  if (rezultat.ponovljen) {
    c.header('Idempotent-Replay', 'true');
    return c.json(await racunUOdgovor(c.env.DB, rezultat.racun), 200);
  }
  const fiskal = rezultat.fiskalizacija;
  if (fiskal) {
    return c.json(
      {
        ...(await racunUOdgovor(c.env.DB, rezultat.racun)),
        fiskalizacija: fiskal.ok
          ? { status: 'fiskaliziran' }
          : { status: 'ceka_jir', greska: fiskal.greska ?? null, automatskiRetry: fiskal.retryable ?? false },
      },
      201,
    );
  }
  return c.json(await racunUOdgovor(c.env.DB, rezultat.racun), 201);
}

// Storno fiskalnog računa (Faza 4.3) — webshop ga zove na Stripe charge.refunded.
// Bez `stavke` stornira se cijeli račun; sa `stavke` [{redak, kolicina}]
// djelomično. Stavke se kopiraju s NEGATIVNOM cijenom (količina mora biti
// pozitivna — util.uTisucinke), isti prostor/uređaj/način plaćanja; operater
// originala ako nije poslan. Idempotentno preko vanjskaReferenca/Idempotency-Key.
const stornoTijeloShema = z.object({
  vanjskaReferenca: vanjskaReferencaShema.optional(),
  operaterOib: z.string().trim().optional(),
  napomena: z.string().max(2000, 'napomena smije imati najviše 2000 znakova').optional(),
  stavke: z
    .array(
      z.object({
        redak: z.number({ invalid_type_error: 'stavke[].redak mora biti broj' }).int().positive(),
        kolicina: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .min(1, 'stavke ne smije biti prazan niz — izostavi ga za storno cijelog računa')
    .optional(),
});

racuniRute.post('/racun/:id/storno', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  const tijelo = await jsonTijelo(c);
  const p = stornoTijeloShema.safeParse(tijelo);
  if (!p.success) return c.json({ greska: 'Validacija nije prošla', detalji: formatirajGreske(p.error) }, 400);

  const tenant = c.get('tenant');
  const k = await getRacunKontekst(c.env.DB, tenant.id, id);
  if (!k) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  if (k.racun.tip_dokumenta !== 'fiskalni_b2c') {
    return c.json({ greska: `Dokument ${k.racun.broj_racuna_full ?? id} nije fiskalni B2C račun — storno je moguć samo za fiskalni račun` }, 400);
  }

  const izvorne = new Map(k.stavke.map((s) => [s.redni_broj, s]));
  const odabrane: { stavka: (typeof k.stavke)[number]; kolicina: string }[] = [];
  if (p.data.stavke) {
    const vidjeni = new Set<number>();
    for (const [i, s] of p.data.stavke.entries()) {
      const izvorna = izvorne.get(s.redak);
      if (!izvorna) return c.json({ greska: 'Validacija nije prošla', detalji: [{ polje: `stavke.${i}.redak`, poruka: `račun nema stavku u retku ${s.redak}` }] }, 400);
      if (vidjeni.has(s.redak)) return c.json({ greska: 'Validacija nije prošla', detalji: [{ polje: `stavke.${i}.redak`, poruka: `redak ${s.redak} je naveden dvaput` }] }, 400);
      vidjeni.add(s.redak);
      const kolicina = s.kolicina === undefined ? izvorna.kolicina : String(s.kolicina).trim();
      try {
        if (uTisucinke(kolicina, `stavke.${i}.kolicina`) > uTisucinke(izvorna.kolicina, 'kolicina')) {
          return c.json({ greska: 'Validacija nije prošla', detalji: [{ polje: `stavke.${i}.kolicina`, poruka: `količina ${kolicina} veća je od količine na računu (${izvorna.kolicina})` }] }, 400);
        }
      } catch (e) {
        return c.json({ greska: 'Validacija nije prošla', detalji: [{ polje: `stavke.${i}.kolicina`, poruka: (e as Error).message }] }, 400);
      }
      odabrane.push({ stavka: izvorna, kolicina });
    }
  } else {
    for (const s of k.stavke) odabrane.push({ stavka: s, kolicina: s.kolicina });
  }

  const kandidat = {
    tip: 'FISKALNI_B2C',
    poslovniProstor: k.ppOznaka,
    naplatniUredaj: k.nuOznaka,
    operaterOib: p.data.operaterOib || k.operaterOib || undefined,
    nacinPlacanja: (k.racun.nacin_placanja ?? 'kartica').toUpperCase(),
    valuta: k.racun.valuta,
    ...(p.data.napomena ? { napomena: p.data.napomena } : {}),
    ...(k.kupac
      ? {
          kupac: {
            naziv: k.kupac.naziv,
            ...(k.kupac.oib ? { oib: k.kupac.oib } : {}),
            ...(k.kupac.email ? { email: k.kupac.email } : {}),
          },
        }
      : {}),
    stavke: odabrane.map(({ stavka, kolicina }) => ({
      naziv: stavka.naziv,
      ...(stavka.opis ? { opis: stavka.opis } : {}),
      kolicina,
      jedinicaMjere: stavka.jedinica_mjere,
      netoCijena: izCenti(-uCente(stavka.neto_cijena, 'netoCijena')),
      popustPosto: stavka.popust_posto,
      pdvStopa: stavka.pdv_stopa,
      pdvKategorija: stavka.pdv_kategorija,
      ...(stavka.kpd ? { kpd: stavka.kpd } : {}),
    })),
    stornoZaId: k.racun.id,
    ...(p.data.vanjskaReferenca ? { vanjskaReferenca: p.data.vanjskaReferenca } : {}),
  };
  const parsed = racunModelShema.safeParse(kandidat);
  if (!parsed.success) return c.json({ greska: 'Validacija nije prošla', detalji: formatirajGreske(parsed.error) }, 400);
  const greskaKljuca = spojiIdempotencijskiKljuc(c, parsed.data);
  if (greskaKljuca) return greskaKljuca;
  return izdajIOdgovori(c, parsed.data);
});

// Ručno okidanje (naknadne) fiskalizacije — npr. nakon ispravka certifikata.
racuniRute.post('/racun/:id/fiskaliziraj', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
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
        : { status: 'ceka_jir', greska: fiskal.greska ?? null, automatskiRetry: fiskal.retryable ?? false, uTijeku: !!fiskal.uTijeku },
    },
    fiskal.ok ? 200 : fiskal.uTijeku ? 409 : 502,
  );
});

// Izdavanje skice: dodijeli broj + status 'izdano'.
racuniRute.post('/racun/:id/izdaj', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
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

racuniRute.get('/racun/:id', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  const racun = await getRacun(c.env.DB, c.get('tenant').id, id);
  if (!racun) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  return c.json(await racunUOdgovor(c.env.DB, racun));
});

// PDF vizualizacija dokumenta.
racuniRute.get('/racun/:id/pdf', async (c) => {
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
racuniRute.post('/racun/:id/posalji', async (c) => {
  if (!emailKonfiguriran(c.env)) {
    return c.json({ greska: 'Slanje e-maila nije konfigurirano (ni send_email binding ni RESEND_API_KEY)' }, 503);
  }
  const id = Number(c.req.param('id'));
  const tenant = c.get('tenant');
  const k = await getRacunKontekst(c.env.DB, tenant.id, id);
  if (!k) return c.json({ greska: `Dokument ${id} ne postoji` }, 404);
  if (k.racun.status === 'nacrt') return c.json({ greska: 'Skica se ne šalje — prvo izdaj dokument (POST /racun/:id/izdaj)' }, 409);

  const body = await jsonTijelo(c);
  const na = String(body.na ?? '').trim() || k.kupac?.email || '';
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

// Slanje eRačuna (B2B/B2G) preko posrednika doku. Tenant mora imati doku token
// (admin) i kupca s OIB-om. doku gradi/potpisuje/šalje UBL svojim certom.
racuniRute.post('/racun/:id/posalji-eracun', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  const ishod = await posaljiEracun(c.env, c.get('tenant').id, id);
  if (!ishod.ok) return c.json({ ok: false, greska: ishod.greska }, 502);
  return c.json({
    ok: true,
    dokuId: ishod.dokuId,
    eracunStatus: ishod.status,
    deliveryBlock: ishod.deliveryBlock,
    napomena: ishod.deliveryBlock === 'AMS' ? 'Primatelj nije registriran za eDelivery (AMS) — doku ga nije mogao dostaviti.' : undefined,
  });
});

// Osvježi status razmjene/naplate iz doku-a (poll).
racuniRute.get('/racun/:id/eracun-status', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  const ishod = await osvjeziEracunStatus(c.env, c.get('tenant').id, id);
  if (!ishod.ok) return c.json({ ok: false, greska: ishod.greska }, 502);
  return c.json({ ok: true, dokuId: ishod.dokuId, eracunStatus: ishod.status });
});

// Provjera je li primatelj registriran za eDelivery (AMS lookup preko doku-a).
racuniRute.post('/eracun/provjeri-primatelja', async (c) => {
  const body = await jsonTijelo(c);
  const oib = String(body.oib ?? '').trim();
  if (!validanOib(oib)) return c.json({ greska: 'Pošalji { "oib": "…" } s valjanim OIB-om (11 znamenki)' }, 400);
  const r = await provjeriPrimatelja(c.env, c.get('tenant').id, oib);
  if (!r.ok) return c.json({ ok: false, greska: r.greska }, 502);
  return c.json({ ok: true, oib, registriran: r.registriran, mpsEndpoint: r.mpsEndpoint });
});

const popisUpitShema = z.object({ limit: cijeliBroj('limit', 1, 200, 50), offset: cijeliBroj('offset', 0, 1_000_000, 0) });

racuniRute.get('/racun', async (c) => {
  // Klijent nakon timeouta provjerava je li račun nastao: točno jedan ili 404.
  const referenca = c.req.query('vanjskaReferenca');
  if (referenca !== undefined) {
    const racun = await getRacunPoReferenci(c.env.DB, c.get('tenant').id, referenca.trim());
    if (!racun) return c.json({ greska: `Dokument s vanjskom referencom '${referenca}' ne postoji` }, 404);
    return c.json(await racunUOdgovor(c.env.DB, racun));
  }
  const q = popisUpitShema.safeParse({ limit: c.req.query('limit'), offset: c.req.query('offset') });
  if (!q.success) return c.json({ greska: 'Validacija nije prošla', detalji: formatirajGreske(q.error) }, 400);
  const { limit, offset } = q.data;
  const racuni = await listRacuni(c.env.DB, {
    tenantId: c.get('tenant').id,
    limit,
    offset,
    status: c.req.query('status') || undefined,
    tip: c.req.query('tip') || undefined,
  });
  return c.json({
    racuni: racuni.map(racunUPopis),
    limit,
    offset,
  });
});
