// Vlastiti pošiljatelj e-maila po tenantu (src/email-tenant.ts): Resend je
// mockan; provjerava se provjera ključa/domene, s koje adrese i kojim ključem
// mail ide, fallback na racuni@domovina.ai i da ključ ne curi.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

const KLJUC_TENANTA = 're_tenant_0123456789abcdef';
const KLJUC_PLATFORME = 're_platforma_0123456789abcdef';
const envSResendom: Env = { ...testEnv, EMAIL: undefined, RESEND_API_KEY: KLJUC_PLATFORME };
const db = testEnv.DB;

interface Slanje { auth: string | null; from: string; reply_to?: string; to: string[] }
let slanja: Slanje[];
let domene: { name: string; status: string }[] | 'restricted' | 'nevaljan';
let tenantSlanjeStatus: number;

function mockResend() {
  const pravi = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (ulaz, init) => {
    const url = typeof ulaz === 'string' ? ulaz : ulaz instanceof URL ? ulaz.href : ulaz.url;
    const auth = new Headers(init?.headers).get('Authorization');
    if (url === 'https://api.resend.com/domains') {
      if (domene === 'restricted') return new Response(JSON.stringify({ statusCode: 401, name: 'restricted_api_key', message: 'This API key is restricted to only send emails' }), { status: 401 });
      if (domene === 'nevaljan') return new Response(JSON.stringify({ statusCode: 400, name: 'validation_error', message: 'API key is invalid' }), { status: 400 });
      return new Response(JSON.stringify({ object: 'list', data: domene }), { status: 200 });
    }
    if (url === 'https://api.resend.com/emails') {
      if (auth === `Bearer ${KLJUC_TENANTA}` && tenantSlanjeStatus !== 200) {
        return new Response(JSON.stringify({ statusCode: tenantSlanjeStatus, message: 'The prilikazasusret.hr domain is not verified' }), { status: tenantSlanjeStatus });
      }
      const b = JSON.parse(String(init?.body));
      slanja.push({ auth, from: b.from, reply_to: b.reply_to, to: b.to });
      return new Response(JSON.stringify({ id: 'msg' }), { status: 200 });
    }
    return pravi(ulaz, init);
  });
}

const postavi = (t: TestniTenant, tijelo: Record<string, unknown>) =>
  poziv('/api/v1/postavke/email', { method: 'PUT', kljuc: t.kljuc, body: JSON.stringify(tijelo) });

const ukljuci = (t: TestniTenant, dodatno: Record<string, unknown> = {}) =>
  postavi(t, { posiljateljEmail: 'Financije@PrilikaZaSusret.hr', posiljateljIme: 'Prilika za susret', apiKey: KLJUC_TENANTA, ...dodatno });

async function izdajIPosalji(t: TestniTenant) {
  cisVracaJir();
  const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
  return poziv(`/api/v1/racun/${r.id}/posalji`, { method: 'POST', kljuc: t.kljuc, env: envSResendom, body: JSON.stringify({ na: 'kupac@primjer.hr' }) });
}

