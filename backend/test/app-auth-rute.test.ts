// Rute prijave dashboarda (docs/passkey/, S2): pozivnica → passkey → kolačić → postojeći
// /api/v1 endpointi s X-Tenant-Id; Origin (CSRF); moji passkeyi; članovi (samo vlasnik).
// WebAuthn je lažan (test/pomocno/webauthn-mock.ts): lažni odgovor nosi `izazov`, a mock
// zove `expectedChallenge`, pa se izazovi ipak troše i vežu stvarno.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { izdaj, provjeri } from '../src/app-auth/pozivnice';
import type { Env } from '../src/types';
import { SESSION_COOKIE } from '../src/app-auth/sesija';
import { json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';
import { lazniWebauthn } from './pomocno/webauthn-mock';

lazniWebauthn(1);

const db = testEnv.DB;
const ORIGIN = 'https://fiskal-test.domovina.ai';
const ADMIN = { email: 'admin@primjer.hr', tip: 'admin' as const };
const noviEmail = () => `k-${crypto.randomUUID().slice(0, 12)}@primjer.hr`;

interface Opcije { metoda?: string; tijelo?: unknown; kolacic?: string | null; tenant?: number; origin?: string | null; kljuc?: string }
function api(putanja: string, o: Opcije = {}) {
  const metoda = o.metoda ?? (o.tijelo !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (o.kolacic) headers.Cookie = `${SESSION_COOKIE}=${o.kolacic}`;
  if (o.tenant) headers['X-Tenant-Id'] = String(o.tenant);
  const origin = o.origin === undefined ? (metoda === 'GET' ? null : ORIGIN) : o.origin;
  if (origin) headers.Origin = origin;
  return poziv(`/api/v1${putanja}`, {
    method: metoda, headers, kljuc: o.kljuc,
    ...(o.tijelo !== undefined ? { body: JSON.stringify(o.tijelo) } : {}),
  });
}

const kolacicIz = (r: Response) => r.headers.get('Set-Cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1] ?? null;

/** Pozivnica kroz rute (opcije → lažni WebAuthn → potvrdi). Vraća kolačić i id ključa. */
async function prihvati(token: string, kljucId = crypto.randomUUID()) {
  const o = await api('/poziv/opcije', { tijelo: { token } });
  expect(o.status).toBe(200);
  const izazov = (await json(o)).opcije.challenge as string;
  const r = await api('/poziv/potvrdi', { tijelo: { token, oznaka: 'Laptop', odgovor: { id: kljucId, izazov } } });
  expect(r.status).toBe(201);
  const kolacic = kolacicIz(r);
  expect(kolacic).toBeTruthy();
  return { kolacic: kolacic!, kljucId };
}

/** Tenant s vlasnikom koji je ušao adminovom pozivnicom. */
async function tenantSVlasnikom() {
  const t = await napraviTenanta({ certifikat: false });
  const email = noviEmail();
  const p = await izdaj(testEnv, { email, tenantId: t.tenant.id, uloga: 'vlasnik' }, ADMIN);
  return { t, email, ...(await prihvati(p.token)) };
}

/** Vlasnik poziva člana kroz rutu; član prihvaća. */
async function clan(vlasnikKolacic: string, tenantId: number, uloga: 'knjigovodja' | 'operater') {
  const email = noviEmail();
  const r = await api('/clanovi/pozivnica', { kolacic: vlasnikKolacic, tenant: tenantId, tijelo: { email, uloga } });
  expect(r.status).toBe(201);
  const link = (await json(r)).link as string;
  expect(link.startsWith(`${ORIGIN}/app/poziv#`)).toBe(true);
  return { email, ...(await prihvati(link.split('#')[1])) };
}

describe('tok: pozivnica → kolačić → postojeći endpoint', () => {
  it('kolačić iz pozivnice otvara popis računa s X-Tenant-Id; /ja i /moji-tenanti; odjava ga gasi', async () => {
    const { t, email, kolacic } = await tenantSVlasnikom();
    const set = (await api('/racun', { kolacic, tenant: t.tenant.id }));
    expect(set.status).toBe(200);

    const ja = await json(await api('/ja', { kolacic }));
    expect(ja.email).toBe(email);
    expect(ja.prijava.metoda).toBe('poziv');
    expect(ja.tenanti).toEqual([{ tenantId: t.tenant.id, oib: t.tenant.oib, naziv: t.tenant.naziv, uloga: 'vlasnik' }]);
    expect((await json(await api('/moji-tenanti', { kolacic }))).tenanti).toHaveLength(1);

    const od = await api('/odjava', { tijelo: {}, kolacic });
    expect(od.status).toBe(200);
    expect(od.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await api('/racun', { kolacic, tenant: t.tenant.id })).status).toBe(401);
  });

  it('kolačić postavlja __Host- s HttpOnly, Secure, SameSite=Lax, Path=/', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const p = await izdaj(testEnv, { email: noviEmail(), tenantId: t.tenant.id, uloga: 'vlasnik' }, ADMIN);
    const izazov = (await json(await api('/poziv/opcije', { tijelo: { token: p.token } }))).opcije.challenge;
    const r = await api('/poziv/potvrdi', { tijelo: { token: p.token, odgovor: { id: crypto.randomUUID(), izazov } } });
    const sc = r.headers.get('Set-Cookie')!;
    expect(sc).toMatch(/^__Host-fiskal_app=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  });

  it('prijava postojećim passkeyem (discoverable) daje novu sesiju; tuđi ključ 401', async () => {
    const { t, kljucId } = await tenantSVlasnikom();
    const izazov = (await json(await api('/prijava/opcije', { tijelo: {} }))).challenge;
    const krivo = await api('/prijava/potvrdi', { tijelo: { odgovor: { id: 'nepostojeci', izazov } } });
    expect(krivo.status).toBe(401);

    const izazov2 = (await json(await api('/prijava/opcije', { tijelo: {} }))).challenge;
    const r = await api('/prijava/potvrdi', { tijelo: { odgovor: { id: kljucId, izazov: izazov2 } } });
    expect(r.status).toBe(200);
    const kolacic = kolacicIz(r)!;
    expect((await json(await api('/ja', { kolacic }))).prijava.metoda).toBe('passkey');
    expect((await api('/racun', { kolacic, tenant: t.tenant.id })).status).toBe(200);
    // Izazov je jednokratan.
    expect((await api('/prijava/potvrdi', { tijelo: { odgovor: { id: kljucId, izazov: izazov2 } } })).status).toBe(401);
  });

  it('iskorištena, opozvana ili kriva pozivnica: 410', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const p = await izdaj(testEnv, { email: noviEmail(), tenantId: t.tenant.id, uloga: 'vlasnik' }, ADMIN);
    await prihvati(p.token);
    expect((await api('/poziv/opcije', { tijelo: { token: p.token } })).status).toBe(410);
    expect((await api('/poziv/opcije', { tijelo: { token: 'x'.repeat(43) } })).status).toBe(410);
    expect((await api('/poziv/opcije', { tijelo: {} })).status).toBe(410);
  });

  it('bez kolačića i bez Authorization: 401; nevažeći kolačić: 401', async () => {
    const t = await napraviTenanta({ certifikat: false });
    expect((await api('/racun', { tenant: t.tenant.id })).status).toBe(401);
    expect((await api('/racun', { kolacic: 'A'.repeat(43), tenant: t.tenant.id })).status).toBe(401);
  });

  it('deaktiviran korisnik: kolačić više ne vrijedi', async () => {
    const { t, email, kolacic } = await tenantSVlasnikom();
    await db.prepare('UPDATE korisnik SET aktivan = 0 WHERE email = ?').bind(email).run();
    expect((await api('/racun', { kolacic, tenant: t.tenant.id })).status).toBe(401);
  });

  it('bez X-Tenant-Id 400; tuđi tenant 403; neaktivan tenant 403', async () => {
    const { t, kolacic } = await tenantSVlasnikom();
    const tudji = await napraviTenanta({ certifikat: false });
    expect((await api('/racun', { kolacic })).status).toBe(400);
    expect((await api('/racun', { kolacic, tenant: tudji.tenant.id })).status).toBe(403);
    expect((await api('/racun', { kolacic, tenant: 99_999_999 })).status).toBe(403);
    await db.prepare("UPDATE tenant SET status = 'suspended' WHERE id = ?").bind(t.tenant.id).run().catch(async () => {
      await db.prepare("UPDATE tenant SET status = 'neaktivan' WHERE id = ?").bind(t.tenant.id).run();
    });
    expect((await api('/racun', { kolacic, tenant: t.tenant.id })).status).toBe(403);
  });

  it('stari GoTrue redak s velikim slovima u e-mailu: članstvo po lower(user_email)', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const email = noviEmail();
    await db.prepare("INSERT INTO korisnik_tenant (tenant_id, user_email, user_id, uloga) VALUES (?, ?, 'gotrue-sub', 'knjigovodja')")
      .bind(t.tenant.id, email.toUpperCase()).run();
    const p = await izdaj(testEnv, { email, tenantId: t.tenant.id, uloga: 'knjigovodja' }, ADMIN).catch((e) => e);
    // Aktivan korisnik još ne postoji (nema retka `korisnik`), pa pozivnica prolazi.
    const { kolacic } = await prihvati(p.token);
    expect((await api('/racun', { kolacic, tenant: t.tenant.id })).status).toBe(200);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM korisnik_tenant WHERE tenant_id = ?').bind(t.tenant.id).first<number>('n');
    expect(n).toBe(1);
  });
});

