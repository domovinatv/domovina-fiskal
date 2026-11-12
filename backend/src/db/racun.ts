// D1 pristupni sloj — Račun: upis (sekvenca), skica, izdavanje skice, čitanje, kupac, kontekst za PDF.
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).

import type {
  PdvRaspodjelaRow,
  RacunRow,
  StavkaRow,
  TenantRow,
} from '../types';
import { getTenant } from './tenant';

// ───────────────────────── Račun (izdavanje + čitanje) ─────────────────────────

export interface NoviRacunStavka {
  naziv: string;
  opis?: string | null;
  kolicina: string;       // decimalni string
  jedinicaMjere: string;
  netoCijena: string;     // decimalni string
  popustPosto: string;    // '0' … '99.99'
  pdvKategorija: string;
  pdvStopa: string;       // '25' | '13' | '5' | '0'
  kpd?: string | null;
  proizvodId?: number | null;
  iznos: string;          // osnovica retka nakon popusta, iz izracunajIznose (K15)
}

export type SekvencaVrsta = 'ponuda' | 'racun' | 'fiskalni';

export interface NoviRacun {
  tenantId: number;
  poslovniProstorId: number;
  naplatniUredajId: number;
  operaterId: number | null;
  kupacId: number | null;
  oznakaSlijednosti: 'P' | 'N';
  oznPP: string;
  oznNU: string;
  godina: number;
  datumVrijeme: string; // ISO 8601
  tipDokumenta: 'ponuda' | 'predracun' | 'racun' | 'fiskalni_b2c' | 'eracun_b2b' | 'eracun_b2g';
  sekvencaVrsta: SekvencaVrsta;
  stornoRacunId?: number | null;
  vanjskaReferenca?: string | null; // idempotencijski ključ (0007)
  zahtjevHash?: string | null;
  valuta: string;
  nacinPlacanja: string | null;
  datumDospijeca: string | null;
  vrijediDo: string | null;
  datumIsporuke: string | null;
  napomena: string | null;
  internaBiljeska: string | null;
  uvjeti: string | null;
  klauzulaPdv: string | null;
  neto: string;
  iznosBezPdv: string;
  pdv: string;
  iznosSPdv: string;
  dospijevaZaPlacanje: string;
  status: 'nacrt' | 'izdano';
  stavke: NoviRacunStavka[];
  pdvRaspodjela: { kategorija: string; stopa: string; oporeziviIznos: string; iznosPoreza: string }[];
}