describe('Vlastiti pošiljatelj e-maila (BYO Resend)', () => {
  beforeEach(() => {
    slanja = [];
    domene = [{ name: 'prilikazasusret.hr', status: 'verified' }];
    tenantSlanjeStatus = 200;
    mockResend();
  });

  it('bez postavke: GET kaže racuni@domovina.ai, mail ide ključem platforme', async () => {
    const t = await napraviTenanta();
    expect(await json(await poziv('/api/v1/postavke/email', { kljuc: t.kljuc }))).toEqual({ ukljucen: false, posiljatelj: 'racuni@domovina.ai' });
    const r = await izdajIPosalji(t);
    expect(await json(r)).toMatchObject({ ok: true, kanal: 'resend' });
    expect(slanja[0]).toMatchObject({ auth: `Bearer ${KLJUC_PLATFORME}`, from: 'Domovina Fiskal <racuni@domovina.ai>' });
  });

  it('spremanje provjeri domenu, ključ ne vraća, mail ide s adrese tenanta njegovim ključem', async () => {
    const t = await napraviTenanta();
    const r = await ukljuci(t);
    const tijelo = await json(r);
    expect(r.status, JSON.stringify(tijelo)).toBe(200);
    expect(tijelo).toMatchObject({ ukljucen: true, posiljateljEmail: 'financije@prilikazasusret.hr', domenaProvjerena: true, tokenPrefiks: 're_tena' });
    expect(JSON.stringify(tijelo)).not.toContain(KLJUC_TENANTA);
    const red = await db.prepare('SELECT * FROM tenant_email WHERE tenant_id = ?').bind(t.tenant.id).first<Record<string, unknown>>();
    expect(JSON.stringify(red)).not.toContain(KLJUC_TENANTA);

    const s = await izdajIPosalji(t);
    expect(await json(s)).toMatchObject({ ok: true, kanal: 'resend-tenant' });
    expect(slanja).toHaveLength(1);
    expect(slanja[0]).toMatchObject({ auth: `Bearer ${KLJUC_TENANTA}`, from: 'Prilika za susret <financije@prilikazasusret.hr>', reply_to: 'financije@prilikazasusret.hr' });
    expect((await json(await poziv('/api/v1/postavke/email', { kljuc: t.kljuc }))).zadnjeSlanje).toBeTruthy();
  });

  it('domena nije u Resendu ili nije verificirana → 400, ništa se ne sprema', async () => {
    const t = await napraviTenanta();
    domene = [{ name: 'drugo.hr', status: 'verified' }];
    let r = await ukljuci(t);
    expect(r.status).toBe(400);
    expect((await json(r)).greska).toMatch(/prilikazasusret\.hr nije dodana.*drugo\.hr/);
    domene = [{ name: 'prilikazasusret.hr', status: 'pending' }];
    r = await ukljuci(t);
    expect((await json(r)).greska).toMatch(/nije verificirana \(status: pending\)/);
    domene = 'nevaljan';
    r = await ukljuci(t);
    expect((await json(r)).greska).toMatch(/ne prihvaća ključ \(HTTP 400: API key is invalid\)/);
    expect(await db.prepare('SELECT count(*) n FROM tenant_email WHERE tenant_id = ?').bind(t.tenant.id).first('n')).toBe(0);
  });

  it('ključ samo za slanje se prihvaća, domena označena kao neprovjerena', async () => {
    const t = await napraviTenanta();
    domene = 'restricted';
    const r = await ukljuci(t);
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ ukljucen: true, domenaProvjerena: false });
  });

  it('neispravan unos → 400 bez poziva Resenda', async () => {
    const t = await napraviTenanta();
    for (const krivo of [{ posiljateljEmail: 'nije-adresa' }, { posiljateljEmail: 'x@domovina.ai' }, { apiKey: 'sk_krivi' }, { posiljateljIme: 'A <b>' }]) {
      expect((await ukljuci(t, krivo)).status, JSON.stringify(krivo)).toBe(400);
    }
    // prvi unos bez ključa: nema što zadržati
    expect((await json(await postavi(t, { posiljateljEmail: 'financije@prilikazasusret.hr' }))).greska).toMatch(/Upiši Resend API ključ/);
  });

  it('promjena imena bez novog ključa zadržava postojeći ključ', async () => {
    const t = await napraviTenanta();
    await ukljuci(t);
    const r = await postavi(t, { posiljateljEmail: 'financije@prilikazasusret.hr', posiljateljIme: 'Udruga Prilika' });
    expect(r.status).toBe(200);
    await izdajIPosalji(t);
    expect(slanja[0]).toMatchObject({ auth: `Bearer ${KLJUC_TENANTA}`, from: 'Udruga Prilika <financije@prilikazasusret.hr>' });
  });

  it('Resend tenanta odbije → mail ide s racuni@domovina.ai, greška zapisana; sljedeći uspjeh je briše', async () => {
    const t = await napraviTenanta();
    await ukljuci(t);
    tenantSlanjeStatus = 403;
    const r = await izdajIPosalji(t);
    expect(await json(r)).toMatchObject({ ok: true, kanal: 'resend' });
    expect(slanja).toHaveLength(1);
    expect(slanja[0]).toMatchObject({ auth: `Bearer ${KLJUC_PLATFORME}`, from: 'Domovina Fiskal <racuni@domovina.ai>', reply_to: 'financije@prilikazasusret.hr' });
    const stanje = await json(await poziv('/api/v1/postavke/email', { kljuc: t.kljuc }));
    expect(stanje.greska).toMatch(/Resend 403.*not verified/);

    tenantSlanjeStatus = 200;
    expect(await json(await izdajIPosalji(t))).toMatchObject({ kanal: 'resend-tenant' });
    expect((await json(await poziv('/api/v1/postavke/email', { kljuc: t.kljuc }))).greska).toBeNull();
  });

  it('samo tenantov ključ (platforma bez kanala) je dovoljan za slanje', async () => {
    const t = await napraviTenanta();
    await ukljuci(t);
    cisVracaJir();
    const racun = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    const bezKanala: Env = { ...testEnv, EMAIL: undefined, RESEND_API_KEY: undefined };
    const r = await poziv(`/api/v1/racun/${racun.id}/posalji`, { method: 'POST', kljuc: t.kljuc, env: bezKanala, body: JSON.stringify({ na: 'kupac@primjer.hr' }) });
    expect(await json(r)).toMatchObject({ ok: true, kanal: 'resend-tenant' });
  });

  it('DELETE vraća na zadanog pošiljatelja', async () => {
    const t = await napraviTenanta();
    await ukljuci(t);
    expect(await json(await poziv('/api/v1/postavke/email', { method: 'DELETE', kljuc: t.kljuc }))).toEqual({ ukljucen: false, posiljatelj: 'racuni@domovina.ai' });
    await izdajIPosalji(t);
    expect(slanja[0]!.from).toBe('Domovina Fiskal <racuni@domovina.ai>');
  });
});