describe('Origin (CSRF) za mutacije s kolačićem', () => {
  it('mutacija bez Origin ili s tuđim Origin: 403; s ispravnim prolazi', async () => {
    const { t, kolacic } = await tenantSVlasnikom();
    const tijelo = { oznaka: `P${Date.now() % 100000}`, primjenaOd: '2026-01-01' };
    expect((await api('/postavke/prostor', { kolacic, tenant: t.tenant.id, tijelo, origin: null })).status).toBe(403);
    expect((await api('/postavke/prostor', { kolacic, tenant: t.tenant.id, tijelo, origin: 'https://zlo.primjer.hr' })).status).toBe(403);
    expect((await api('/postavke/prostor', { kolacic, tenant: t.tenant.id, tijelo, origin: 'http://fiskal-test.domovina.ai' })).status).toBe(403);
    expect((await api('/postavke/prostor', { kolacic, tenant: t.tenant.id, tijelo })).status).toBe(201);
  });

  it('GET s kolačićem ne traži Origin', async () => {
    const { t, kolacic } = await tenantSVlasnikom();
    expect((await api('/postavke', { kolacic, tenant: t.tenant.id, origin: null })).status).toBe(200);
  });

  it('javne rute (prijava, pozivnica, odjava) bez Origin: 403', async () => {
    for (const p of ['/prijava/opcije', '/prijava/potvrdi', '/poziv/opcije', '/poziv/potvrdi', '/odjava']) {
      expect((await api(p, { tijelo: {}, origin: null })).status, p).toBe(403);
      expect((await api(p, { tijelo: {}, origin: 'https://zlo.primjer.hr' })).status, p).toBe(403);
    }
  });

  it('dfk_ ključ ne treba Origin, ni kad uz njega stigne i kolačić', async () => {
    const { t, kolacic } = await tenantSVlasnikom();
    const r = await api('/postavke/prostor', {
      kljuc: t.kljuc, kolacic, origin: null, tijelo: { oznaka: `K${Date.now() % 100000}`, primjenaOd: '2026-01-01' },
    });
    expect(r.status).toBe(201);
  });
});

