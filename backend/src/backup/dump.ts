// Izvoz D1 baze u SQL (platformski backup) i u JSON po tenantu (tenantov backup).
//
// Svi SELECT-i idu u JEDAN db.batch(): D1 batch se izvodi kao jedna transakcija,
// pa je snimka konzistentna (nema računa bez stavki zbog upisa između dva upita).
// Cijela snimka je u memoriji — dovoljno dok je baza ispod ~50 MB; iznad toga
// treba prijeći na D1 export API (REST) ili izvoz po tablicama u dijelovima.

// Tablice koje se ne izvoze: interne D1/SQLite i kratkotrajno stanje prijave.
const PRESKOCI_PODATKE = new Set(['admin_sessions', 'admin_challenges']);

function jeInterna(ime: string): boolean {
  return ime.startsWith('sqlite_') || ime.startsWith('_cf_');
}

// D1 vraća BLOB kao niz brojeva (ili ArrayBuffer, ovisno o verziji runtimea).
function kaoBajtove(v: unknown): Uint8Array | null {
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (Array.isArray(v) && v.every((b) => typeof b === 'number')) return Uint8Array.from(v);
  return null;
}

function sqlVrijednost(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? '1' : '0';
  const bajtovi = kaoBajtove(v);
  if (bajtovi) return `X'${Array.from(bajtovi, (b) => b.toString(16).padStart(2, '0')).join('')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function citiraj(ime: string): string {
  return `"${ime.replace(/"/g, '""')}"`;
}

export interface SqlDump {
  sql: string;
  naredbe: string[]; // iste naredbe kao u `sql`, jedna po elementu (za test vraćanja)
  redaka: Record<string, number>;
  zadnjaMigracija: string | null;
}

