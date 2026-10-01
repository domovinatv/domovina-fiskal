import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRacun } from '../src/db';
import { fiskalizirajRacun, sweepNaknadnaDostava } from '../src/fiskal/fiskalizacija';
import { obradiAlarme, provjeriCisEcho } from '../src/alarmi';
import type { Env } from '../src/types';
import { b2cTijelo, json, napraviTenanta, poziv, slijed, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisNedostupan, cisVracaJir, echoOdgovor, jirOdgovor, postaviMock } from './pomocno/cis-mock';

const db = testEnv.DB;

// Izdaj fiskalni račun dok je CIS nedostupan → ostaje bez JIR-a (nak_dost=1).
async function izdajBezJira(t: TestniTenant, dodatno: Record<string, unknown> = {}): Promise<number> {
  cisNedostupan();
  const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, dodatno)) });
  expect(r.status).toBe(201);
  return (await json(r)).id;
}

// Backoff ne smije sakriti račun od testa sweepa: „zadnji pokušaj" u prošlost.
async function pomakniPokusaje(ids: number[], minuta = 120) {
  for (const id of ids) {
    await db.prepare(`UPDATE racun SET fiskal_zadnji_pokusaj = datetime('now', ?) WHERE id = ?`).bind(`-${minuta} minutes`, id).run();
  }
}

// Pokvari ključ certifikata (dekripcija baca) — simulira grešku potpisa.
async function pokvariKljuc(tenantId: number) {
  await db.prepare(`UPDATE certifikat SET kljuc_pem_encrypted = X'00112233' WHERE tenant_id = ?`).bind(tenantId).run();
}

function lazniEmail() {
  const send = vi.fn(async (_p: { to: string; subject: string; text: string }) => ({ messageId: 'x' }));
  const env = { ...testEnv, EMAIL: { send }, RESEND_API_KEY: undefined } as unknown as Env;
  return { env, send };
}

describe('Preduvjeti prije trošenja broja', () => {
  it('istekao certifikat → 409 prije trošenja broja', async () => {
    const t = await napraviTenanta({ certIstekao: true });
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
    expect(r.status).toBe(409);
    expect((await json(r)).greska).toMatch(/Certifikat je istekao/);
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 0, sekvenca: null });
  });

  it('OIB certifikata ≠ OIB tenanta → 409 prije trošenja broja', async () => {
    const t = await napraviTenanta();
    await db.prepare(`UPDATE certifikat SET oib_certifikata = '12345678903' WHERE tenant_id = ?`).bind(t.tenant.id).run();
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) });
    expect(r.status).toBe(409);
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 0 });
  });
});

describe('Svaka greška ostavlja trag', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('greška potpisa: pokusaja>0, retryable; ne blokira sweep za druge tenante', async () => {
    const los = await napraviTenanta();
    const dobar = await napraviTenanta();
    await pokvariKljuc(los.tenant.id);
    // 25 „otrovnih" računa jednog tenanta (stari sweep: ORDER BY id LIMIT 20 → zauvijek blokiran).
    const losi: number[] = [];
    for (let i = 0; i < 25; i++) losi.push(await izdajBezJira(los));
    const dobriId = await izdajBezJira(dobar);
    const prvi = (await getRacun(db, los.tenant.id, losi[0]))!;
    expect(prvi.fiskal_pokusaja).toBe(1);
    expect(prvi.fiskal_nak_dost).toBe(1);
    expect(prvi.fiskal_greska).toMatch(/Neočekivana greška fiskalizacije/);
    expect(prvi.zki).toBeNull();

    await pomakniPokusaje([...losi, dobriId]);
    const poslano = cisVracaJir();
    const ishod = await sweepNaknadnaDostava(testEnv);
    expect((await getRacun(db, dobar.tenant.id, dobriId))!.jir).toBeTruthy();
    // Fer raspodjela: loš tenant dobiva najviše 10 mjesta u prolazu.
    const pokusaniLosi = (await Promise.all(losi.map((id) => getRacun(db, los.tenant.id, id)))).filter((r) => r!.fiskal_pokusaja === 2);
    expect(pokusaniLosi.length).toBeLessThanOrEqual(10);
    expect(ishod.uspjelo).toBeGreaterThanOrEqual(1);
    expect(poslano.some((x) => x.includes('<tns:NakDost>true</tns:NakDost>'))).toBe(true);
  });

  it('greška mapiranja nije retryable i diže alarm „bez retryja"', async () => {
    const t = await napraviTenanta();
    const id = await izdajBezJira(t);
    await db.prepare(`UPDATE racun SET nacin_placanja = 'kripto' WHERE id = ?`).bind(id).run();
    cisVracaJir();
    const ishod = await fiskalizirajRacun(testEnv, t.tenant.id, id);
    expect(ishod).toMatchObject({ ok: false, retryable: false });
    const r = (await getRacun(db, t.tenant.id, id))!;
    expect(r).toMatchObject({ fiskal_nak_dost: 0, fiskal_pokusaja: 2 });
    const { env, send } = lazniEmail();
    const poslani = await obradiAlarme(env);
    expect(poslani).toContain(`bez-retryja:${id}`);
    expect(send.mock.calls.some(([p]) => p.to === 'alarmi@primjer.hr' && p.subject.includes('neće biti ponovljena'))).toBe(true);
  });
});