describe('moji passkeyi', () => {
  it('popis, dodavanje uz svježu prijavu, zadnji se ne briše', async () => {
    const { kolacic, kljucId } = await tenantSVlasnikom();
    const popis = await json(await api('/passkeyi', { kolacic }));
    expect(popis.passkeyi.map((k: { id: string; oznaka: string }) => [k.id, k.oznaka])).toEqual([[kljucId, 'Laptop']]);
    expect(popis.dodavanje).toBeNull();

    expect((await api(`/passkeyi/${kljucId}`, { metoda: 'DELETE', kolacic })).status).toBe(409);

    const izazov = (await json(await api('/passkeyi/opcije', { kolacic, tijelo: {} }))).challenge;
    const drugi = crypto.randomUUID();
    const r = await api('/passkeyi/potvrdi', { kolacic, tijelo: { oznaka: 'Mobitel', odgovor: { id: drugi, izazov } } });
    expect(r.status).toBe(201);
    expect((await json(await api('/passkeyi', { kolacic }))).passkeyi).toHaveLength(2);

    expect((await api(`/passkeyi/${kljucId}`, { metoda: 'DELETE', kolacic })).status).toBe(200);
    expect((await api(`/passkeyi/${drugi}`, { metoda: 'DELETE', kolacic })).status).toBe(409);
    expect((await api('/passkeyi/tudji-kljuc', { metoda: 'DELETE', kolacic })).status).toBe(404);
  });

  it('dodavanje nakon 10 min od prijave: 403', async () => {
    const { kolacic } = await tenantSVlasnikom();
    const staro = new Date(Date.now() - 11 * 60_000).toISOString();
    await db.prepare('UPDATE korisnik_sesije SET created_at = ? WHERE created_at > ?').bind(staro, staro).run();
    expect((await api('/passkeyi/opcije', { kolacic, tijelo: {} })).status).toBe(403);
    expect((await json(await api('/passkeyi', { kolacic }))).dodavanje).toMatch(/svježa/);
  });

  it('tuđi ključ se ne briše', async () => {
    const a = await tenantSVlasnikom();
    const b = await tenantSVlasnikom();
    expect((await api(`/passkeyi/${b.kljucId}`, { metoda: 'DELETE', kolacic: a.kolacic })).status).toBe(404);
  });

  it('brisanje bez Origin: 403', async () => {
    const { kolacic, kljucId } = await tenantSVlasnikom();
    expect((await api(`/passkeyi/${kljucId}`, { metoda: 'DELETE', kolacic, origin: null })).status).toBe(403);
  });
});