// Puni SQL dump: shema (tablice, pa indeksi/okidači/pogledi) + podaci.
// Vraća se u praznu bazu s `wrangler d1 execute <baza> --remote --file dump.sql`.
export async function izveziBazuSql(db: D1Database): Promise<SqlDump> {
  const shema = await db
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE sql IS NOT NULL
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END, rowid`,
    )
    .all<{ type: string; name: string; tbl_name: string; sql: string }>();
  const objekti = shema.results.filter((o) => !jeInterna(o.name) && !jeInterna(o.tbl_name));
  const tablice = objekti.filter((o) => o.type === 'table').map((o) => o.name);
  const sPodacima = tablice.filter((t) => !PRESKOCI_PODATKE.has(t));

  const rezultati = sPodacima.length
    ? await db.batch(sPodacima.map((t) => db.prepare(`SELECT * FROM ${citiraj(t)} ORDER BY rowid`)))
    : [];

  // Redoslijed: tablice → podaci → indeksi/okidači/pogledi. Okidači PRIJE
  // podataka bi se okinuli na vraćanju (npr. „STORNO: original je već
  // storniran” na postojećem storno paru) — isto radi i `wrangler d1 export`.
  const naredbe: string[] = ['PRAGMA defer_foreign_keys = ON'];
  for (const o of objekti) if (o.type === 'table') naredbe.push(o.sql);

  const redaka: Record<string, number> = {};
  sPodacima.forEach((t, i) => {
    const redovi = (rezultati[i]?.results ?? []) as Record<string, unknown>[];
    redaka[t] = redovi.length;
    for (const r of redovi) {
      const stupci = Object.keys(r);
      naredbe.push(
        `INSERT INTO ${citiraj(t)} (${stupci.map(citiraj).join(',')}) VALUES (${stupci.map((s) => sqlVrijednost(r[s])).join(',')})`,
      );
    }
  });

  for (const o of objekti) if (o.type !== 'table') naredbe.push(o.sql);

  let zadnjaMigracija: string | null = null;
  const mi = sPodacima.indexOf('d1_migrations');
  if (mi >= 0) {
    const m = (rezultati[mi]?.results ?? []) as { name?: string }[];
    zadnjaMigracija = m.at(-1)?.name ?? null;
  }
  const zaglavlje = [
    `-- domovina-fiskal: SQL dump D1 baze, ${new Date().toISOString()}`,
    '-- Vraćanje u PRAZNU bazu: wrangler d1 execute <baza> --remote --file <ova datoteka>',
  ];
  const sql = `${zaglavlje.join('\n')}\n${naredbe.map((n) => `${n};`).join('\n')}\n`;
  return { sql, naredbe, redaka, zadnjaMigracija };
}

// ───────────────────────── Izvoz po tenantu (JSON) ─────────────────────────

// Što tenant dobiva o sebi. Namjerno BEZ tajni i internog stanja platforme:
// nema certifikata (ključ je šifriran našim KEK-om, bezvrijedan izvan nas),
// API ključeva (hashevi), doku tokena, korisnika dashboarda ni alarma.
const TENANT_UPITI: Record<string, string> = {
  tenant: `SELECT * FROM tenant WHERE id = ?1`,
  poslovni_prostor: `SELECT * FROM poslovni_prostor WHERE tenant_id = ?1 ORDER BY id`,
  naplatni_uredaj: `SELECT u.* FROM naplatni_uredaj u JOIN poslovni_prostor p ON p.id = u.poslovni_prostor_id WHERE p.tenant_id = ?1 ORDER BY u.id`,
  operater: `SELECT * FROM operater WHERE tenant_id = ?1 ORDER BY id`,
  kupac: `SELECT * FROM kupac WHERE tenant_id = ?1 ORDER BY id`,
  proizvod: `SELECT * FROM proizvod WHERE tenant_id = ?1 ORDER BY id`,
  sekvenca: `SELECT * FROM sekvenca WHERE tenant_id = ?1 ORDER BY id`,
  racun: `SELECT * FROM racun WHERE tenant_id = ?1 ORDER BY id`,
  stavka: `SELECT s.* FROM stavka s JOIN racun r ON r.id = s.racun_id WHERE r.tenant_id = ?1 ORDER BY s.racun_id, s.redni_broj`,
  pdv_raspodjela: `SELECT x.* FROM pdv_raspodjela x JOIN racun r ON r.id = x.racun_id WHERE r.tenant_id = ?1 ORDER BY x.id`,
  naplata: `SELECT x.* FROM naplata x JOIN racun r ON r.id = x.racun_id WHERE r.tenant_id = ?1 ORDER BY x.id`,
  poruka_log: `SELECT * FROM poruka_log WHERE tenant_id = ?1 ORDER BY id`,
};

export interface TenantDump {
  format: 'domovina-fiskal/tenant-snapshot';
  verzija: 1;
  generirano: string;
  tenantId: number;
  tablice: Record<string, Record<string, unknown>[]>;
}

function jsonRedovi(redovi: Record<string, unknown>[]): Record<string, unknown>[] {
  // BLOB-ova u ovim tablicama nema, ali za svaki slučaj → base64.
  return redovi.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const b = kaoBajtove(v);
      o[k] = b ? { base64: btoa(String.fromCharCode(...b)) } : v;
    }
    return o;
  });
}

export async function izveziTenantJson(db: D1Database, tenantId: number): Promise<TenantDump> {
  const imena = Object.keys(TENANT_UPITI);
  const rez = await db.batch(imena.map((t) => db.prepare(TENANT_UPITI[t]!).bind(tenantId)));
  const tablice: TenantDump['tablice'] = {};
  imena.forEach((t, i) => {
    tablice[t] = jsonRedovi((rez[i]?.results ?? []) as Record<string, unknown>[]);
  });
  return { format: 'domovina-fiskal/tenant-snapshot', verzija: 1, generirano: new Date().toISOString(), tenantId, tablice };
}

// ───────────────────────── Pomoćno ─────────────────────────

export async function gzip(tekst: string): Promise<ArrayBuffer> {
  const tok = new Blob([tekst]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(tok).arrayBuffer();
}

export async function sha256Hex(tekst: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}
