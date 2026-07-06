// D1 pristupni sloj. Svi upiti su scoped na tenant_id gdje ima smisla —
// multi-tenant izolacija se provodi ovdje, ne u pozivateljima.

import type {
  ApiKljucRow,
  CertifikatRow,
  KorisnikTenantRow,
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
    // Faza 2: izvučeni materijal za potpisivanje (parsiran pri uploadu)
    kljucPemEncrypted: ArrayBuffer;
    kljucIv: string;
    certPem: string;
    certIssuer: string;
    certSerialDec: string;
    oibCertifikata: string | null;
    subjectDn: string;
    serialHex: string;
    notBefore: string;
    notAfter: string;
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
                                 dek_wrapped, dek_iv, fingerprint_sha256,
                                 kljuc_pem_encrypted, kljuc_iv, cert_pem, cert_issuer,
                                 cert_serial_dec, oib_certifikata, subject_dn, serial,
                                 not_before, not_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tenantId, c.okolina, c.pkcs12Encrypted, c.encKeyId, c.encIv,
        c.dekWrapped, c.dekIv, c.fingerprintSha256,
        c.kljucPemEncrypted, c.kljucIv, c.certPem, c.certIssuer,
        c.certSerialDec, c.oibCertifikata, c.subjectDn, c.serialHex,
        c.notBefore, c.notAfter,
      ),
  ]);
}

// Aktivni certifikat s materijalom za potpisivanje (enkriptirani ključ + cert).
export interface CertifikatMaterijalRow {
  id: number;
  kljuc_pem_encrypted: ArrayBuffer | null;
  kljuc_iv: string | null;
  dek_wrapped: string;
  dek_iv: string;
  cert_pem: string | null;
  cert_issuer: string | null;
  cert_serial_dec: string | null;
  oib_certifikata: string | null;
  not_after: string | null;
}

export async function getAktivniCertifikat(
  db: D1Database,
  tenantId: number,
  okolina: 'test' | 'prod',
): Promise<CertifikatMaterijalRow | null> {
  return db
    .prepare(
      `SELECT id, kljuc_pem_encrypted, kljuc_iv, dek_wrapped, dek_iv, cert_pem,
              cert_issuer, cert_serial_dec, oib_certifikata, not_after
       FROM certifikat WHERE tenant_id = ? AND okolina = ? AND aktivan = 1`,
    )
    .bind(tenantId, okolina)
    .first<CertifikatMaterijalRow>();
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
  opis?: string | null;
  kolicina: string;       // decimalni string
  jedinicaMjere: string;
  netoCijena: string;     // decimalni string
  popustPosto: string;    // '0' … '99.99'
  pdvKategorija: string;
  pdvStopa: string;       // '25' | '13' | '5' | '0'
  kpd?: string | null;
  proizvodId?: number | null;
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
  tipDokumenta: 'ponuda' | 'predracun' | 'racun' | 'fiskalni_b2c';
  sekvencaVrsta: SekvencaVrsta;
  stornoRacunId?: number | null;
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
           neto, iznos_bez_pdv, pdv, iznos_s_pdv, dospijeva_za_placanje, storno_racun_id, status
         )
         SELECT ?1, ?6, ?7, ?8, ?9,
                ?2, s.zadnji_broj, ?5, s.zadnji_broj || '/' || ?10 || '/' || ?11, ?12,
                ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, 'HR00', s.zadnji_broj || '-' || CAST(?5 AS INTEGER),
                ?20, ?21, ?22, ?23,
                ?24, ?25, ?26, ?27, ?28, ?29, 'izdano'
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
                               neto_cijena, popust_posto, pdv_kategorija, pdv_stopa, kpd, proizvod_id)
           SELECT r.id, ${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}
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
         neto, iznos_bez_pdv, pdv, iznos_s_pdv, dospijeva_za_placanje, storno_racun_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nacrt')
       RETURNING id`,
    )
    .bind(
      r.tenantId, r.poslovniProstorId, r.naplatniUredajId, r.operaterId, r.kupacId,
      r.sekvencaVrsta, r.oznakaSlijednosti, r.datumVrijeme, r.tipDokumenta, r.valuta,
      r.nacinPlacanja, r.datumDospijeca, r.vrijediDo, r.datumIsporuke,
      r.napomena, r.internaBiljeska, r.uvjeti, r.klauzulaPdv,
      r.neto, r.iznosBezPdv, r.pdv, r.iznosSPdv, r.dospijevaZaPlacanje, r.stornoRacunId ?? null,
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

// ───────────────────────── Fiskalizacija (faza 2) ─────────────────────────

// ZKI + QR (zki varijanta) odmah po izdavanju — račun je pravno izdan sa ZKI-jem.
export async function zapisiZki(db: D1Database, tenantId: number, racunId: number, zki: string, qrPayload: string): Promise<void> {
  await db
    .prepare(`UPDATE racun SET zki = ?, qr_payload = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
    .bind(zki, qrPayload, racunId, tenantId)
    .run();
}

