// BYO backup u tenantov Cloudflare R2 (src/backup/tenant.ts): Cloudflare REST
// API je mockan; provjerava se što, kamo i kada se upisuje, i da token ne curi.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { izracunajAlarme } from '../src/alarmi';
import { izvediCron } from '../src/index';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

const ACC = 'a'.repeat(32);
const TOKEN = 'cf-tenant-token-0123456789abcdef';
const db = testEnv.DB;

interface Upis { kljuc: string; jur: string | null; auth: string | null; tip: string | null; tijelo: Uint8Array }
let upisi: Upis[];
let status: number;
let racuni: { id: string; name: string }[];
let bucketi: Map<string, string | null>; // naziv → jurisdikcija

function mockCloudflare() {
  const pravi = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (ulaz, init) => {
    const url = typeof ulaz === 'string' ? ulaz : ulaz instanceof URL ? ulaz.href : ulaz.url;
    const m = url.match(/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/([0-9a-f]+)\/r2\/buckets\/([^/]+)\/objects\/(.+)$/);
    const h = new Headers(init?.headers);
    const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
    if (url.startsWith('https://api.cloudflare.com/client/v4/accounts?')) return ok(racuni);
    const b = url.match(/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[0-9a-f]+\/r2\/buckets(?:\/([^/?]+))?$/);
    if (b) {
      if ((init?.method ?? 'GET') === 'POST') {
        const ime = JSON.parse(String(init?.body)).name as string;
        bucketi.set(ime, h.get('cf-r2-jurisdiction'));
        return ok({ name: ime });
      }
      return bucketi.has(decodeURIComponent(b[1]!))
        ? ok({ name: b[1] })
        : new Response(JSON.stringify({ success: false, errors: [{ code: 10006, message: 'The specified bucket does not exist.' }] }), { status: 404 });
    }
    if (!m) return pravi(ulaz, init);
    if (status !== 200) return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }), { status });
    upisi.push({
      kljuc: m[3]!.split('/').map(decodeURIComponent).join('/'),
      jur: h.get('cf-r2-jurisdiction'),
      auth: h.get('Authorization'),
      tip: h.get('Content-Type'),
      tijelo: new Uint8Array(await new Response(init?.body).arrayBuffer()),
    });
    return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
  });
}

const ukljuci = (t: TestniTenant, dodatno: Record<string, unknown> = {}) =>
  poziv('/api/v1/postavke/backup', {
    method: 'PUT',
    kljuc: t.kljuc,
    body: JSON.stringify({ cfAccountId: ACC, bucket: 'moj-backup', jurisdikcija: 'eu', prefiks: 'fiskal', token: TOKEN, ...dodatno }),
  });

async function izdaj(t: TestniTenant) {
  cisVracaJir();
  const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
  expect(r.status).toBe(201);
  return json(r);
}