describe('Lease (claim)', () => {
  it('dva istodobna fiskalizirajRacun → samo jedan CIS poziv', async () => {
    const t = await napraviTenanta();
    const id = await izdajBezJira(t);
    let otpusti!: () => void;
    const brana = new Promise<void>((r) => (otpusti = r));
    const mock = postaviMock(async (_o, operacija, envelopa) => {
      if (operacija === 'echo') return echoOdgovor(envelopa);
      await brana;
      return { status: 200, tijelo: jirOdgovor() };
    });
    const a = fiskalizirajRacun(testEnv, t.tenant.id, id);
    await new Promise((r) => setTimeout(r, 50)); // a je uzeo lease i čeka CIS
    const b = await fiskalizirajRacun(testEnv, t.tenant.id, id);
    expect(b).toMatchObject({ ok: false, uTijeku: true });
    otpusti();
    expect((await a).ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
    expect((await getRacun(db, t.tenant.id, id))!.fiskal_zakljucano_do).toBeNull(); // lease otpušten
    // Treći poziv nakon JIR-a ne šalje ništa.
    expect((await fiskalizirajRacun(testEnv, t.tenant.id, id)).ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('ručni retry dok drugi šalje → 409 uTijeku', async () => {
    const t = await napraviTenanta();
    const id = await izdajBezJira(t);
    await db.prepare(`UPDATE racun SET fiskal_zakljucano_do = datetime('now', '+60 seconds') WHERE id = ?`).bind(id).run();
    cisVracaJir();
    const r = await poziv(`/api/v1/racun/${id}/fiskaliziraj`, { method: 'POST', kljuc: t.kljuc });
    expect(r.status).toBe(409);
    expect((await json(r)).fiskalizacija.uTijeku).toBe(true);
  });
});

describe('Sweep', () => {
  it('backoff: račun neuspio upravo sada ne ide u sljedeći sweep', async () => {
    const t = await napraviTenanta();
    const id = await izdajBezJira(t);
    const poslano = cisVracaJir();
    await sweepNaknadnaDostava(testEnv);
    expect(poslano.filter((x) => x.includes(`<tns:Oib>${t.tenant.oib}</tns:Oib>`))).toHaveLength(0);
    await pomakniPokusaje([id], 3); // 1 pokušaj → backoff 2 min
    await sweepNaknadnaDostava(testEnv);
    expect((await getRacun(db, t.tenant.id, id))!.jir).toBeTruthy();
  });

  it('račun stariji od 7 dana izlazi iz automatike i diže alarm', async () => {
    const t = await napraviTenanta();
    const id = await izdajBezJira(t);
    await db.prepare(`UPDATE racun SET datum_vrijeme = ? WHERE id = ?`).bind(new Date(Date.now() - 8 * 86_400_000).toISOString(), id).run();
    cisVracaJir();
    const ishod = await sweepNaknadnaDostava(testEnv);
    expect(ishod.zaustavljeno.map((z) => z.id)).toContain(id);
    const r = (await getRacun(db, t.tenant.id, id))!;
    expect(r.fiskal_nak_dost).toBe(0);
    expect(r.fiskal_greska).toMatch(/zaustavljena nakon 7 dana/);
    const { env } = lazniEmail();
    const poslani = await obradiAlarme(env);
    expect(poslani).toContain(`bez-jira-24h:${t.tenant.id}`);
    expect(poslani).toContain(`bez-retryja:${id}`);
  });
});

describe('Alarmi', () => {
  it('bez JIR-a > 24 h: mail platformi i tenantu, deduplicirano', async () => {
    const t = await napraviTenanta();
    await db.prepare(`UPDATE tenant SET email = 'vlasnik@primjer.hr' WHERE id = ?`).bind(t.tenant.id).run();
    const id = await izdajBezJira(t);
    await db.prepare(`UPDATE racun SET datum_vrijeme = ? WHERE id = ?`).bind(new Date(Date.now() - 25 * 3_600_000).toISOString(), id).run();
    const { env, send } = lazniEmail();
    expect(await obradiAlarme(env)).toContain(`bez-jira-24h:${t.tenant.id}`);
    const primatelji = send.mock.calls.filter(([p]) => p.subject.includes('bez JIR-a')).map(([p]) => p.to);
    expect(primatelji).toEqual(expect.arrayContaining(['alarmi@primjer.hr', 'vlasnik@primjer.hr']));
    const { racunaMnozina } = await import('../src/alarmi');
    expect([1, 2, 5, 11, 12, 21, 22, 25].map((n) => `${n} ${racunaMnozina(n)}`)).toEqual(['1 fiskalni račun', '2 fiskalna računa', '5 fiskalnih računa', '11 fiskalnih računa', '12 fiskalnih računa', '21 fiskalni račun', '22 fiskalna računa', '25 fiskalnih računa']);
    // Drugi prolaz odmah nakon prvog ne šalje isti alarm ponovno.
    expect(await obradiAlarme(env)).not.toContain(`bez-jira-24h:${t.tenant.id}`);
  });

  it('certifikat ističe za ≤ 30 dana i ponovno ≤ 7 dana (dnevni cron)', async () => {
    const t = await napraviTenanta();
    await db.prepare(`UPDATE certifikat SET not_after = ? WHERE tenant_id = ?`).bind(new Date(Date.now() + 20 * 86_400_000).toISOString(), t.tenant.id).run();
    const { env } = lazniEmail();
    const prvi = await obradiAlarme(env, { dnevno: true });
    expect(prvi.some((k) => k.startsWith(`cert-30:${t.tenant.id}:test:`))).toBe(true);
    await db.prepare(`UPDATE certifikat SET not_after = ? WHERE tenant_id = ?`).bind(new Date(Date.now() + 5 * 86_400_000).toISOString(), t.tenant.id).run();
    const drugi = await obradiAlarme(env, { dnevno: true });
    expect(drugi.some((k) => k.startsWith(`cert-7:${t.tenant.id}:test:`))).toBe(true);
  });

  it('CIS echo ne prolazi > 1 h → alarm', async () => {
    cisNedostupan();
    await db.prepare(`DELETE FROM sustav_stanje WHERE kljuc LIKE 'cis_echo%'`).run();
    await db.prepare(`INSERT INTO sustav_stanje (kljuc, vrijednost) VALUES ('cis_echo_zadnji_ok', ?)`).bind(new Date(Date.now() - 2 * 3_600_000).toISOString()).run();
    expect(await provjeriCisEcho(testEnv)).toBe(false);
    const { env } = lazniEmail();
    expect(await obradiAlarme(env)).toContain('cis-echo:test');
    cisVracaJir();
    expect(await provjeriCisEcho(testEnv)).toBe(true);
  });
});

describe('GET /api/v1/zdravlje', () => {
  it('bez autentikacije, bez podataka o tenantima', async () => {
    cisVracaJir();
    await provjeriCisEcho(testEnv);
    await sweepNaknadnaDostava(testEnv);
    const r = await poziv('/api/v1/zdravlje');
    expect([200, 503]).toContain(r.status);
    const z = await json(r);
    expect(z.cisEcho.ok).toBe(true);
    expect(z.sweepZadnji.kada).toBeTruthy();
    expect(typeof z.racunaBezJira24h).toBe('number');
    expect(JSON.stringify(z)).not.toMatch(/tenant|oib/i);
  });
});

describe('Cron i admin', () => {
  it('*/15 cron: echo + sweep + alarmi; admin naslovnica prikazuje alarme', async () => {
    const { izvediCron } = await import('../src/index');
    cisVracaJir();
    await izvediCron('*/15 * * * *', testEnv);
    expect((await poziv('/api/v1/zdravlje').then(json)).cisEcho.ok).toBe(true);
    const auth = `Basic ${btoa(`${testEnv.ADMIN_USER}:${testEnv.ADMIN_PASS}`)}`;
    const html = await (await poziv('/admin', { headers: { Authorization: auth } })).text();
    expect(html).toContain('Alarmi (zadnjih 7 dana)');
  });
});

describe('CIS poslužiteljski certifikat (4.6)', () => {
  it('echo bilježi notAfter iz handshakea; alarm ≤ 30 dana koristi opaženo, inače konstantu', async () => {
    const { cisPosluziteljCertIstice, CIS_POSLUZITELJ_CERT } = await import('../src/fiskal/cis');
    const za20dana = new Date(Date.now() + 20 * 86_400_000).toISOString();
    postaviMock(async (_o, _op, envelopa) => ({ ...echoOdgovor(envelopa), posluziteljCertNotAfter: za20dana }));
    expect(await provjeriCisEcho(testEnv)).toBe(true);
    const red = await db.prepare(`SELECT vrijednost FROM sustav_stanje WHERE kljuc = 'cis_posluzitelj_cert_not_after'`).first<{ vrijednost: string }>();
    expect(red!.vrijednost).toBe(za20dana);
    const { env } = lazniEmail();
    expect(await obradiAlarme(env, { dnevno: true })).toContain(`cis-posluzitelj-cert:test:${za20dana}`);
    // Konstanta: PROD Fina RDC 2020 cert ističe 18.12.2026. — alarm od 18.11.2026.
    expect(CIS_POSLUZITELJ_CERT.prod.notAfter).toBe('2026-12-18T06:13:03Z');
    expect(cisPosluziteljCertIstice('prod', 30, null, Date.parse('2026-11-17T00:00:00Z'))).toBeNull();
    expect(cisPosluziteljCertIstice('prod', 30, null, Date.parse('2026-11-19T00:00:00Z'))).toEqual({ notAfter: '2026-12-18T06:13:03Z' });
  });
});
