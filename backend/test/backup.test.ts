// Backup (docs/knowledge/23-backup.md): platformski SQL dump u R2 mora se dati
// vratiti u praznu bazu i dati iste podatke; tenantov JSON snapshot sadrži samo
// njegove retke i nikakve tajne platforme.
import { describe, expect, it } from 'vitest';
import { izveziBazuSql, izveziTenantJson } from '../src/backup/dump';
import { napraviPlatformskiBackup } from '../src/backup';
import { izvediCron } from '../src/index';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

const db = testEnv.DB;

async function izdajRacun() {
  cisVracaJir();
  const t = await napraviTenanta();
  const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
  const racun = await json(r);
  expect(r.status, JSON.stringify(racun)).toBe(201);
  return { t, racun };
}

async function sadrzaj(tablice: string[]) {
  const rez = await db.batch(tablice.map((t) => db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`)));
  return Object.fromEntries(tablice.map((t, i) => [t, rez[i]!.results]));
}

describe('backup', () => {
  it('tenantov snapshot: samo njegovi retci, bez certifikata, ključeva i tokena', async () => {
    const a = await izdajRacun();
    const b = await izdajRacun();
    const d = await izveziTenantJson(db, a.t.tenant.id);
    expect(d.tablice.tenant).toHaveLength(1);
    expect(d.tablice.racun!.map((r) => r.id)).toEqual([a.racun.id]);
    expect(d.tablice.stavka!.length).toBeGreaterThan(0);
    expect(d.tablice.poruka_log!.some((p) => String(p.request_xml).includes('<tns:RacunZahtjev'))).toBe(true);
    expect(JSON.stringify(d)).not.toContain(b.t.tenant.oib);
    for (const zabranjeno of ['certifikat', 'api_kljuc', 'doku_konfig', 'korisnik_tenant', 'alarm']) {
      expect(d.tablice[zabranjeno]).toBeUndefined();
    }
  });

  it('platformski backup ide u R2 (gzip) i zapisuje backup_zadnji', async () => {
    await izdajRacun();
    const b = await napraviPlatformskiBackup(testEnv, new Date('2026-11-23T01:30:00Z'));
    expect(b.kljuc).toBe('d1/test/2026/11/2026-11-23T01-30-00Z.sql.gz');
    const obj = await testEnv.BACKUP!.get(b.kljuc);
    expect(obj?.customMetadata?.sha256_sql).toBe(b.sha256);
    const sql = await new Response(obj!.body.pipeThrough(new DecompressionStream('gzip'))).text();
    expect(sql).toMatch(/CREATE TABLE "?racun"? ?\(/);
    expect(sql).toMatch(/INSERT INTO "racun"/);
    const stanje = await db.prepare(`SELECT vrijednost FROM sustav_stanje WHERE kljuc = 'backup_zadnji'`).first<{ vrijednost: string }>();
    expect(JSON.parse(stanje!.vrijednost).kljuc).toBe(b.kljuc);
  });

  it('cron 30 1 * * * pokreće backup', async () => {
    await izvediCron('30 1 * * *', testEnv);
    const popis = await testEnv.BACKUP!.list({ prefix: 'd1/test/' });
    expect(popis.objects.some((o) => o.key !== 'd1/test/2026/11/2026-11-23T01-30-00Z.sql.gz')).toBe(true);
  });

  // Zadnji u datoteci: briše cijelu bazu i vraća je iz dumpa.
  it('dump se vraća u praznu bazu s identičnim podacima (i storno parom)', async () => {
    const { t, racun } = await izdajRacun();
    cisVracaJir();
    const s = await poziv(`/api/v1/racun/${racun.id}/storno`, { method: 'POST', kljuc: t.kljuc, body: '{}' });
    expect(s.status).toBe(201);
    const prije = await izveziBazuSql(db);
    const tablice = Object.keys(prije.redaka);
    const ocekivano = await sadrzaj(tablice);

    const objekti = await db
      .prepare(`SELECT type, name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)
      .all<{ type: string; name: string }>();
    // Brisanje u krugovima dok ne nestane sve: redoslijed u sqlite_master nije redoslijed ovisnosti
    // (migracije prepisuju tablice), a DROP roditelja čije dijete ima FK na već obrisanu tablicu pada
    // s „no such table” (0014: korisnik ← pozivnice → tenant). Neuspjeli DROP se ponovi idući krug.
    let ostalo = objekti.results;
    for (let krug = 0; ostalo.length && krug < 10; krug++) {
      const neuspjeli: typeof ostalo = [];
      for (const o of ostalo) {
        await db.prepare(`DROP ${o.type.toUpperCase()} "${o.name}"`).run().catch(() => neuspjeli.push(o));
      }
      ostalo = neuspjeli;
    }
    expect(ostalo).toEqual([]);
    expect((await db.prepare(`SELECT count(*) n FROM sqlite_master WHERE name = 'racun'`).first<{ n: number }>())!.n).toBe(0);

    await db.batch(prije.naredbe.map((n) => db.prepare(n)));
    expect(await sadrzaj(tablice)).toEqual(ocekivano);
    const poslije = await izveziBazuSql(db);
    expect(poslije.redaka).toEqual(prije.redaka);
  });
});
