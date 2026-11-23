import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRacunKontekst } from '../src/db';
import { posaljiRacunEmailom } from '../src/email';
import { b2cTijelo, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';
import { cisNedostupan, cisVracaJir } from './pomocno/cis-mock';

type Poruka = { to: string; subject: string; text: string; html: string; replyTo?: string };

describe('E-mail računa (4.4)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('fiskalni: naslov „Račun", bez podataka za plaćanje, reply-to = e-mail tenanta', async () => {
    const t = await napraviTenanta();
    await testEnv.DB.prepare(`UPDATE tenant SET email = 'prodaja@crosulja.hr' WHERE id = ?`).bind(t.tenant.id).run();
    const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    const k = (await getRacunKontekst(testEnv.DB, t.tenant.id, r.id))!;
    const send = vi.fn(async (_p: Poruka) => ({}));
    await posaljiRacunEmailom({ EMAIL: { send } }, k, new Uint8Array([1]), 'kupac@primjer.hr');
    const p = send.mock.calls[0][0];
    expect(p.subject).toBe(`Račun ${r.brojRacuna} — Testni obveznik d.o.o.`);
    expect(p.text).not.toMatch(/IBAN|Podaci za plaćanje/);
    expect(p.html).not.toMatch(/IBAN/);
    expect(p.replyTo).toBe('prodaja@crosulja.hr');
  });

  it('nefiskalni RACUN s IBAN-om zadržava podatke za plaćanje', async () => {
    const t = await napraviTenanta();
    const r = await json(
      await poziv('/api/v1/racun', {
        method: 'POST', kljuc: t.kljuc,
        body: JSON.stringify({ tip: 'RACUN', poslovniProstor: 'WEB', naplatniUredaj: '1', stavke: [{ naziv: 'X', netoCijena: '10', pdvStopa: '25' }] }),
      }),
    );
    const k = (await getRacunKontekst(testEnv.DB, t.tenant.id, r.id))!;
    const send = vi.fn(async (_p: Poruka) => ({}));
    await posaljiRacunEmailom({ EMAIL: { send } }, k, new Uint8Array([1]), 'kupac@primjer.hr');
    expect(send.mock.calls[0][0].text).toContain('Podaci za plaćanje: IBAN HR1210010051863000160');
    expect(send.mock.calls[0][0].replyTo).toBeUndefined(); // tenant bez e-maila
  });
});

describe('API sitnice (4.4)', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('limit/offset/kpd limit: neispravno → 400 (ne 500)', async () => {
    const t = await napraviTenanta();
    for (const upit of ['limit=abc', 'limit=0', 'limit=201', 'offset=-1', 'offset=1.5']) {
      const r = await poziv(`/api/v1/racun?${upit}`, { kljuc: t.kljuc });
      expect(r.status, upit).toBe(400);
    }
    expect((await poziv('/api/v1/racun?limit=5&offset=0', { kljuc: t.kljuc })).status).toBe(200);
    expect((await poziv('/api/v1/kpd?q=usluge&limit=x', { kljuc: t.kljuc })).status).toBe(400);
  });

  it('popis vraća jir, zki, vanjskaReferenca i fiskalizacija.status', async () => {
    const t = await napraviTenanta();
    await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { vanjskaReferenca: 'L-1' })) });
    const { racuni } = await json(await poziv('/api/v1/racun', { kljuc: t.kljuc }));
    expect(racuni[0]).toMatchObject({ vanjskaReferenca: 'L-1', fiskalizacija: { status: 'fiskaliziran' } });
    expect(racuni[0].jir).toBeTruthy();
    expect(racuni[0].zki).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('Slanje fiskalnog računa bez JIR-a', () => {
  const posalji = (kljuc: string, id: number, tijelo: Record<string, unknown> = {}) =>
    poziv(`/api/v1/racun/${id}/posalji`, { method: 'POST', kljuc, body: JSON.stringify({ na: 'kupac@primjer.hr', ...tijelo }) });

  it('CIS nedostupan → 409 NEMA_JIR, ništa nije zabilježeno kao poslano', async () => {
    cisNedostupan();
    const t = await napraviTenanta();
    const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    const odg = await posalji(t.kljuc, r.id);
    expect(odg.status).toBe(409);
    expect(await json(odg)).toMatchObject({ kod: 'NEMA_JIR' });
    const red = await testEnv.DB.prepare('SELECT poslano_email_ts FROM racun WHERE id = ?').bind(r.id).first<{ poslano_email_ts: string | null }>();
    expect(red?.poslano_email_ts).toBeNull();
  });

  it('{ bezJir: true } prolazi provjeru (svjesno uručenje sa ZKI-jem)', async () => {
    cisNedostupan();
    const t = await napraviTenanta();
    const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    expect((await posalji(t.kljuc, r.id, { bezJir: true })).status).not.toBe(409);
  });

  it('fiskaliziran račun (ima JIR) se šalje bez zastavice', async () => {
    cisVracaJir();
    const t = await napraviTenanta();
    const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    expect((await posalji(t.kljuc, r.id)).status).not.toBe(409);
  });
});
