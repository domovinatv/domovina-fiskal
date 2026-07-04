// D1 pristupni sloj. Svi upiti su scoped na tenant_id gdje ima smisla —
// multi-tenant izolacija se provodi ovdje, ne u pozivateljima.

import type {
  ApiKljucRow,
  CertifikatRow,
  NaplatniUredajRow,
  OperaterRow,
  PdvRaspodjelaRow,
  PoslovniProstorRow,
  RacunRow,
  StavkaRow,
  TenantRow,
} from './types';
import { genApiKljuc, sha256Hex } from './util';

// ───────────────────────── Tenant ─────────────────────────

export interface NoviTenant {
  oib: string;
  naziv: string;
  adrUlica?: string | null;
  adrKucniBroj?: string | null;
  adrMjesto?: string | null;
  adrPostanskiBroj?: string | null;
  uSustavuPdv: boolean;
  iban?: string | null;
  oznakaSlijednosti: 'P' | 'N';
}

export async function createTenant(db: D1Database, t: NoviTenant): Promise<TenantRow> {
  const row = await db
    .prepare(
      `INSERT INTO tenant (oib, naziv, adr_ulica, adr_kucni_broj, adr_mjesto, adr_postanski_broj,
                           u_sustavu_pdv, iban, oznaka_slijednosti_def)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      t.oib,
      t.naziv,
      t.adrUlica ?? null,
      t.adrKucniBroj ?? null,
      t.adrMjesto ?? null,
      t.adrPostanskiBroj ?? null,
      t.uSustavuPdv ? 1 : 0,
      t.iban ?? null,
      t.oznakaSlijednosti,
    )
    .first<TenantRow>();
  if (!row) throw new Error('INSERT tenant nije vratio redak');
  return row;
}

export async function listTenants(db: D1Database): Promise<TenantRow[]> {
  const r = await db.prepare(`SELECT * FROM tenant ORDER BY id DESC`).all<TenantRow>();
  return r.results;
}

export async function getTenant(db: D1Database, id: number): Promise<TenantRow | null> {
  return db.prepare(`SELECT * FROM tenant WHERE id = ?`).bind(id).first<TenantRow>();
}

// ───────────────────────── API ključevi ─────────────────────────

// Kreira ključ i vraća SIROVI ključ — jedini trenutak u kojem postoji izvan hasha.
export async function createApiKljuc(
  db: D1Database,
  tenantId: number,
  opis: string | null,
): Promise<{ rawKey: string; row: ApiKljucRow }> {
  const rawKey = genApiKljuc();
  const hash = await sha256Hex(rawKey);
  const prefiks = rawKey.slice(0, 12); // 'dfk_' + 8 hex — dovoljno za identifikaciju
  const row = await db
    .prepare(
      `INSERT INTO api_kljuc (tenant_id, prefiks, hash, opis) VALUES (?, ?, ?, ?)
       RETURNING id, tenant_id, prefiks, opis, aktivan, zadnje_koristen_at, created_at`,
    )
    .bind(tenantId, prefiks, hash, opis)
    .first<ApiKljucRow>();
  if (!row) throw new Error('INSERT api_kljuc nije vratio redak');
  return { rawKey, row };
}

export async function listApiKljucevi(db: D1Database, tenantId: number): Promise<ApiKljucRow[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id, prefiks, opis, aktivan, zadnje_koristen_at, created_at
       FROM api_kljuc WHERE tenant_id = ? ORDER BY id DESC`,
    )
    .bind(tenantId)
    .all<ApiKljucRow>();
  return r.results;
}

export async function setApiKljucAktivan(db: D1Database, tenantId: number, id: number, aktivan: boolean): Promise<void> {
  await db
    .prepare(`UPDATE api_kljuc SET aktivan = ? WHERE id = ? AND tenant_id = ?`)
    .bind(aktivan ? 1 : 0, id, tenantId)
    .run();
}