describe('članovi tenanta (samo vlasnik)', () => {
  it('vlasnik poziva operatera; operater ulazi s ulogom operater i ne smije postavke', async () => {
    const v = await tenantSVlasnikom();
    const o = await clan(v.kolacic, v.t.tenant.id, 'operater');
    expect((await api('/racun', { kolacic: o.kolacic, tenant: v.t.tenant.id })).status).toBe(200);
    const r = await api('/postavke/prostor', { kolacic: o.kolacic, tenant: v.t.tenant.id, tijelo: { oznaka: 'X1', primjenaOd: '2026-01-01' } });
    expect(r.status).toBe(403);

    const popis = await json(await api('/clanovi', { kolacic: v.kolacic, tenant: v.t.tenant.id }));
    const uloge = popis.clanovi.map((c: { email: string; uloga: string; ja: boolean; imaPasskey: boolean }) => [c.email, c.uloga, c.ja, c.imaPasskey]);
    expect(uloge).toEqual([[v.email, 'vlasnik', true, true], [o.email, 'operater', false, true]]);
    expect(popis.pozivnice).toEqual([]);
  });

  it('operater i knjigovođa na članovima: 403', async () => {
    const v = await tenantSVlasnikom();
    const tid = v.t.tenant.id;
    for (const uloga of ['operater', 'knjigovodja'] as const) {
      const c = await clan(v.kolacic, tid, uloga);
      expect((await api('/clanovi', { kolacic: c.kolacic, tenant: tid })).status, uloga).toBe(403);
      expect((await api('/clanovi/pozivnica', { kolacic: c.kolacic, tenant: tid, tijelo: { email: noviEmail(), uloga: 'operater' } })).status, uloga).toBe(403);
      expect((await api('/clanovi/1/deaktiviraj', { kolacic: c.kolacic, tenant: tid, tijelo: {} })).status, uloga).toBe(403);
      expect((await api('/clanovi/pozivnica/1/opozovi', { kolacic: c.kolacic, tenant: tid, tijelo: {} })).status, uloga).toBe(403);
    }
  });

  it('dfk_ ključ na članovima: 403', async () => {
    const t = await napraviTenanta({ certifikat: false });
    expect((await api('/clanovi', { kljuc: t.kljuc })).status).toBe(403);
  });

  it('vlasnik ne može pozvati vlasnika (403) ni nepostojeću ulogu (400); već aktivan član 409', async () => {
    const v = await tenantSVlasnikom();
    const tid = v.t.tenant.id;
    expect((await api('/clanovi/pozivnica', { kolacic: v.kolacic, tenant: tid, tijelo: { email: noviEmail(), uloga: 'vlasnik' } })).status).toBe(403);
    expect((await api('/clanovi/pozivnica', { kolacic: v.kolacic, tenant: tid, tijelo: { email: noviEmail(), uloga: 'admin' } })).status).toBe(400);
    expect((await api('/clanovi/pozivnica', { kolacic: v.kolacic, tenant: tid, tijelo: { email: 'nije-email', uloga: 'operater' } })).status).toBe(400);
    const o = await clan(v.kolacic, tid, 'operater');
    const r = await api('/clanovi/pozivnica', { kolacic: v.kolacic, tenant: tid, tijelo: { email: o.email, uloga: 'knjigovodja' } });
    expect(r.status).toBe(409);
    expect((await json(r)).razlog).toBe('vec_clan');
  });

  it('opoziv pozivnice: link više ne vrijedi; tuđi tenant ne može opozvati (404)', async () => {
    const v = await tenantSVlasnikom();
    const drugi = await tenantSVlasnikom();
    const r = await json(await api('/clanovi/pozivnica', { kolacic: v.kolacic, tenant: v.t.tenant.id, tijelo: { email: noviEmail(), uloga: 'knjigovodja' } }));
    const popis = await json(await api('/clanovi', { kolacic: v.kolacic, tenant: v.t.tenant.id }));
    expect(popis.pozivnice.map((p: { id: number; stvorioTip: string }) => [p.id, p.stvorioTip])).toEqual([[r.id, 'vlasnik']]);
    expect(JSON.stringify(popis)).not.toContain('token');

    expect((await api(`/clanovi/pozivnica/${r.id}/opozovi`, { kolacic: drugi.kolacic, tenant: drugi.t.tenant.id, tijelo: {} })).status).toBe(404);
    expect((await api(`/clanovi/pozivnica/${r.id}/opozovi`, { kolacic: v.kolacic, tenant: v.t.tenant.id, tijelo: {} })).status).toBe(200);
    expect((await api('/poziv/opcije', { tijelo: { token: r.link.split('#')[1] } })).status).toBe(410);
    expect((await api(`/clanovi/pozivnica/${r.id}/opozovi`, { kolacic: v.kolacic, tenant: v.t.tenant.id, tijelo: {} })).status).toBe(404);
    // Trag (S3, odluka 300): vlasnikove radnje, bez neuspjelih pokušaja.
    const trag = (await db.prepare('SELECT tko, tko_tip, radnja FROM korisnik_aktivnost WHERE pozivnica_id = ? ORDER BY id').bind(r.id).all()).results;
    expect(trag).toEqual([
      { tko: v.email, tko_tip: 'vlasnik', radnja: 'poziv.izdan' }, { tko: v.email, tko_tip: 'vlasnik', radnja: 'poziv.opozvan' },
    ]);
  });

  it('deaktivacija člana: pristup tenantu prestaje odmah; sebe 409; tuđi član 404; vlasnika 403', async () => {
    const v = await tenantSVlasnikom();
    const tid = v.t.tenant.id;
    const k = await clan(v.kolacic, tid, 'knjigovodja');
    const popis = await json(await api('/clanovi', { kolacic: v.kolacic, tenant: tid }));
    const idK = popis.clanovi.find((c: { email: string }) => c.email === k.email).id;
    const idJa = popis.clanovi.find((c: { ja: boolean }) => c.ja).id;

    const drugi = await tenantSVlasnikom();
    expect((await api(`/clanovi/${idK}/deaktiviraj`, { kolacic: drugi.kolacic, tenant: drugi.t.tenant.id, tijelo: {} })).status).toBe(404);
    expect((await api(`/clanovi/${idJa}/deaktiviraj`, { kolacic: v.kolacic, tenant: tid, tijelo: {} })).status).toBe(409);

    expect((await api(`/clanovi/${idK}/deaktiviraj`, { kolacic: v.kolacic, tenant: tid, tijelo: {} })).status).toBe(200);
    expect((await db.prepare("SELECT tko_tip FROM korisnik_aktivnost WHERE radnja = 'clanstvo.deaktivirano' AND email = ? AND tenant_id = ?")
      .bind(k.email, tid).all()).results).toEqual([{ tko_tip: 'vlasnik' }]);
    expect((await api('/racun', { kolacic: k.kolacic, tenant: tid })).status).toBe(403);
    expect((await json(await api('/moji-tenanti', { kolacic: k.kolacic }))).tenanti).toEqual([]);

    // Drugi vlasnik (admin ga je pozvao) se ne deaktivira kroz dashboard.
    const email2 = noviEmail();
    await prihvati((await izdaj(testEnv, { email: email2, tenantId: tid, uloga: 'vlasnik' }, ADMIN)).token);
    const id2 = (await json(await api('/clanovi', { kolacic: v.kolacic, tenant: tid }))).clanovi
      .find((c: { email: string }) => c.email === email2).id;
    expect((await api(`/clanovi/${id2}/deaktiviraj`, { kolacic: v.kolacic, tenant: tid, tijelo: {} })).status).toBe(403);

    // Ponovni ulazak deaktiviranog člana: nova pozivnica vlasnika.
    const r = await api('/clanovi/pozivnica', { kolacic: v.kolacic, tenant: tid, tijelo: { email: k.email, uloga: 'operater' } });
    expect(r.status).toBe(201);
    const novi = await prihvati((await json(r)).link.split('#')[1]);
    expect((await api('/racun', { kolacic: novi.kolacic, tenant: tid })).status).toBe(200);
  });
});