// JIR zaprimljen → status 'fiskaliziran', QR prelazi na jir varijantu.
export async function zapisiJir(db: D1Database, tenantId: number, racunId: number, jir: string, qrPayload: string): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET jir = ?, qr_payload = ?, status = 'fiskaliziran', fiskal_greska = NULL,
              fiskal_pokusaja = fiskal_pokusaja + 1, fiskal_zadnji_pokusaj = datetime('now'),
              updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(jir, qrPayload, racunId, tenantId)
    .run();
}

// Neuspjeh: nakDost=1 → automatski retry (sweep) s NakDost=true i NOVIM IdPoruke;
// nakDost=0 → greška u poruci/certifikatu, čeka ručnu intervenciju.
export async function zapisiFiskalGresku(
  db: D1Database,
  tenantId: number,
  racunId: number,
  greska: string,
  nakDost: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET fiskal_greska = ?, fiskal_nak_dost = ?,
              fiskal_pokusaja = fiskal_pokusaja + 1, fiskal_zadnji_pokusaj = datetime('now'),
              updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(greska.slice(0, 2000), nakDost ? 1 : 0, racunId, tenantId)
    .run();
}

// Kandidati za naknadnu dostavu (cron sweep): izdani fiskalni bez JIR-a koji su
// ili označeni za naknadnu dostavu (transport pao) ili nikad nisu ni pokušani.
export async function racuniZaNaknadnuDostavu(db: D1Database, limit = 20): Promise<{ id: number; tenant_id: number }[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id FROM racun
       WHERE tip_dokumenta = 'fiskalni_b2c' AND status = 'izdano' AND jir IS NULL
         AND (fiskal_nak_dost = 1 OR fiskal_pokusaja = 0)
       ORDER BY id LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: number; tenant_id: number }>();
  return r.results;
}

// Audit trag CIS razmjene — potpisani zahtjev i sirovi odgovor (tablica iz 0001).
export async function logPoruka(
  db: D1Database,
  p: {
    tenantId: number;
    racunId: number | null;
    vrstaPoruke: 'racun_b2c' | 'poslovni_prostor';
    smjer: 'zahtjev' | 'odgovor';
    messageId: string;
    okolina: 'test' | 'prod';
    requestXml?: string | null;
    responseXml?: string | null;
    jir?: string | null;
    sifraGreske?: string | null;
    porukaGreske?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO poruka_log (tenant_id, racun_id, vrsta_poruke, smjer, message_id, okolina,
                               request_xml, response_xml, jir, sifra_greske, poruka_greske)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      p.tenantId, p.racunId, p.vrstaPoruke, p.smjer, p.messageId, p.okolina,
      p.requestXml ?? null, p.responseXml ?? null, p.jir ?? null,
      p.sifraGreske ?? null, p.porukaGreske ? p.porukaGreske.slice(0, 2000) : null,
    )
    .run();
}