// Upis dokumenta. status 'izdano' → atomski batch: sekvenca++ (po vrsti!) +
// INSERT racun + stavke + PDV raščlamba u jednoj transakciji, s brojem iz
// subselecta (05-* §3: bez rupa, godišnji reset, razina P/N po internom aktu).
// status 'nacrt' (skica) → INSERT BEZ broja; broj se dodjeljuje u izdajSkicu().
export async function upisiRacun(db: D1Database, r: NoviRacun): Promise<RacunRow> {
  if (r.status === 'nacrt') return upisiSkicu(db, r);

  const razinaTip = r.oznakaSlijednosti === 'P' ? 'PP' : 'NU';
  const razinaId = r.oznakaSlijednosti === 'P' ? r.poslovniProstorId : r.naplatniUredajId;

  // Uvjeti subselecta; ?1 tenant, ?2 vrsta sekvence, ?3 razina_tip, ?4 razina_id,
  // ?5 godina, ?6 PP, ?7 NU — konzistentno u SVIM statementima ovog batcha.
  const sekvencaUvjet = `s.tenant_id = ?1 AND s.vrsta = ?2 AND s.razina_tip = ?3 AND s.razina_id = ?4 AND s.godina = ?5`;
  const racunUvjet = `r.tenant_id = ?1 AND r.sekvenca_vrsta = ?2 AND r.godina = ?5
                      AND r.poslovni_prostor_id = ?6 AND r.naplatni_uredaj_id = ?7
                      AND r.redni_broj = s.zadnji_broj`;
  const kontekst = [r.tenantId, r.sekvencaVrsta, razinaTip, razinaId, r.godina, r.poslovniProstorId, r.naplatniUredajId] as const;

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO sekvenca (tenant_id, vrsta, razina_tip, razina_id, godina, zadnji_broj)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)
         ON CONFLICT (tenant_id, vrsta, razina_tip, razina_id, godina)
         DO UPDATE SET zadnji_broj = zadnji_broj + 1`,
      )
      .bind(...kontekst.slice(0, 5)),
    db
      .prepare(
        `INSERT INTO racun (
           tenant_id, poslovni_prostor_id, naplatni_uredaj_id, operater_id, kupac_id,
           sekvenca_vrsta, redni_broj, godina, broj_racuna_full, oznaka_slijednosti,
           datum_vrijeme, tip_dokumenta, valuta, nacin_placanja,
           datum_dospijeca, vrijedi_do, datum_isporuke, model_placanja, poziv_na_broj,
           napomena, interna_biljeska, uvjeti, klauzula_pdv,
           neto, iznos_bez_pdv, pdv, iznos_s_pdv, dospijeva_za_placanje, storno_racun_id,
           vanjska_referenca, zahtjev_hash, status
         )
         SELECT ?1, ?6, ?7, ?8, ?9,
                ?2, s.zadnji_broj, ?5, s.zadnji_broj || '/' || ?10 || '/' || ?11, ?12,
                ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, 'HR00', s.zadnji_broj || '-' || CAST(?5 AS INTEGER),
                ?20, ?21, ?22, ?23,
                ?24, ?25, ?26, ?27, ?28, ?29,
                ?30, ?31, 'izdano'
         FROM sekvenca s WHERE ${sekvencaUvjet}
         RETURNING id`,
      )
      .bind(
        ...kontekst,
        r.operaterId,          // ?8
        r.kupacId,             // ?9
        r.oznPP,               // ?10
        r.oznNU,               // ?11
        r.oznakaSlijednosti,   // ?12
        r.datumVrijeme,        // ?13
        r.tipDokumenta,        // ?14
        r.valuta,              // ?15
        r.nacinPlacanja,       // ?16
        r.datumDospijeca,      // ?17
        r.vrijediDo,           // ?18
        r.datumIsporuke,       // ?19
        r.napomena,            // ?20
        r.internaBiljeska,     // ?21
        r.uvjeti,              // ?22
        r.klauzulaPdv,         // ?23
        r.neto,                // ?24
        r.iznosBezPdv,         // ?25
        r.pdv,                 // ?26
        r.iznosSPdv,           // ?27
        r.dospijevaZaPlacanje, // ?28
        r.stornoRacunId ?? null, // ?29
        r.vanjskaReferenca ?? null, // ?30
        r.zahtjevHash ?? null, // ?31
      ),
    ...stavkeIPdvStmts(db, r, `FROM racun r JOIN sekvenca s ON ${sekvencaUvjet} WHERE ${racunUvjet}`, [...kontekst]),
  ];

  const rezultati = await db.batch<{ id: number }>(stmts);
  const racunId = rezultati[1]?.results?.[0]?.id;
  if (!racunId) throw new Error('Izdavanje računa nije uspjelo (batch nije vratio id računa)');

  const racun = await getRacun(db, r.tenantId, racunId);
  if (!racun) throw new Error('Izdani račun nije pronađen nakon upisa');
  return racun;
}

// Statementi za stavke + PDV raščlambu; `izvorRacunId` je FROM/WHERE fragment
// koji pronalazi racun.id (subselect kod izdavanja), `prefiksParams` njegovi
// parametri (?1…?N); vrijednosti stavki se nastavljaju iza njih.
function stavkeIPdvStmts(
  db: D1Database,
  r: Pick<NoviRacun, 'stavke' | 'pdvRaspodjela'>,
  izvorRacunId: string,
  prefiksParams: unknown[],
): D1PreparedStatement[] {
  const n = prefiksParams.length;
  const p = (i: number) => `?${n + i}`; // 1-bazirano iza prefiksa
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < r.stavke.length; i++) {
    const st = r.stavke[i];
    stmts.push(
      db
        .prepare(
          `INSERT INTO stavka (racun_id, redni_broj, naziv, opis, kolicina, jedinica_mjere,
                               neto_cijena, popust_posto, pdv_kategorija, pdv_stopa, kpd, proizvod_id, iznos)
           SELECT r.id, ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, ${p(12)}
           ${izvorRacunId}`,
        )
        .bind(
          ...prefiksParams,
          i + 1,
          st.naziv,
          st.opis ?? null,
          st.kolicina,
          st.jedinicaMjere,
          st.netoCijena,
          st.popustPosto,
          st.pdvKategorija,
          st.pdvStopa,
          st.kpd ?? null,
          st.proizvodId ?? null,
          st.iznos,
        ),
    );
  }
  for (const pr of r.pdvRaspodjela) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO pdv_raspodjela (racun_id, kategorija_pdv, stopa, oporezivi_iznos, iznos_poreza)
           SELECT r.id, ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}
           ${izvorRacunId}`,
        )
        .bind(...prefiksParams, pr.kategorija, pr.stopa, pr.oporeziviIznos, pr.iznosPoreza),
    );
  }
  return stmts;
}