// S5 (odluka 500): GoTrue i CORS su van. JWT nije ulaz, a /api/v1 ne šalje CORS zaglavlja
// ni starom dashboard originu; dfk_ i kolačić rade kao prije.
describe('bez GoTrue i CORS-a', () => {
  const STARI_ORIGIN = 'https://fiskal-app.domovina.ai';
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc';

  it('Bearer JWT (stari dashboard) → 401, bez poziva prema van', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/ja', { headers: { Authorization: `Bearer ${jwt}`, 'X-Tenant-Id': String(t.tenant.id) } });
    expect(r.status).toBe(401);
    expect((await json(r)).greska).toMatch(/dfk_/);
  });

  it('/ja bez kolačića i ključa → 401', async () => {
    expect((await poziv('/api/v1/ja')).status).toBe(401);
  });

  it('preflight i GET sa starog origina nemaju Access-Control-Allow-Origin', async () => {
    const t = await napraviTenanta();
    const pre = await poziv('/api/v1/racun', {
      method: 'OPTIONS',
      headers: { Origin: STARI_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-tenant-id' },
    });
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const r = await poziv('/api/v1/racun', { kljuc: t.kljuc, headers: { Origin: STARI_ORIGIN } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('pozivnica e-mailom: odmah pri izdavanju i „pošalji ponovno”', () => {
  const KLJUC = 're_platforma_0123456789abcdef';
  const envResend: Env = { ...testEnv, EMAIL: undefined, RESEND_API_KEY: KLJUC };
  const envBezMaila: Env = { ...testEnv, EMAIL: undefined, RESEND_API_KEY: undefined };
  let slanja: { from: string; to: string[]; reply_to?: string; subject: string; text: string; html: string }[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    slanja = [];
    const pravi = globalThis.fetch;
    spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (ulaz, init) => {
      const url = typeof ulaz === 'string' ? ulaz : ulaz instanceof URL ? ulaz.href : ulaz.url;
      if (url !== 'https://api.resend.com/emails') return pravi(ulaz, init);
      slanja.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'msg' }), { status: 200 });
    });
  });
  afterEach(() => spy.mockRestore());

  const pozovi = (v: { kolacic: string; t: { tenant: { id: number } } }, email: string, env: Env = envResend) =>
    poziv('/api/v1/clanovi/pozivnica', {
      method: 'POST', env, body: JSON.stringify({ email, ime: 'Iva', uloga: 'operater' }),
      headers: { Cookie: `${SESSION_COOKIE}=${v.kolacic}`, 'X-Tenant-Id': String(v.t.tenant.id), Origin: ORIGIN },
    });
  const ponovno = (v: { kolacic: string; t: { tenant: { id: number } } }, id: number, env: Env = envResend) =>
    poziv(`/api/v1/clanovi/pozivnica/${id}/posalji-ponovno`, {
      method: 'POST', env, body: '{}',
      headers: { Cookie: `${SESSION_COOKIE}=${v.kolacic}`, 'X-Tenant-Id': String(v.t.tenant.id), Origin: ORIGIN },
    });

  it('vlasnik poziva: mail odmah ide pozvanom s linkom, Reply-To je vlasnik; trag bilježi slanje', async () => {
    const v = await tenantSVlasnikom();
    const email = noviEmail();
    const r = await pozovi(v, email);
    expect(r.status).toBe(201);
    const b = await json(r);
    expect(b).toMatchObject({ email, poslano: true, emailGreska: null });
    expect(slanja).toHaveLength(1);
    expect(slanja[0].to).toEqual([email]);
    expect(slanja[0].from).toBe('Domovina Fiskal <racuni@domovina.ai>');
    expect(slanja[0].reply_to).toBe(v.email);
    expect(slanja[0].subject).toContain('Pozivnica u Domovina Fiskal');
    expect(slanja[0].text).toContain(b.link);
    expect(slanja[0].text).toContain('Iva');
    // Bez <a href>: praćenje klikova (Resend) bi token iz fragmenta prepisalo u svoj redirect.
    expect(slanja[0].html).not.toMatch(/<a\s/i);
    expect(slanja[0].html).toContain(b.link.split('#')[1]);
    const z = await db.prepare(`SELECT detalji FROM korisnik_aktivnost WHERE pozivnica_id = ? AND radnja = 'poziv.izdan'`).bind(b.id).first<{ detalji: string }>();
    expect(JSON.parse(z!.detalji)).toMatchObject({ poslano: true, kanal: 'resend', uloga: 'operater' });
  });

  it('mail ne prođe: pozivnica ipak vrijedi, link se vraća s greškom', async () => {
    const v = await tenantSVlasnikom();
    const r = await pozovi(v, noviEmail(), envBezMaila);
    expect(r.status).toBe(201);
    const b = await json(r);
    expect(b.poslano).toBe(false);
    expect(b.emailGreska).toContain('Nijedan email kanal');
    expect(await provjeri(testEnv, b.link.split('#')[1])).not.toBeNull();
  });

  it('pošalji ponovno: novi link ide mailom, stari ne vrijedi; tuđi tenant 404; iskorištena 404', async () => {
    const v = await tenantSVlasnikom();
    const email = noviEmail();
    const prva = await json(await pozovi(v, email));
    const r = await ponovno(v, prva.id);
    expect(r.status).toBe(201);
    const druga = await json(r);
    expect(druga).toMatchObject({ email, poslano: true });
    expect(druga.id).not.toBe(prva.id);
    expect(druga.link).not.toBe(prva.link);
    expect(slanja).toHaveLength(2);
    expect(slanja[1].text).toContain(druga.link);
    expect(await provjeri(testEnv, prva.link.split('#')[1])).toBeNull();
    const nova = await provjeri(testEnv, druga.link.split('#')[1]);
    expect(nova).toMatchObject({ email, ime: 'Iva', uloga: 'operater', tenantId: v.t.tenant.id });
    // Stara (sad opozvana) se više ne može ponovno poslati, ni iz drugog tenanta.
    expect((await ponovno(v, prva.id)).status).toBe(404);
    const drugi = await tenantSVlasnikom();
    expect((await ponovno(drugi, druga.id)).status).toBe(404);
    // Iskorištena pozivnica se ne šalje ponovno.
    await prihvati(druga.link.split('#')[1]);
    expect((await ponovno(v, druga.id)).status).toBe(404);
    const trag = (await db.prepare(`SELECT detalji FROM korisnik_aktivnost WHERE pozivnica_id = ?`).bind(druga.id).first<{ detalji: string }>())!;
    expect(JSON.parse(trag.detalji)).toMatchObject({ zamjenjuje: prva.id, poslano: true });
  });

  it('vlasnik ne može ponovno poslati pozivnicu za vlasnika (izdao je admin): 403', async () => {
    const v = await tenantSVlasnikom();
    const p = await izdaj(testEnv, { email: noviEmail(), tenantId: v.t.tenant.id, uloga: 'vlasnik' }, ADMIN);
    expect((await ponovno(v, p.id)).status).toBe(403);
    expect(slanja).toHaveLength(0);
  });
});

describe('pozivnica za postojeći račun: prihvaćanje prijavom (bez novog passkeya)', () => {
  async function prijavaOdgovor(kljucId: string) {
    const o = await api('/prijava/opcije', { tijelo: {} });
    return { id: kljucId, izazov: (await json(o)).challenge as string };
  }
  const brojKljuceva = (email: string) =>
    db.prepare('SELECT COUNT(*) AS n FROM korisnik_passkeys kp JOIN korisnik k ON k.id = kp.korisnik_id WHERE k.email = ?')
      .bind(email).first<{ n: number }>().then((r) => r!.n);

  it('postojećim passkeyem: članstvo u novom tenantu, pozivnica potrošena, kolačić, ključ ostaje jedan', async () => {
    const v = await tenantSVlasnikom();
    const drugi = await napraviTenanta({ certifikat: false });
    const p = await izdaj(testEnv, { email: v.email, tenantId: drugi.tenant.id, uloga: 'knjigovodja' }, ADMIN);
    const opc = await json(await api('/poziv/opcije', { tijelo: { token: p.token } }));
    expect(opc.imaPasskey).toBe(true);

    const r = await api('/poziv/prijava', { tijelo: { token: p.token, odgovor: await prijavaOdgovor(v.kljucId) } });
    expect(r.status).toBe(201);
    expect(await json(r)).toMatchObject({ ok: true, email: v.email, tenantId: drugi.tenant.id, uloga: 'knjigovodja' });
    const kolacic = kolacicIz(r)!;
    expect(kolacic).toBeTruthy();
    expect(await brojKljuceva(v.email)).toBe(1);
    expect(await provjeri(testEnv, p.token)).toBeNull();
    const clan = await db.prepare('SELECT uloga, aktivan FROM korisnik_tenant WHERE tenant_id = ? AND lower(user_email) = ?')
      .bind(drugi.tenant.id, v.email).first<{ uloga: string; aktivan: number }>();
    expect(clan).toEqual({ uloga: 'knjigovodja', aktivan: 1 });
    // Novi kolačić radi u novom tenantu.
    expect((await api('/clanovi', { kolacic, tenant: drugi.tenant.id })).status).toBe(403); // knjigovođa nije vlasnik
    expect((await api('/racun', { kolacic, tenant: drugi.tenant.id })).status).toBe(200);
    // Ponovno: pozivnica je potrošena.
    expect((await api('/poziv/prijava', { tijelo: { token: p.token, odgovor: await prijavaOdgovor(v.kljucId) } })).status).toBe(410);
  });

  it('passkey drugog računa: 403, pozivnica ostaje otvorena; nova pozivnica (bez računa): imaPasskey false', async () => {
    const v = await tenantSVlasnikom();
    const tudi = await tenantSVlasnikom();
    const p = await izdaj(testEnv, { email: v.email, tenantId: tudi.t.tenant.id, uloga: 'operater' }, ADMIN);
    const r = await api('/poziv/prijava', { tijelo: { token: p.token, odgovor: await prijavaOdgovor(tudi.kljucId) } });
    expect(r.status).toBe(403);
    expect((await json(r)).greska).toContain(v.email);
    expect(kolacicIz(r)).toBeNull();
    expect(await provjeri(testEnv, p.token)).not.toBeNull();

    const nova = await izdaj(testEnv, { email: noviEmail(), tenantId: v.t.tenant.id, uloga: 'operater' }, ADMIN);
    expect((await json(await api('/poziv/opcije', { tijelo: { token: nova.token } }))).imaPasskey).toBe(false);
  });

  it('pozivnica za novi passkey se ne prihvaća prijavom (409)', async () => {
    const v = await tenantSVlasnikom();
    const k = await db.prepare('SELECT id FROM korisnik WHERE email = ?').bind(v.email).first<{ id: number }>();
    const p = await izdaj(testEnv, { email: v.email, korisnikId: k!.id }, ADMIN);
    expect((await api('/poziv/prijava', { tijelo: { token: p.token, odgovor: await prijavaOdgovor(v.kljucId) } })).status).toBe(409);
    expect(await provjeri(testEnv, p.token)).not.toBeNull();
  });
});