export async function deleteApiKljuc(db: D1Database, tenantId: number, id: number): Promise<void> {
  await db.prepare(`DELETE FROM api_kljuc WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).run();
}

// Bearer auth: hash sirovog ključa → aktivan ključ + aktivan tenant.
export async function findTenantByApiKeyHash(
  db: D1Database,
  hash: string,
): Promise<{ tenant: TenantRow; apiKljucId: number } | null> {
  const row = await db
    .prepare(
      `SELECT t.*, k.id AS api_kljuc_id
       FROM api_kljuc k JOIN tenant t ON t.id = k.tenant_id
       WHERE k.hash = ? AND k.aktivan = 1 AND t.status = 'active'`,
    )
    .bind(hash)
    .first<TenantRow & { api_kljuc_id: number }>();
  if (!row) return null;
  const { api_kljuc_id, ...tenant } = row;
  return { tenant: tenant as TenantRow, apiKljucId: api_kljuc_id };
}

export async function touchApiKljuc(db: D1Database, id: number): Promise<void> {
  await db.prepare(`UPDATE api_kljuc SET zadnje_koristen_at = datetime('now') WHERE id = ?`).bind(id).run();
}

// ───────────────────────── Poslovni prostor / uređaj / operater ─────────────────────────

export async function createPoslovniProstor(
  db: D1Database,
  tenantId: number,
  p: { oznaka: string; adrUlica?: string | null; adrNaselje?: string | null; datumPocetkaPrimjene: string },
): Promise<PoslovniProstorRow> {
  const row = await db
    .prepare(
      `INSERT INTO poslovni_prostor (tenant_id, oznaka, adr_ulica, adr_naselje, datum_pocetka_primjene)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(tenantId, p.oznaka, p.adrUlica ?? null, p.adrNaselje ?? null, p.datumPocetkaPrimjene)
    .first<PoslovniProstorRow>();
  if (!row) throw new Error('INSERT poslovni_prostor nije vratio redak');
  return row;
}

export async function listPoslovniProstori(db: D1Database, tenantId: number): Promise<PoslovniProstorRow[]> {
  const r = await db
    .prepare(`SELECT * FROM poslovni_prostor WHERE tenant_id = ? ORDER BY oznaka`)
    .bind(tenantId)
    .all<PoslovniProstorRow>();
  return r.results;
}

export async function getPoslovniProstorByOznaka(
  db: D1Database,
  tenantId: number,
  oznaka: string,
): Promise<PoslovniProstorRow | null> {
  return db
    .prepare(`SELECT * FROM poslovni_prostor WHERE tenant_id = ? AND oznaka = ?`)
    .bind(tenantId, oznaka)
    .first<PoslovniProstorRow>();
}

export async function createNaplatniUredaj(
  db: D1Database,
  poslovniProstorId: number,
  u: { oznaka: string; opis?: string | null },
): Promise<NaplatniUredajRow> {
  const row = await db
    .prepare(`INSERT INTO naplatni_uredaj (poslovni_prostor_id, oznaka, opis) VALUES (?, ?, ?) RETURNING *`)
    .bind(poslovniProstorId, u.oznaka, u.opis ?? null)
    .first<NaplatniUredajRow>();
  if (!row) throw new Error('INSERT naplatni_uredaj nije vratio redak');
  return row;
}

export async function listNaplatniUredjaji(db: D1Database, tenantId: number): Promise<(NaplatniUredajRow & { pp_oznaka: string })[]> {
  const r = await db
    .prepare(
      `SELECT u.*, p.oznaka AS pp_oznaka
       FROM naplatni_uredaj u JOIN poslovni_prostor p ON p.id = u.poslovni_prostor_id
       WHERE p.tenant_id = ? ORDER BY p.oznaka, u.oznaka`,
    )
    .bind(tenantId)
    .all<NaplatniUredajRow & { pp_oznaka: string }>();
  return r.results;
}

export async function getNaplatniUredajByOznaka(
  db: D1Database,
  poslovniProstorId: number,
  oznaka: string,
): Promise<NaplatniUredajRow | null> {
  return db
    .prepare(`SELECT * FROM naplatni_uredaj WHERE poslovni_prostor_id = ? AND oznaka = ?`)
    .bind(poslovniProstorId, oznaka)
    .first<NaplatniUredajRow>();
}

export async function createOperater(
  db: D1Database,
  tenantId: number,
  o: { oibOperatera: string; ime?: string | null },
): Promise<OperaterRow> {
  const row = await db
    .prepare(`INSERT INTO operater (tenant_id, oib_operatera, ime) VALUES (?, ?, ?) RETURNING *`)
    .bind(tenantId, o.oibOperatera, o.ime ?? null)
    .first<OperaterRow>();
  if (!row) throw new Error('INSERT operater nije vratio redak');
  return row;
}

export async function listOperateri(db: D1Database, tenantId: number): Promise<OperaterRow[]> {
  const r = await db
    .prepare(`SELECT * FROM operater WHERE tenant_id = ? ORDER BY id`)
    .bind(tenantId)
    .all<OperaterRow>();
  return r.results;
}

export async function getOperaterByOib(db: D1Database, tenantId: number, oib: string): Promise<OperaterRow | null> {
  return db
    .prepare(`SELECT * FROM operater WHERE tenant_id = ? AND oib_operatera = ?`)
    .bind(tenantId, oib)
    .first<OperaterRow>();
}

// ───────────────────────── Certifikat ─────────────────────────

export async function createCertifikat(
  db: D1Database,
  tenantId: number,
  c: {
    okolina: 'test' | 'prod';
    pkcs12Encrypted: ArrayBuffer;
    encKeyId: string;
    encIv: string;
    dekWrapped: string;
    dekIv: string;
    fingerprintSha256: string;
  },
): Promise<void> {
  // Novi cert postaje aktivan; prethodni aktivni za istu okolinu se deaktivira
  // (parcijalni unique indeks dopušta samo jedan aktivan po tenant+okolina).
  await db.batch([
    db
      .prepare(`UPDATE certifikat SET aktivan = 0 WHERE tenant_id = ? AND okolina = ? AND aktivan = 1`)
      .bind(tenantId, c.okolina),
    db
      .prepare(
        `INSERT INTO certifikat (tenant_id, okolina, pkcs12_encrypted, enc_key_id, enc_iv,
                                 dek_wrapped, dek_iv, fingerprint_sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(tenantId, c.okolina, c.pkcs12Encrypted, c.encKeyId, c.encIv, c.dekWrapped, c.dekIv, c.fingerprintSha256),
  ]);
}

export async function listCertifikati(db: D1Database, tenantId: number): Promise<CertifikatRow[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id, okolina, enc_alg, enc_key_id, fingerprint_sha256, not_after, aktivan, created_at
       FROM certifikat WHERE tenant_id = ? ORDER BY id DESC`,
    )
    .bind(tenantId)
    .all<CertifikatRow>();
  return r.results;
}

// ───────────────────────── Račun (izdavanje + čitanje) ─────────────────────────

export interface NoviRacunStavka {
  naziv: string;
  kolicina: string;       // decimalni string
  jedinicaMjere: string;
  netoCijena: string;     // decimalni string
  pdvKategorija: string;
  pdvStopa: string;       // '25' | '13' | '5' | '0'
  kpd?: string | null;
}

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
  tipDokumenta: 'ponuda' | 'racun';
  valuta: string;
  nacinPlacanja: string | null;
  neto: string;
  iznosBezPdv: string;
  pdv: string;
  iznosSPdv: string;
  dospijevaZaPlacanje: string;
  status: 'nacrt' | 'izdano';
  stavke: NoviRacunStavka[];
  pdvRaspodjela: { kategorija: string; stopa: string; oporeziviIznos: string; iznosPoreza: string }[];
}

// Atomsko izdavanje: sekvenca++ + INSERT racun + stavke + PDV raščlamba u JEDNOM
// D1 batchu (transakcija) — pravilo numeriranja iz 05-* §3 (bez rupa, godišnji
// reset, razina P/N po internom aktu tenanta). Broj se dodjeljuje subselectom iz
// sekvence jer se rezultati statementa unutar batcha ne mogu vezati u sljedeći.
export async function izdajRacun(db: D1Database, r: NoviRacun): Promise<RacunRow> {
  const razinaTip = r.oznakaSlijednosti === 'P' ? 'PP' : 'NU';
  const razinaId = r.oznakaSlijednosti === 'P' ? r.poslovniProstorId : r.naplatniUredajId;

  const sekvencaUvjet = `s.tenant_id = ?1 AND s.razina_tip = ?2 AND s.razina_id = ?3 AND s.godina = ?4`;
  const racunUvjet = `r.tenant_id = ?1 AND r.godina = ?4 AND r.poslovni_prostor_id = ?5
                      AND r.naplatni_uredaj_id = ?6 AND r.redni_broj = s.zadnji_broj`;

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO sekvenca (tenant_id, razina_tip, razina_id, godina, zadnji_broj)
         VALUES (?1, ?2, ?3, ?4, 1)
         ON CONFLICT (tenant_id, razina_tip, razina_id, godina)
         DO UPDATE SET zadnji_broj = zadnji_broj + 1`,
      )
      .bind(r.tenantId, razinaTip, razinaId, r.godina),
    db
      .prepare(
        `INSERT INTO racun (
           tenant_id, poslovni_prostor_id, naplatni_uredaj_id, operater_id, kupac_id,
           redni_broj, godina, broj_racuna_full, oznaka_slijednosti, datum_vrijeme,
           tip_dokumenta, valuta, nacin_placanja,
           neto, iznos_bez_pdv, pdv, iznos_s_pdv, dospijeva_za_placanje, status
         )
         SELECT ?1, ?5, ?6, ?7, ?8,
                s.zadnji_broj, ?4, s.zadnji_broj || '/' || ?9 || '/' || ?10, ?2, ?11,
                ?12, ?13, ?14,
                ?15, ?16, ?17, ?18, ?19, ?20
         FROM sekvenca s
         WHERE s.tenant_id = ?1 AND s.razina_tip = ?21 AND s.razina_id = ?3 AND s.godina = ?4
         RETURNING id`,
      )
      .bind(
        r.tenantId,
        r.oznakaSlijednosti,
        razinaId,
        r.godina,
        r.poslovniProstorId,
        r.naplatniUredajId,
        r.operaterId,
        r.kupacId,
        r.oznPP,
        r.oznNU,
        r.datumVrijeme,
        r.tipDokumenta,
        r.valuta,
        r.nacinPlacanja,
        r.neto,
        r.iznosBezPdv,
        r.pdv,
        r.iznosSPdv,
        r.dospijevaZaPlacanje,
        r.status,
        razinaTip, // ?21 — 'PP'/'NU' za subselect sekvence (?2 je 'P'/'N' za oznaku slijednosti)
      ),
  ];

  // ?2 u subselectima = razina_tip ('PP'/'NU'), za razliku od ?2 gore ('P'/'N').
  for (let i = 0; i < r.stavke.length; i++) {
    const st = r.stavke[i];
    stmts.push(
      db
        .prepare(
          `INSERT INTO stavka (racun_id, redni_broj, naziv, kolicina, jedinica_mjere,
                               neto_cijena, pdv_kategorija, pdv_stopa, kpd)
           SELECT r.id, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
           FROM racun r JOIN sekvenca s ON ${sekvencaUvjet}
           WHERE ${racunUvjet}`,
        )
        .bind(
          r.tenantId,
          razinaTip,
          razinaId,
          r.godina,
          r.poslovniProstorId,
          r.naplatniUredajId,
          i + 1,
          st.naziv,
          st.kolicina,
          st.jedinicaMjere,
          st.netoCijena,
          st.pdvKategorija,
          st.pdvStopa,
          st.kpd ?? null,
        ),
    );
  }

  for (const p of r.pdvRaspodjela) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO pdv_raspodjela (racun_id, kategorija_pdv, stopa, oporezivi_iznos, iznos_poreza)
           SELECT r.id, ?7, ?8, ?9, ?10
           FROM racun r JOIN sekvenca s ON ${sekvencaUvjet}
           WHERE ${racunUvjet}`,
        )
        .bind(r.tenantId, razinaTip, razinaId, r.godina, r.poslovniProstorId, r.naplatniUredajId,
              p.kategorija, p.stopa, p.oporeziviIznos, p.iznosPoreza),
    );
  }

  const rezultati = await db.batch<{ id: number }>(stmts);
  const racunId = rezultati[1]?.results?.[0]?.id;
  if (!racunId) throw new Error('Izdavanje računa nije uspjelo (batch nije vratio id računa)');

  const racun = await getRacun(db, r.tenantId, racunId);
  if (!racun) throw new Error('Izdani račun nije pronađen nakon upisa');
  return racun;
}

export async function getRacun(db: D1Database, tenantId: number, id: number): Promise<RacunRow | null> {
  return db.prepare(`SELECT * FROM racun WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<RacunRow>();
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

// ───────────────────────── Brojači za health/admin ─────────────────────────

export async function brojaci(db: D1Database): Promise<{ tenanti: number; racuni: number }> {
  const [t, r] = await db.batch<{ n: number }>([
    db.prepare(`SELECT COUNT(*) AS n FROM tenant`),
    db.prepare(`SELECT COUNT(*) AS n FROM racun`),
  ]);
  return { tenanti: t.results[0]?.n ?? 0, racuni: r.results[0]?.n ?? 0 };
}
