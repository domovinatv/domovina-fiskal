// Rotacija KEK-a (ENC_MASTER_KEY): podaci se ne diraju, samo se DEK svakog
// retka odmota starim i omota novim KEK-om. Tijekom prijelaza Worker čita s
// oba (ENC_MASTER_KEY_STARI kao rezerva). Vidi docs/knowledge/21-* §6.
import { describe, expect, it } from 'vitest';
import { getDokuKonfig, upsertDokuKonfig } from '../src/db';
import { ucitajPotpisniMaterijal } from '../src/fiskal/fiskalizacija';
import { dekriptirajTajnu, enkriptirajTajnu, oznakaKek } from '../src/kripto';
import type { Env } from '../src/types';
import { adminSkripta, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';

const STARI = testEnv.ENC_MASTER_KEY!; // njime su redovi upisani
const NOVI = 'ab'.repeat(32);
const KRIVI = 'cd'.repeat(32);
const db = testEnv.DB;

const rotacija = (env: Env, suho: boolean) =>
  poziv(`/admin/kripto/rotacija${suho ? '?suho=1' : ''}`, { method: 'POST', env, headers: { Authorization: adminSkripta() } }).then(async (r) => ({
    status: r.status,
    tijelo: await json(r),
  }));

async function tenantSDokuTokenom() {
  const t = await napraviTenanta();
  const enc = await enkriptirajTajnu(STARI, 'doku-tajni-token');
  await upsertDokuKonfig(db, t.tenant.id, { okolina: 'test', tokenEncrypted: enc.tokenEncrypted, encKeyId: await oznakaKek(STARI), encIv: enc.encIv, dekWrapped: enc.dekWrapped, dekIv: enc.dekIv, tokenPrefiks: null });
  return t;
}

describe('Rotacija KEK-a', () => {
  it('pogrešan stari KEK: suha provjera to otkrije, ništa se ne mijenja', async () => {
    await tenantSDokuTokenom();
    const env = { ...testEnv, ENC_MASTER_KEY: NOVI, ENC_MASTER_KEY_STARI: KRIVI };
    const r = await rotacija(env, false);
    expect(r.status).toBe(409);
    expect(r.tijelo.nijedan).toBeGreaterThan(0);
    // Stari KEK i dalje otvara sve — ništa nije prepisano.
    const provjera = await rotacija({ ...testEnv, ENC_MASTER_KEY: STARI }, true);
    expect(provjera.tijelo.nijedan).toBe(0);
  });

  it('prijelaz: novi + stari KEK → čitanje radi; rotacija premota sve; poslije radi samo s novim', async () => {
    const t = await tenantSDokuTokenom();
    const prijelaz = { ...testEnv, ENC_MASTER_KEY: NOVI, ENC_MASTER_KEY_STARI: STARI };

    // Korak 0: dok je stari još tekući, suha provjera potvrdi da STARI otvara sve.
    const prije = await rotacija({ ...testEnv, ENC_MASTER_KEY_STARI: STARI }, true);
    expect(prije.tijelo.stariOtvara).toBe(prije.tijelo.ukupno);
    expect((await rotacija({ ...testEnv, ENC_MASTER_KEY_STARI: KRIVI }, true)).tijelo.stariOtvara).toBe(0);

    expect('materijal' in (await ucitajPotpisniMaterijal(prijelaz, t.tenant.id))).toBe(true);

    const suho = await rotacija(prijelaz, true);
    expect(suho.status).toBe(200);
    expect(suho.tijelo).toMatchObject({ suho: true, premotano: 0, nijedan: 0 });
    expect(suho.tijelo.stari).toBeGreaterThanOrEqual(2); // certifikat + doku token

    const prava = await rotacija(prijelaz, false);
    expect(prava.status).toBe(200);
    expect(prava.tijelo.premotano).toBe(suho.tijelo.stari);

    const samoNovi = { ...testEnv, ENC_MASTER_KEY: NOVI, ENC_MASTER_KEY_STARI: undefined };
    const nakon = await rotacija(samoNovi, true);
    expect(nakon.tijelo).toMatchObject({ stari: 0, nijedan: 0 });
    expect(nakon.tijelo.tekuci).toBe(nakon.tijelo.ukupno);
    expect('materijal' in (await ucitajPotpisniMaterijal(samoNovi, t.tenant.id))).toBe(true);
    const k = (await getDokuKonfig(db, t.tenant.id, 'test'))!;
    expect(await dekriptirajTajnu([NOVI], { tokenEncrypted: k.token_encrypted, encIv: k.enc_iv, dekWrapped: k.dek_wrapped, dekIv: k.dek_iv })).toBe('doku-tajni-token');
    const oznaka = await db.prepare('SELECT enc_key_id FROM doku_konfig WHERE id = ?').bind(k.id).first<{ enc_key_id: string }>();
    expect(oznaka!.enc_key_id).toBe(await oznakaKek(NOVI));
    // Stari KEK više ništa ne otvara.
    expect((await rotacija({ ...testEnv, ENC_MASTER_KEY: STARI }, true)).tijelo.tekuci).toBe(0);
  });

  it('bez ENC_MASTER_KEY_STARI rotacija ne radi ništa i kaže zašto', async () => {
    const r = await rotacija(testEnv, false);
    expect(r.status).toBe(400);
    expect(r.tijelo.greska).toMatch(/ENC_MASTER_KEY_STARI/);
  });
});
