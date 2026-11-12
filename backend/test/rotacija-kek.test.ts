// Rotacija KEK-a (ENC_MASTER_KEY): podaci se ne diraju, samo se DEK svakog
// retka odmota tekućim i omota novim KEK-om. Novi KEK dolazi kao
// ENC_MASTER_KEY_NOVI, pa tekući nikad ne mora napustiti Cloudflare (PROD KEK
// ne postoji nigdje drugdje — 2026-11-12). Vidi docs/knowledge/21-* §6.
import { describe, expect, it } from 'vitest';
import { getDokuKonfig, upsertDokuKonfig } from '../src/db';
import { ucitajPotpisniMaterijal } from '../src/fiskal/fiskalizacija';
import { dekriptirajTajnu, enkriptirajTajnu, kekZaSifriranje, oznakaKek } from '../src/kripto';
import type { Env } from '../src/types';
import { adminSkripta, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';

const TEKUCI = testEnv.ENC_MASTER_KEY!; // njime su redovi upisani
const NOVI = 'ab'.repeat(32);
const KRIVI = 'cd'.repeat(32);
const db = testEnv.DB;
const oznakaReda = (id: number) =>
  db.prepare('SELECT enc_key_id FROM doku_konfig WHERE id = ?').bind(id).first<{ enc_key_id: string }>().then((r) => r!.enc_key_id);

const rotacija = (env: Env, suho: boolean) =>
  poziv(`/admin/kripto/rotacija${suho ? '?suho=1' : ''}`, { method: 'POST', env, headers: { Authorization: adminSkripta() } }).then(async (r) => ({
    status: r.status,
    tijelo: await json(r),
  }));

async function tenantSDokuTokenom() {
  const t = await napraviTenanta();
  const enc = await enkriptirajTajnu(TEKUCI, 'doku-tajni-token');
  await upsertDokuKonfig(db, t.tenant.id, { okolina: 'test', tokenEncrypted: enc.tokenEncrypted, encKeyId: await oznakaKek(TEKUCI), encIv: enc.encIv, dekWrapped: enc.dekWrapped, dekIv: enc.dekIv, tokenPrefiks: null });
  return t;
}

describe('Rotacija KEK-a (ENC_MASTER_KEY_NOVI)', () => {
  it('suha provjera vraća oznake KEK-ova — skripta po njima zna koji ključ Worker stvarno ima', async () => {
    await tenantSDokuTokenom();
    const bez = await rotacija(testEnv, true);
    expect(bez.tijelo).toMatchObject({ oznakaTekuci: await oznakaKek(TEKUCI), oznakaNovi: null, nijedan: 0, naNovom: 0, zaPremotati: 0 });
    expect(bez.tijelo.tekuci).toBe(bez.tijelo.ukupno);
    const s = await rotacija({ ...testEnv, ENC_MASTER_KEY_NOVI: NOVI }, true);
    expect(s.tijelo.oznakaNovi).toBe(await oznakaKek(NOVI));
    expect(s.tijelo.zaPremotati).toBe(s.tijelo.ukupno);
  });

  it('tekući KEK ne otvara sve: 409, ništa se ne mijenja', async () => {
    await tenantSDokuTokenom();
    const r = await rotacija({ ...testEnv, ENC_MASTER_KEY: KRIVI, ENC_MASTER_KEY_NOVI: NOVI }, false);
    expect(r.status).toBe(409);
    expect(r.tijelo.nijedan).toBeGreaterThan(0);
    expect(r.tijelo.premotano).toBe(0);
    const provjera = await rotacija(testEnv, true);
    expect(provjera.tijelo.tekuci).toBe(provjera.tijelo.ukupno);
  });

  it('tijekom prijelaza šifrira se NOVIM (upload u prozoru rotacije ne ostaje na starom)', () => {
    expect(kekZaSifriranje({ ENC_MASTER_KEY: TEKUCI, ENC_MASTER_KEY_NOVI: NOVI })).toBe(NOVI);
    expect(kekZaSifriranje({ ENC_MASTER_KEY: TEKUCI })).toBe(TEKUCI);
  });

  it('admin spremanje doku tokena tijekom prijelaza omota DEK novim KEK-om', async () => {
    const t = await napraviTenanta();
    const env = { ...testEnv, ENC_MASTER_KEY_NOVI: NOVI };
    const r = await poziv(`/admin/tenant/${t.tenant.id}/doku`, {
      method: 'POST',
      env,
      headers: { Authorization: adminSkripta(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'doku-token-u-prijelazu', okolina: 'test' }).toString(),
    });
    expect(r.status).toBeLessThan(400);
    const k = (await getDokuKonfig(db, t.tenant.id, 'test'))!;
    expect(await oznakaReda(k.id)).toBe(await oznakaKek(NOVI));
    expect(await dekriptirajTajnu([NOVI], { tokenEncrypted: k.token_encrypted, encIv: k.enc_iv, dekWrapped: k.dek_wrapped, dekIv: k.dek_iv })).toBe('doku-token-u-prijelazu');
  });

  it('puni prijelaz: NOVI postavljen → premotaj → ENC_MASTER_KEY=NOVI, NOVI obrisan; čitanje radi u svakom koraku', async () => {
    const t = await tenantSDokuTokenom();
    const prijelaz = { ...testEnv, ENC_MASTER_KEY_NOVI: NOVI };
    expect('materijal' in (await ucitajPotpisniMaterijal(prijelaz, t.tenant.id))).toBe(true);

    const suho = await rotacija(prijelaz, true);
    expect(suho.tijelo).toMatchObject({ suho: true, premotano: 0, nijedan: 0 });
    expect(suho.tijelo.zaPremotati).toBeGreaterThanOrEqual(2); // certifikat + doku token

    const prava = await rotacija(prijelaz, false);
    expect(prava.status).toBe(200);
    expect(prava.tijelo.premotano).toBe(suho.tijelo.zaPremotati);

    // Nakon premotavanja, prije zamjene: tekući više ne otvara, novi otvara sve; čitanje radi.
    const poslije = await rotacija(prijelaz, true);
    expect(poslije.tijelo).toMatchObject({ tekuci: 0, zaPremotati: 0, nijedan: 0 });
    expect(poslije.tijelo.naNovom).toBe(poslije.tijelo.ukupno);
    expect('materijal' in (await ucitajPotpisniMaterijal(prijelaz, t.tenant.id))).toBe(true);

    // Zamjena (ENC_MASTER_KEY=NOVI dok NOVI još postoji), pa brisanje NOVI.
    for (const env of [{ ...testEnv, ENC_MASTER_KEY: NOVI, ENC_MASTER_KEY_NOVI: NOVI }, { ...testEnv, ENC_MASTER_KEY: NOVI }]) {
      expect('materijal' in (await ucitajPotpisniMaterijal(env, t.tenant.id))).toBe(true);
    }
    const kraj = await rotacija({ ...testEnv, ENC_MASTER_KEY: NOVI }, true);
    expect(kraj.tijelo.tekuci).toBe(kraj.tijelo.ukupno);
    expect(kraj.tijelo.oznakaTekuci).toBe(await oznakaKek(NOVI));
    const k = (await getDokuKonfig(db, t.tenant.id, 'test'))!;
    expect(await oznakaReda(k.id)).toBe(await oznakaKek(NOVI));
    // Stari KEK više ništa ne otvara.
    expect((await rotacija(testEnv, true)).tijelo.tekuci).toBe(0);
  });

  it('bez ENC_MASTER_KEY_NOVI rotacija ne radi ništa i kaže zašto', async () => {
    const r = await rotacija(testEnv, false);
    expect(r.status).toBe(400);
    expect(r.tijelo.greska).toMatch(/ENC_MASTER_KEY_NOVI/);
  });
});