// Skica: INSERT bez broja (redni_broj NULL), pa stavke vezane na poznati id.
async function upisiSkicu(db: D1Database, r: NoviRacun): Promise<RacunRow> {
  const red = await db
    .prepare(
      `INSERT INTO racun (
         tenant_id, poslovni_prostor_id, naplatni_uredaj_id, operater_id, kupac_id,
         sekvenca_vrsta, oznaka_slijednosti, datum_vrijeme, tip_dokumenta, valuta,
         nacin_placanja, datum_dospijeca, vrijedi_do, datum_isporuke,
         napomena, interna_biljeska, uvjeti, klauzula_pdv,
         neto, iznos_bez_pdv, pdv, iznos_s_pdv, dospijeva_za_placanje, storno_racun_id,
         vanjska_referenca, zahtjev_hash, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nacrt')
       RETURNING id`,
    )
    .bind(
      r.tenantId, r.poslovniProstorId, r.naplatniUredajId, r.operaterId, r.kupacId,
      r.sekvencaVrsta, r.oznakaSlijednosti, r.datumVrijeme, r.tipDokumenta, r.valuta,
      r.nacinPlacanja, r.datumDospijeca, r.vrijediDo, r.datumIsporuke,
      r.napomena, r.internaBiljeska, r.uvjeti, r.klauzulaPdv,
      r.neto, r.iznosBezPdv, r.pdv, r.iznosSPdv, r.dospijevaZaPlacanje, r.stornoRacunId ?? null,
      r.vanjskaReferenca ?? null, r.zahtjevHash ?? null,
    )
    .first<{ id: number }>();
  if (!red) throw new Error('INSERT skice nije vratio id');
  try {
    await db.batch(stavkeIPdvStmts(db, r, `FROM racun r WHERE r.id = ?1 AND r.tenant_id = ?2`, [red.id, r.tenantId]));
  } catch (e) {
    // Kompenzacija: skica bez stavki je nekonzistentna — obriši pa propagiraj.
    await db.prepare(`DELETE FROM racun WHERE id = ? AND tenant_id = ?`).bind(red.id, r.tenantId).run();
    throw e;
  }
  const racun = await getRacun(db, r.tenantId, red.id);
  if (!racun) throw new Error('Skica nije pronađena nakon upisa');
  return racun;
}

// Izdavanje skice: atomski dodijeli broj iz sekvence (UPDATE … FROM) i
// prebaci status u 'izdano'. Vraća null ako skica ne postoji / nije nacrt.
export async function izdajSkicu(
  db: D1Database,
  args: {
    tenantId: number;
    racunId: number;
    sekvencaVrsta: SekvencaVrsta;
    oznakaSlijednosti: 'P' | 'N';
    poslovniProstorId: number;
    naplatniUredajId: number;
    oznPP: string;
    oznNU: string;
    godina: number;
    datumVrijeme: string;
  },
): Promise<RacunRow | null> {
  const razinaTip = args.oznakaSlijednosti === 'P' ? 'PP' : 'NU';
  const razinaId = args.oznakaSlijednosti === 'P' ? args.poslovniProstorId : args.naplatniUredajId;
  // Inkrement sekvence je UVJETOVAN time da je skica još 'nacrt' — inače bi
  // ponovljeni/konkurentni "izdaj" potrošio broj bez računa (rupa u nizu).
  const skicaJeNacrt = `EXISTS (SELECT 1 FROM racun WHERE id = ?6 AND tenant_id = ?1 AND status = 'nacrt')`;
  const rezultati = await db.batch<{ id: number }>([
    db
      .prepare(
        `INSERT OR IGNORE INTO sekvenca (tenant_id, vrsta, razina_tip, razina_id, godina, zadnji_broj)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)`,
      )
      .bind(args.tenantId, args.sekvencaVrsta, razinaTip, razinaId, args.godina),
    db
      .prepare(
        `UPDATE sekvenca SET zadnji_broj = zadnji_broj + 1
         WHERE tenant_id = ?1 AND vrsta = ?2 AND razina_tip = ?3 AND razina_id = ?4
           AND godina = ?5 AND ${skicaJeNacrt}`,
      )
      .bind(args.tenantId, args.sekvencaVrsta, razinaTip, razinaId, args.godina, args.racunId),
    db
      .prepare(
        `UPDATE racun SET
           redni_broj = s.zadnji_broj,
           godina = ?5,
           broj_racuna_full = s.zadnji_broj || '/' || ?6 || '/' || ?7,
           datum_vrijeme = ?8,
           model_placanja = 'HR00',
           poziv_na_broj = s.zadnji_broj || '-' || CAST(?5 AS INTEGER),
           status = 'izdano',
           updated_at = datetime('now')
         FROM sekvenca s
         WHERE racun.id = ?9 AND racun.tenant_id = ?1 AND racun.status = 'nacrt'
           AND s.tenant_id = ?1 AND s.vrsta = ?2 AND s.razina_tip = ?3
           AND s.razina_id = ?4 AND s.godina = ?5
         RETURNING racun.id`,
      )
      .bind(args.tenantId, args.sekvencaVrsta, razinaTip, razinaId, args.godina,
            args.oznPP, args.oznNU, args.datumVrijeme, args.racunId),
  ]);
  const id = rezultati[2]?.results?.[0]?.id;
  if (!id) return null; // nije nacrt / ne postoji — sekvenca NIJE uvećana (uvjet gore)
  return getRacun(db, args.tenantId, id);
}