// Ručno označavanje prijave poslovnog prostora: od 01.07.2017. prijava/odjava
// prostora ide isključivo kroz ePoreznu (SOAP ProstorZahtjev je ukinut iz sheme),
// pa CIS status ovdje evidentira admin nakon prijave u ePoreznoj.
export async function setProstorCisStatus(
  db: D1Database,
  tenantId: number,
  prostorId: number,
  status: 'neposlano' | 'prijavljen',
): Promise<void> {
  await db
    .prepare(
      `UPDATE poslovni_prostor SET cis_status = ?, cis_prijava_ts = CASE WHEN ? = 'prijavljen' THEN datetime('now') ELSE NULL END
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(status, status, prostorId, tenantId)
    .run();
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

// ───────────────────────── Proizvodi (katalog s KPD 2025) ─────────────────────────

export interface ProizvodRow {
  id: number;
  tenant_id: number;
  naziv: string;
  sifra: string | null;
  jedinica_mjere: string;
  neto_cijena: string;
  pdv_stopa: string;
  pdv_kategorija: string;
  kpd: string;
  opis: string | null;
  aktivan: number;
  created_at: string;
}

export async function createProizvod(
  db: D1Database,
  tenantId: number,
  p: {
    naziv: string;
    sifra?: string | null;
    jedinicaMjere: string;
    netoCijena: string;
    pdvStopa: string;
    pdvKategorija: string;
    kpd: string;
    opis?: string | null;
  },
): Promise<ProizvodRow> {
  const row = await db
    .prepare(
      `INSERT INTO proizvod (tenant_id, naziv, sifra, jedinica_mjere, neto_cijena,
                             pdv_stopa, pdv_kategorija, kpd, opis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(tenantId, p.naziv, p.sifra ?? null, p.jedinicaMjere, p.netoCijena,
          p.pdvStopa, p.pdvKategorija, p.kpd, p.opis ?? null)
    .first<ProizvodRow>();
  if (!row) throw new Error('INSERT proizvod nije vratio redak');
  return row;
}

export async function listProizvodi(db: D1Database, tenantId: number): Promise<ProizvodRow[]> {
  const r = await db
    .prepare(`SELECT * FROM proizvod WHERE tenant_id = ? ORDER BY naziv`)
    .bind(tenantId)
    .all<ProizvodRow>();
  return r.results;
}

export async function getProizvod(db: D1Database, tenantId: number, id: number): Promise<ProizvodRow | null> {
  return db.prepare(`SELECT * FROM proizvod WHERE id = ? AND tenant_id = ? AND aktivan = 1`).bind(id, tenantId).first<ProizvodRow>();
}

// ───────────────────────── KPD 2025 šifrarnik ─────────────────────────

export interface KpdRow {
  sifra: string;
  naziv: string;
}

// Pretraga po šifri (s točkama ili bez) ILI nazivu; za KPD picker u adminu.
export async function searchKpd(db: D1Database, upit: string, limit = 20): Promise<KpdRow[]> {
  const q = upit.trim();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const bezTocaka = `%${q.replace(/[^0-9]/g, '')}%`;
  const r = await db
    .prepare(
      `SELECT sifra, naziv FROM kpd_sifrarnik
       WHERE naziv LIKE ?1 COLLATE NOCASE
          OR sifra LIKE ?1
          OR (?2 <> '%%' AND replace(sifra, '.', '') LIKE ?2)
       ORDER BY sifra LIMIT ?3`,
    )
    .bind(like, bezTocaka, Math.min(Math.max(limit, 1), 100))
    .all<KpdRow>();
  return r.results;
}

export async function getKpd(db: D1Database, sifra: string): Promise<KpdRow | null> {
  return db.prepare(`SELECT sifra, naziv FROM kpd_sifrarnik WHERE sifra = ?`).bind(sifra).first<KpdRow>();
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
  kupac: { naziv: string; oib: string | null; adr_ulica: string | null; adr_grad: string | null; adr_postanski_broj: string | null; adr_drzava: string | null; email: string | null } | null;
}

export async function getRacunKontekst(db: D1Database, tenantId: number, racunId: number): Promise<RacunKontekst | null> {
  const racun = await getRacun(db, tenantId, racunId);
  if (!racun) return null;
  const [stavke, raspodjela, tenant, pp, nu, operater, kupac] = await Promise.all([
    getStavke(db, racun.id),
    getPdvRaspodjela(db, racun.id),
    getTenant(db, tenantId),
    db.prepare(`SELECT oznaka FROM poslovni_prostor WHERE id = ?`).bind(racun.poslovni_prostor_id).first<{ oznaka: string }>(),
    db.prepare(`SELECT oznaka FROM naplatni_uredaj WHERE id = ?`).bind(racun.naplatni_uredaj_id).first<{ oznaka: string }>(),
    racun.operater_id
      ? db.prepare(`SELECT ime, oib_operatera FROM operater WHERE id = ?`).bind(racun.operater_id).first<{ ime: string | null; oib_operatera: string }>()
      : Promise.resolve(null),
    racun.kupac_id
      ? db.prepare(`SELECT naziv, oib, adr_ulica, adr_grad, adr_postanski_broj, adr_drzava, email FROM kupac WHERE id = ?`).bind(racun.kupac_id).first<RacunKontekst['kupac']>()
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
  };
}

// ───────────────────────── Dashboard korisnici (korisnik_tenant) ─────────────────────────
// Identitet je u GoTrue-u; ovdje je SAMO autorizacija (membership + uloga).

// Membership za JEDAN tenant: match po user_id (stabilan) ili — dok user_id još
// nije vezan — po verificiranom emailu iz JWT-a (bootstrap na prvoj prijavi).
export async function findKorisnikTenant(
  db: D1Database,
  tenantId: number,
  userId: string,
  email: string,
): Promise<KorisnikTenantRow | null> {
  return db
    .prepare(
      `SELECT * FROM korisnik_tenant
       WHERE tenant_id = ? AND aktivan = 1
         AND (user_id = ? OR (user_id IS NULL AND lower(user_email) = lower(?)))`,
    )
    .bind(tenantId, userId, email)
    .first<KorisnikTenantRow>();
}

// Veže GoTrue sub na redak dodan po emailu (prva prijava) — od tada match ide po user_id.
export async function bindKorisnikTenant(db: D1Database, id: number, userId: string): Promise<void> {
  await db
    .prepare(`UPDATE korisnik_tenant SET user_id = ?, bound_at = datetime('now') WHERE id = ? AND user_id IS NULL`)
    .bind(userId, id)
    .run();
}

// Svi membershipi korisnika (za dropdown tenant-switch) — samo aktivni tenanti.
export async function listMojiTenanti(
  db: D1Database,
  userId: string,
  email: string,
): Promise<{ tenantId: number; oib: string; naziv: string; uloga: string }[]> {
  const r = await db
    .prepare(
      `SELECT t.id AS tenantId, t.oib, t.naziv, kt.uloga
       FROM korisnik_tenant kt JOIN tenant t ON t.id = kt.tenant_id
       WHERE kt.aktivan = 1 AND t.status = 'active'
         AND (kt.user_id = ? OR (kt.user_id IS NULL AND lower(kt.user_email) = lower(?)))
       ORDER BY t.naziv`,
    )
    .bind(userId, email)
    .all<{ tenantId: number; oib: string; naziv: string; uloga: string }>();
  return r.results;
}

export async function listKorisniciTenanta(db: D1Database, tenantId: number): Promise<KorisnikTenantRow[]> {
  const r = await db
    .prepare(`SELECT * FROM korisnik_tenant WHERE tenant_id = ? ORDER BY id`)
    .bind(tenantId)
    .all<KorisnikTenantRow>();
  return r.results;
}

export async function createKorisnikTenant(
  db: D1Database,
  tenantId: number,
  k: { userEmail: string; uloga: 'vlasnik' | 'knjigovodja' | 'operater' },
): Promise<KorisnikTenantRow> {
  const row = await db
    .prepare(`INSERT INTO korisnik_tenant (tenant_id, user_email, uloga) VALUES (?, ?, ?) RETURNING *`)
    .bind(tenantId, k.userEmail, k.uloga)
    .first<KorisnikTenantRow>();
  if (!row) throw new Error('INSERT korisnik_tenant nije vratio redak');
  return row;
}

export async function setKorisnikTenantAktivan(db: D1Database, tenantId: number, id: number, aktivan: boolean): Promise<void> {
  await db
    .prepare(`UPDATE korisnik_tenant SET aktivan = ? WHERE id = ? AND tenant_id = ?`)
    .bind(aktivan ? 1 : 0, id, tenantId)
    .run();
}

// ───────────────────────── Brojači za health/admin ─────────────────────────

export async function brojaci(db: D1Database): Promise<{ tenanti: number; racuni: number }> {
  const [t, r] = await db.batch<{ n: number }>([
    db.prepare(`SELECT COUNT(*) AS n FROM tenant`),
    db.prepare(`SELECT COUNT(*) AS n FROM racun`),
  ]);
  return { tenanti: t.results[0]?.n ?? 0, racuni: r.results[0]?.n ?? 0 };
}