describe('BYO backup tenanta', () => {
  beforeEach(() => {
    upisi = [];
    status = 200;
    racuni = [{ id: ACC, name: 'Tenantov račun' }];
    bucketi = new Map([['moj-backup', 'eu']]);
    mockCloudflare();
  });
  afterEach(() => vi.restoreAllMocks());

  it('neispravan unos → 400, ništa se ne sprema', async () => {
    const t = await napraviTenanta();
    const r = await ukljuci(t, { cfAccountId: 'krivo' });
    expect(r.status).toBe(400);
    expect((await json(await poziv('/api/v1/postavke/backup', { kljuc: t.kljuc }))).ukljucen).toBe(false);
  });

  it('token bez prava → 400 s objašnjenjem, ništa se ne sprema', async () => {
    const t = await napraviTenanta();
    status = 403;
    const r = await ukljuci(t);
    expect(r.status).toBe(400);
    expect((await json(r)).greska).toMatch(/HTTP 403.*Workers R2 Storage: Edit/);
    expect(await db.prepare('SELECT count(*) n FROM tenant_backup WHERE tenant_id = ?').bind(t.tenant.id).first('n')).toBe(0);
  });

  it('samo token: Account ID iz tokena, bucket domovina-fiskal-<oib> kreiran u EU', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/postavke/backup', { method: 'PUT', kljuc: t.kljuc, body: JSON.stringify({ token: TOKEN }) });
    const tijelo = await json(r);
    expect(r.status, JSON.stringify(tijelo)).toBe(200);
    const ime = `domovina-fiskal-${t.tenant.oib}`;
    expect(tijelo).toMatchObject({ ukljucen: true, cfAccountId: ACC, bucket: ime, jurisdikcija: 'eu', prefiks: 'domovina-fiskal/', bucketKreiran: true });
    expect(bucketi.get(ime)).toBe('eu');
    expect(upisi[0]).toMatchObject({ kljuc: 'domovina-fiskal/provjera.txt', jur: 'eu' });
    // drugi put: bucket postoji, ne kreira se ponovno
    const r2 = await json(await poziv('/api/v1/postavke/backup', { method: 'PUT', kljuc: t.kljuc, body: JSON.stringify({ token: TOKEN }) }));
    expect(r2.bucketKreiran).toBe(false);
  });

  it('token vidi više računa → 400 s popisom, ništa se ne sprema', async () => {
    const t = await napraviTenanta();
    racuni = [{ id: ACC, name: 'Prvi' }, { id: 'b'.repeat(32), name: 'Drugi' }];
    const r = await poziv('/api/v1/postavke/backup', { method: 'PUT', kljuc: t.kljuc, body: JSON.stringify({ token: TOKEN }) });
    expect(r.status).toBe(400);
    expect((await json(r)).greska).toMatch(/više računa.*Prvi.*Drugi/);
    expect(await db.prepare('SELECT count(*) n FROM tenant_backup WHERE tenant_id = ?').bind(t.tenant.id).first('n')).toBe(0);
  });

  it('spremanje: probni upis, token šifriran i nikad vraćen', async () => {
    const t = await napraviTenanta();
    const r = await ukljuci(t);
    const tijelo = await json(r);
    expect(r.status, JSON.stringify(tijelo)).toBe(200);
    expect(tijelo).toMatchObject({ ukljucen: true, bucket: 'moj-backup', jurisdikcija: 'eu', prefiks: 'fiskal/', tokenPrefiks: TOKEN.slice(0, 6) });
    expect(JSON.stringify(tijelo)).not.toContain(TOKEN);
    expect(upisi[0]).toMatchObject({ kljuc: 'fiskal/provjera.txt', jur: 'eu', auth: `Bearer ${TOKEN}` });
    const red = await db.prepare('SELECT * FROM tenant_backup WHERE tenant_id = ?').bind(t.tenant.id).first();
    expect(JSON.stringify(red)).not.toContain(TOKEN);
  });

  it('izdani račun odmah ide u tenantov bucket kao JSON + PDF; tuđi tenant ne', async () => {
    const t = await napraviTenanta();
    const drugi = await napraviTenanta();
    await ukljuci(t);
    upisi = [];
    const racun = await izdaj(t);
    await izdaj(drugi);
    const kljucevi = upisi.map((u) => u.kljuc);
    const jsonUpis = upisi.find((u) => u.kljuc.endsWith(`_${racun.id}.json`));
    expect(jsonUpis, kljucevi.join(', ')).toBeDefined();
    expect(jsonUpis!.kljuc).toMatch(new RegExp(`^fiskal/racuni/\\d{4}/[A-Za-z0-9._-]+_${racun.id}\\.json$`));
    const zapis = JSON.parse(new TextDecoder().decode(jsonUpis!.tijelo));
    expect(zapis.racun.id).toBe(racun.id);
    expect(zapis.racun.jir).toBeTruthy();
    expect(zapis.stavke.length).toBeGreaterThan(0);
    expect(zapis.porukeCis.some((p: { request_xml: string }) => p.request_xml.includes('RacunZahtjev'))).toBe(true);
    const pdf = upisi.find((u) => u.kljuc.endsWith(`_${racun.id}.pdf`));
    expect(new TextDecoder().decode(pdf!.tijelo.slice(0, 5))).toBe('%PDF-');
    expect(upisi.every((u) => u.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(upisi.length).toBe(2); // drugi tenant nema backup
  });

  it('greška upisa ostaje zapisana, javlja se alarmom, a sljedeća sinkronizacija nadoknađuje', async () => {
    const t = await napraviTenanta();
    await ukljuci(t);
    status = 403;
    const racun = await izdaj(t); // izdavanje radi bez obzira na backup
    const red = await db.prepare('SELECT zadnja_greska, sinkronizirano_do FROM tenant_backup WHERE tenant_id = ?').bind(t.tenant.id).first<{ zadnja_greska: string; sinkronizirano_do: string | null }>();
    expect(red!.zadnja_greska).toMatch(/403/);
    expect(red!.sinkronizirano_do).toBeNull();
    const alarmi = await izracunajAlarme(testEnv, { dnevno: true });
    expect(alarmi.some((a) => a.kljuc === `backup-tenanta:${t.tenant.id}` && a.tenantId === t.tenant.id)).toBe(true);

    status = 200;
    upisi = [];
    await izvediCron('*/15 * * * *', testEnv);
    expect(upisi.some((u) => u.kljuc.endsWith(`_${racun.id}.json`))).toBe(true);
    const poslije = await db.prepare('SELECT zadnja_greska, sinkronizirano_do FROM tenant_backup WHERE tenant_id = ?').bind(t.tenant.id).first<{ zadnja_greska: string | null; sinkronizirano_do: string }>();
    expect(poslije!.zadnja_greska).toBeNull();
    expect(poslije!.sinkronizirano_do).toBeTruthy();
  });

  it('dnevni cron: snapshot svih podataka tenanta (gzip JSON) u njegov bucket', async () => {
    await db.prepare('DELETE FROM tenant_backup').run(); // samo ovaj tenant ima backup
    const t = await napraviTenanta();
    await ukljuci(t);
    const racun = await izdaj(t);
    upisi = [];
    await izvediCron('30 1 * * *', testEnv);
    const snap = upisi.find((u) => /^fiskal\/snapshots\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json\.gz$/.test(u.kljuc));
    expect(snap, upisi.map((u) => u.kljuc).join(', ')).toBeDefined();
    const tekst = await new Response(new Blob([snap!.tijelo]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const d = JSON.parse(tekst);
    expect(d.tenantId).toBe(t.tenant.id);
    expect(d.tablice.racun.map((r: { id: number }) => r.id)).toContain(racun.id);
    expect(tekst).not.toContain('kljuc_pem_encrypted');
    expect((await db.prepare('SELECT zadnji_snapshot FROM tenant_backup WHERE tenant_id = ?').bind(t.tenant.id).first('zadnji_snapshot'))).toBe(snap!.kljuc);
  });

  it('DELETE isključuje backup; sljedeći račun ne ide nikamo', async () => {
    const t = await napraviTenanta();
    await ukljuci(t);
    expect((await poziv('/api/v1/postavke/backup', { method: 'DELETE', kljuc: t.kljuc })).status).toBe(200);
    upisi = [];
    await izdaj(t);
    expect(upisi).toHaveLength(0);
  });
});