export async function getRacun(db: D1Database, tenantId: number, id: number): Promise<RacunRow | null> {
  return db.prepare(`SELECT * FROM racun WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<RacunRow>();
}

// Storno (0009): zbroj iznosa svih izdanih storna originala, u centima (≤ 0).
export async function zbrojStornaCenti(db: D1Database, originalId: number): Promise<number> {
  const red = await db
    .prepare(
      `SELECT COALESCE(SUM(CAST(ROUND(CAST(iznos_s_pdv AS REAL) * 100) AS INTEGER)), 0) AS centi
       FROM racun WHERE storno_racun_id = ? AND status <> 'nacrt'`,
    )
    .bind(originalId)
    .first<{ centi: number }>();
  return red?.centi ?? 0;
}

// Je li upis odbio trigger storna (utrka dva storna istog originala)?
export function stornoGreskaTriggera(e: unknown): string | null {
  const m = String((e as Error)?.message ?? e).match(/STORNO: ([^:]+?)(?::|$)/);
  return m ? m[1].trim() : null;
}

// Idempotencija: dokument tenanta po klijentovoj referenci (0007).
export async function getRacunPoReferenci(db: D1Database, tenantId: number, referenca: string): Promise<RacunRow | null> {
  return db
    .prepare(`SELECT * FROM racun WHERE tenant_id = ? AND vanjska_referenca = ?`)
    .bind(tenantId, referenca)
    .first<RacunRow>();
}

// Je li greška D1 upisa povreda jedinstvenosti vanjske reference (utrka)?
export function jeSukobReference(e: unknown): boolean {
  const poruka = String((e as Error)?.message ?? e);
  return poruka.includes('UNIQUE') && poruka.includes('vanjska_referenca');
}

export async function getStavke(db: D1Database, racunId: number): Promise<StavkaRow[]> {
  const r = await db.prepare(`SELECT * FROM stavka WHERE racun_id = ? ORDER BY redni_broj`).bind(racunId).all<StavkaRow>();
  return r.results;
}

export async function getPdvRaspodjela(db: D1Database, racunId: number): Promise<PdvRaspodjelaRow[]> {
  const r = await db
    .prepare(`SELECT * FROM pdv_raspodjela WHERE racun_id = ? ORDER BY stopa DESC`)
    .bind(racunId)
    .all<PdvRaspodjelaRow>();
  return r.results;
}

export async function listRacuni(
  db: D1Database,
  opts: { tenantId?: number; limit?: number; offset?: number; status?: string; tip?: string },
): Promise<(RacunRow & { tenant_naziv?: string })[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const uvjeti: string[] = [];
  const params: unknown[] = [];
  if (opts.tenantId != null) { uvjeti.push('r.tenant_id = ?'); params.push(opts.tenantId); }
  if (opts.status) { uvjeti.push('r.status = ?'); params.push(opts.status); }
  if (opts.tip) { uvjeti.push('r.tip_dokumenta = ?'); params.push(opts.tip); }
  const where = uvjeti.length ? `WHERE ${uvjeti.join(' AND ')}` : '';
  const r = await db
    .prepare(
      `SELECT r.*, t.naziv AS tenant_naziv
       FROM racun r JOIN tenant t ON t.id = r.tenant_id
       ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<RacunRow & { tenant_naziv: string }>();
  return r.results;
}

// ───────────────────────── Kupac ─────────────────────────

export interface NoviKupac {
  naziv: string;
  oib?: string | null;
  vatNumber?: string | null;
  adrUlica?: string | null;
  adrGrad?: string | null;
  adrPostanskiBroj?: string | null;
  adrDrzava?: string | null;
  email?: string | null;
  tip?: 'fizicka' | 'pravna' | 'drzava' | null;
}

// Kupac s OIB-om se ponovno koristi (adresar po tenantu); bez OIB-a se uvijek
// stvara novi zapis (nema pouzdanog ključa deduplikacije).
export async function findOrCreateKupac(db: D1Database, tenantId: number, k: NoviKupac): Promise<number> {
  if (k.oib) {
    const postojeci = await db
      .prepare(`SELECT id FROM kupac WHERE tenant_id = ? AND oib = ?`)
      .bind(tenantId, k.oib)
      .first<{ id: number }>();
    if (postojeci) return postojeci.id;
  }
  const row = await db
    .prepare(
      `INSERT INTO kupac (tenant_id, naziv, oib, vat_number, adr_ulica, adr_grad,
                          adr_postanski_broj, adr_drzava, email, tip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      tenantId,
      k.naziv,
      k.oib ?? null,
      k.vatNumber ?? null,
      k.adrUlica ?? null,
      k.adrGrad ?? null,
      k.adrPostanskiBroj ?? null,
      k.adrDrzava ?? 'HR',
      k.email ?? null,
      k.tip ?? null,
    )
    .first<{ id: number }>();
  if (!row) throw new Error('INSERT kupac nije vratio redak');
  return row.id;
}

// ───────────────────────── Email evidencija ─────────────────────────

export async function zabiljeziSlanjeEmaila(db: D1Database, tenantId: number, racunId: number, na: string): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET poslano_email_ts = datetime('now'), poslano_email_na = ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(na, racunId, tenantId)
    .run();
}

// ───────────────────────── Kontekst za PDF (svi podaci jednim dohvatom) ─────────────────────────

export interface RacunKontekst {
  racun: RacunRow;
  stavke: StavkaRow[];
  raspodjela: PdvRaspodjelaRow[];
  tenant: TenantRow;
  ppOznaka: string;
  nuOznaka: string;
  operaterIme: string | null;
  operaterOib: string | null;
  // Storno: original na koji se odnosi (PDF/email: „Storno računa br. X od …").
  stornoOriginal: { broj: string | null; datumVrijeme: string } | null;
  kupac: { naziv: string; oib: string | null; vat_number: string | null; adr_ulica: string | null; adr_grad: string | null; adr_postanski_broj: string | null; adr_drzava: string | null; email: string | null } | null;
}

export async function getRacunKontekst(db: D1Database, tenantId: number, racunId: number): Promise<RacunKontekst | null> {
  const racun = await getRacun(db, tenantId, racunId);
  if (!racun) return null;
  const [stavke, raspodjela, tenant, pp, nu, operater, kupac, original] = await Promise.all([
    getStavke(db, racun.id),
    getPdvRaspodjela(db, racun.id),
    getTenant(db, tenantId),
    db.prepare(`SELECT oznaka FROM poslovni_prostor WHERE id = ?`).bind(racun.poslovni_prostor_id).first<{ oznaka: string }>(),
    db.prepare(`SELECT oznaka FROM naplatni_uredaj WHERE id = ?`).bind(racun.naplatni_uredaj_id).first<{ oznaka: string }>(),
    racun.operater_id
      ? db.prepare(`SELECT ime, oib_operatera FROM operater WHERE id = ?`).bind(racun.operater_id).first<{ ime: string | null; oib_operatera: string }>()
      : Promise.resolve(null),
    racun.kupac_id
      ? db.prepare(`SELECT naziv, oib, vat_number, adr_ulica, adr_grad, adr_postanski_broj, adr_drzava, email FROM kupac WHERE id = ?`).bind(racun.kupac_id).first<RacunKontekst['kupac']>()
      : Promise.resolve(null),
    racun.storno_racun_id
      ? db.prepare(`SELECT broj_racuna_full, datum_vrijeme FROM racun WHERE id = ? AND tenant_id = ?`).bind(racun.storno_racun_id, tenantId).first<{ broj_racuna_full: string | null; datum_vrijeme: string }>()
      : Promise.resolve(null),
  ]);
  if (!tenant || !pp || !nu) return null;
  return {
    racun,
    stavke,
    raspodjela,
    tenant,
    ppOznaka: pp.oznaka,
    nuOznaka: nu.oznaka,
    operaterIme: operater?.ime ?? null,
    operaterOib: operater?.oib_operatera ?? null,
    kupac: kupac ?? null,
    stornoOriginal: original ? { broj: original.broj_racuna_full, datumVrijeme: original.datum_vrijeme } : null,
  };
}
