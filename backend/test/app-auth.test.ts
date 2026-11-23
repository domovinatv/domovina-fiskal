// Prijava u customer dashboard (docs/passkey/): sesija, passkey i pozivnice (S1).
// Po uzoru na logomedo.com src/lib/admin/{passkey,pozivi,sesija}.test.ts i test/admin-prijava.test.ts.
// WebAuthn se ne radi pravi (odluka 9): verify funkcije su zamijenjene (test/pomocno/webauthn-mock.ts) tako da
// pozovu `expectedChallenge` s izazovom iz lažnog odgovora, pa se vezivanje i jednokratnost
// izazova ipak provjeravaju. D1 se dijeli unutar datoteke: svaki test ima svoje e-mailove.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

import {
  consumeChallenge, createSession, deleteSession, getSession, obrisiSveSesije, SESSION_COOKIE, sessionCookie, storeChallenge,
} from '../src/app-auth/sesija';
import {
  dodajPasskey, loginOptions, MAX_PASSKEYS_PO_KORISNIKU, provjeriRegistraciju, registerRefusal, registrationOptions, verifyLogin,
  type NoviPasskey,
} from '../src/app-auth/passkey';
import {
  iskoristi, ispravanToken, izdaj, naredbeIskoristenja, opozovi, otvorenePozivnice, POZIV_SATI, PozivOdbijen, provjeri,
} from '../src/app-auth/pozivnice';
import { sha256Hex } from '../src/util';
import { napraviTenanta, testEnv } from './pomocno/okolina';
import { lazniWebauthn } from './pomocno/webauthn-mock';

const { prijava: verifyAuthenticationResponse } = lazniWebauthn();

const db = testEnv.DB;
const URL_APP = new URL('https://fiskal-test.domovina.ai/api/v1/prijava');
const ADMIN = { email: 'admin@primjer.hr', tip: 'admin' as const };
const VLASNIK = { email: 'vlasnik@primjer.hr', tip: 'vlasnik' as const };

const noviEmail = () => `k-${crypto.randomUUID().slice(0, 12)}@primjer.hr`;
const kljuc = (id = crypto.randomUUID()): NoviPasskey => ({ id, publicKey: 'AAAA', counter: 0, transports: 'internal' });
const za = (sati: number, od = new Date()) => new Date(od.getTime() + sati * 3600_000);
const tenant = async () => (await napraviTenanta({ certifikat: false })).tenant.id;

async function korisnik(email: string, aktivan = 1, ime: string | null = null): Promise<number> {
  return (await db.prepare('INSERT INTO korisnik (email, ime, aktivan) VALUES (?, ?, ?) RETURNING id').bind(email, ime, aktivan).first<number>('id'))!;
}
async function upisiKljuc(korisnikId: number, id = crypto.randomUUID()) {
  await db.prepare("INSERT INTO korisnik_passkeys (id, korisnik_id, public_key, label, created_at) VALUES (?, ?, 'AAAA', 'test', ?)")
    .bind(id, korisnikId, new Date().toISOString()).run();
  return id;
}
const kolacic = (token: string) => `${SESSION_COOKIE}=${token}`;
const clanstva = async (email: string) => (await db.prepare(
  'SELECT tenant_id, user_email, uloga, aktivan FROM korisnik_tenant WHERE lower(user_email) = ? ORDER BY id',
).bind(email).all()).results;
const kljuceviOd = async (email: string) => (await db.prepare(
  'SELECT kp.id, kp.label FROM korisnik_passkeys kp JOIN korisnik k ON k.id = kp.korisnik_id WHERE k.email = ? ORDER BY kp.created_at, kp.id',
).bind(email).all<{ id: string; label: string }>()).results;
const korisnikPo = (email: string) => db.prepare('SELECT id, email, ime, aktivan FROM korisnik WHERE email = ?').bind(email).first();

const regOdgovor = (id: string, izazov: string, ok = true) => ({ id, izazov, ok }) as unknown as RegistrationResponseJSON;
const authOdgovor = (id: string, izazov: string) => ({ id, izazov }) as unknown as AuthenticationResponseJSON;

beforeEach(() => {
  verifyAuthenticationResponse.mockClear();
});

// ───────────────────────── sesija ─────────────────────────

describe('app-auth sesija', () => {
  it('kolačić __Host-, HttpOnly, Secure, Lax; u bazi sha-256 ≠ token; getSession vraća korisnika', async () => {
    const email = noviEmail();
    const id = await korisnik(email, 1, 'Ana');
    const token = await createSession(testEnv, id, 'passkey', 'UA');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionCookie(token)).toBe(`__Host-fiskal_app=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);
    const redovi = (await db.prepare('SELECT token_hash FROM korisnik_sesije WHERE korisnik_id = ?').bind(id).all<{ token_hash: string }>()).results;
    expect(redovi).toEqual([{ token_hash: await sha256Hex(token) }]);
    expect(redovi[0].token_hash).not.toBe(token);
    const s = await getSession(testEnv, `drugo=1; ${kolacic(token)}`);
    expect(s).toMatchObject({ korisnikId: id, email, ime: 'Ana', method: 'passkey' });
    expect(await getSession(testEnv, kolacic('x'.repeat(43)))).toBeNull();
    expect(await getSession(testEnv, null)).toBeNull();
  });

  it('12 h trajanja i 2 h neaktivnosti; korištenje pomiče neaktivnost', async () => {
    const id = await korisnik(noviEmail());
    const t0 = new Date('2026-11-23T08:00:00.000Z');
    const token = await createSession(testEnv, id, 'passkey', null, t0);
    expect(await getSession(testEnv, kolacic(token), za(2.1, t0))).toBeNull(); // neaktivno > 2 h
    expect(await getSession(testEnv, kolacic(token), za(1.9, t0))).not.toBeNull(); // osvježi last_seen
    expect(await getSession(testEnv, kolacic(token), za(3.8, t0))).not.toBeNull(); // 1,9 h od zadnjeg
    expect(await getSession(testEnv, kolacic(token), za(5.9, t0))).toBeNull(); // 2,1 h od zadnjeg
    const t1 = new Date('2026-11-23T08:00:00.000Z');
    const drugi = await createSession(testEnv, id, 'passkey', null, t1);
    for (let h = 1.5; h < 12; h += 1.5) expect(await getSession(testEnv, kolacic(drugi), za(h, t1))).not.toBeNull();
    expect(await getSession(testEnv, kolacic(drugi), za(12.1, t1))).toBeNull(); // istekla
  });

  it('deaktiviran korisnik nema sesiju; obrisiSveSesije i odjava brišu retke', async () => {
    const id = await korisnik(noviEmail());
    const a = await createSession(testEnv, id, 'passkey', null);
    const b = await createSession(testEnv, id, 'poziv', null);
    await db.prepare('UPDATE korisnik SET aktivan = 0 WHERE id = ?').bind(id).run();
    expect(await getSession(testEnv, kolacic(a))).toBeNull();
    await db.prepare('UPDATE korisnik SET aktivan = 1 WHERE id = ?').bind(id).run();
    expect(await getSession(testEnv, kolacic(a))).not.toBeNull();
    await deleteSession(testEnv, kolacic(a));
    expect(await getSession(testEnv, kolacic(a))).toBeNull();
    expect(await getSession(testEnv, kolacic(b))).not.toBeNull();
    await createSession(testEnv, id, 'passkey', null);
    expect(await obrisiSveSesije(testEnv, id)).toBe(2);
    expect(await getSession(testEnv, kolacic(b))).toBeNull();
  });

  it('izazov je jednokratan, vezan uz namjenu i istječe za 5 min', async () => {
    await storeChallenge(testEnv, 'izazov-a', 'poziv', { pozivId: 42 });
    expect(await consumeChallenge(testEnv, 'izazov-a', 'login')).toBeNull(); // kriva namjena ga troši
    expect(await consumeChallenge(testEnv, 'izazov-a', 'poziv')).toBeNull();
    await storeChallenge(testEnv, 'izazov-b', 'poziv', { pozivId: 42 });
    expect(await consumeChallenge(testEnv, 'izazov-b', 'poziv')).toEqual({ korisnikId: null, pozivId: 42 });
    expect(await consumeChallenge(testEnv, 'izazov-b', 'poziv')).toBeNull();
    const t0 = new Date();
    await storeChallenge(testEnv, 'izazov-c', 'login', {}, t0);
    expect(await consumeChallenge(testEnv, 'izazov-c', 'login', new Date(t0.getTime() + 301_000))).toBeNull();
  });
});

// ───────────────────────── passkey ─────────────────────────

describe('app-auth passkey', () => {
  it('registrationOptions: hints client-device/hybrid, discoverable, isključi postojeće ključeve; izazov vezan uz pozivnicu', async () => {
    const email = noviEmail();
    const kid = await upisiKljuc(await korisnik(email));
    const o = await registrationOptions(testEnv, URL_APP, { purpose: 'poziv', pozivId: 9001, email });
    expect(o.hints).toEqual(['client-device', 'hybrid']);
    expect(o.rp.id).toBe('fiskal-test.domovina.ai');
    expect(o.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    expect(o.excludeCredentials?.map((c) => c.id)).toEqual([kid]);
    const red = await db.prepare('SELECT purpose, poziv_id, korisnik_id FROM korisnik_izazovi WHERE challenge = ?').bind(o.challenge).first();
    expect(red).toEqual({ purpose: 'poziv', poziv_id: 9001, korisnik_id: null });
  });

  it('provjeriRegistraciju: izazov druge pozivnice ne vrijedi; ispravan jednom', async () => {
    const email = noviEmail();
    const tudi = await registrationOptions(testEnv, URL_APP, { purpose: 'poziv', pozivId: 1, email });
    const upis = { purpose: 'poziv' as const, pozivId: 2, email };
    expect(await provjeriRegistraciju(testEnv, URL_APP, upis, regOdgovor('k1', tudi.challenge))).toBeNull();
    const moj = await registrationOptions(testEnv, URL_APP, upis);
    expect(await provjeriRegistraciju(testEnv, URL_APP, upis, regOdgovor('k1', moj.challenge)))
      .toEqual({ id: 'k1', publicKey: 'AQID', counter: 0, transports: 'internal' });
    expect(await provjeriRegistraciju(testEnv, URL_APP, upis, regOdgovor('k1', moj.challenge))).toBeNull();
  });

  it('verifyLogin: aktivan korisnik → prijava, counter; deaktiviran → null prije WebAuthn provjere', async () => {
    const email = noviEmail();
    const id = await korisnik(email);
    const kid = await upisiKljuc(id);
    const o = await loginOptions(testEnv, URL_APP);
    expect(await verifyLogin(testEnv, URL_APP, authOdgovor(kid, o.challenge))).toEqual({ korisnikId: id, email });
    expect(await db.prepare('SELECT counter FROM korisnik_passkeys WHERE id = ?').bind(kid).first('counter')).toBe(7);
    expect(await verifyLogin(testEnv, URL_APP, authOdgovor(kid, o.challenge))).toBeNull(); // izazov potrošen

    await db.prepare('UPDATE korisnik SET aktivan = 0 WHERE id = ?').bind(id).run();
    verifyAuthenticationResponse.mockClear();
    const o2 = await loginOptions(testEnv, URL_APP);
    expect(await verifyLogin(testEnv, URL_APP, authOdgovor(kid, o2.challenge))).toBeNull();
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
    expect(await verifyLogin(testEnv, URL_APP, authOdgovor('nepostojeci', o2.challenge))).toBeNull();
  });

  it('dodavanje passkeya: svježa prijava (< 10 min) i najviše 5 po korisniku', async () => {
    const email = noviEmail();
    const id = await korisnik(email);
    const sada = new Date();
    expect(await registerRefusal(testEnv, { korisnikId: id, createdAt: za(-0.2, sada).toISOString() }, sada)).toMatch(/svježa/);
    expect(await registerRefusal(testEnv, { korisnikId: id, createdAt: sada.toISOString() }, sada)).toBeNull();
    for (let i = 0; i < MAX_PASSKEYS_PO_KORISNIKU; i++) {
      const o = await registrationOptions(testEnv, URL_APP, { purpose: 'register', korisnikId: id, email });
      expect(await dodajPasskey(testEnv, URL_APP, { korisnikId: id, email }, regOdgovor(`d${i}-${id}`, o.challenge), ' Mac ')).toBe(true);
    }
    expect(await registerRefusal(testEnv, { korisnikId: id, createdAt: sada.toISOString() }, sada)).toMatch(/Najviše 5/);
    const o = await registrationOptions(testEnv, URL_APP, { purpose: 'register', korisnikId: id, email });
    expect(await dodajPasskey(testEnv, URL_APP, { korisnikId: id, email }, regOdgovor(`d9-${id}`, o.challenge), '')).toBe(false);
    expect((await kljuceviOd(email)).map((k) => k.label)).toEqual(Array(5).fill('Mac'));
  });
});

// ───────────────────────── pozivnice ─────────────────────────

describe('app-auth pozivnice', () => {
  it('izdaj: token 32 B base64url, u bazi samo sha-256, 72 h, e-mail malim slovima', async () => {
    const t = await tenant();
    const email = noviEmail();
    const sada = new Date('2026-11-23T10:00:00.000Z');
    const p = await izdaj(testEnv, { email: `  ${email.toUpperCase()} `, ime: ' Ana ', tenantId: t, uloga: 'operater' }, ADMIN, sada);
    expect(ispravanToken(p.token)).toBe(true);
    expect(p.istjece).toBe('2026-11-26T10:00:00.000Z');
    expect(POZIV_SATI).toBe(72);
    const red = await db.prepare('SELECT * FROM pozivnice WHERE id = ?').bind(p.id).first<Record<string, unknown>>();
    expect(red).toMatchObject({ token_hash: await sha256Hex(p.token), email, ime: 'Ana', tenant_id: t, uloga: 'operater', stvorio_tip: 'admin' });
    expect(JSON.stringify(red)).not.toContain(p.token);
  });

  it('istek 72 h: prije vrijedi, poslije ni provjera ni iskorištenje', async () => {
    const t = await tenant();
    const email = noviEmail();
    const sada = new Date();
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, ADMIN, sada);
    expect(await provjeri(testEnv, p.token, za(POZIV_SATI - 0.1, sada))).not.toBeNull();
    expect(await provjeri(testEnv, p.token, za(POZIV_SATI + 0.1, sada))).toBeNull();
    expect(await iskoristi(testEnv, p.token, kljuc(), '', za(POZIV_SATI + 0.1, sada))).toBeNull();
    expect(await korisnikPo(email)).toBeNull();
    expect(await provjeri(testEnv, 'prekratko')).toBeNull();
    expect(await provjeri(testEnv, undefined)).toBeNull();
  });

  it('iskoristi: korisnik + članstvo + passkey u jednom batchu; drugi put → null', async () => {
    const t = await tenant();
    const email = noviEmail();
    const p = await izdaj(testEnv, { email, ime: 'Ana', tenantId: t, uloga: 'knjigovodja' }, ADMIN);
    const r = await iskoristi(testEnv, p.token, kljuc('prvi-' + email), 'iPhone');
    expect(r?.poziv).toMatchObject({ id: p.id, email, tenantId: t, uloga: 'knjigovodja' });
    expect(await korisnikPo(email)).toMatchObject({ id: r!.korisnikId, ime: 'Ana', aktivan: 1 });
    expect(await clanstva(email)).toEqual([{ tenant_id: t, user_email: email, uloga: 'knjigovodja', aktivan: 1 }]);
    expect(await kljuceviOd(email)).toEqual([{ id: 'prvi-' + email, label: 'iPhone' }]);
    const red = await db.prepare('SELECT iskoristena_at, passkey_id FROM pozivnice WHERE id = ?').bind(p.id).first<Record<string, unknown>>();
    expect(red?.iskoristena_at).toBeTruthy();
    expect(red?.passkey_id).toBe('prvi-' + email);
    // dvostruka upotreba
    expect(await iskoristi(testEnv, p.token, kljuc())).toBeNull();
    expect(await provjeri(testEnv, p.token)).toBeNull();
    expect(await kljuceviOd(email)).toHaveLength(1);
  });

  it('dva istodobna pokušaja → točno jedan uspije; batch nad potrošenom (ista ms) ne stvara ništa', async () => {
    const t = await tenant();
    const email = noviEmail();
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, ADMIN);
    const ishodi = await Promise.all([iskoristi(testEnv, p.token, kljuc()), iskoristi(testEnv, p.token, kljuc()), iskoristi(testEnv, p.token, kljuc())]);
    expect(ishodi.filter(Boolean)).toHaveLength(1);
    expect(await kljuceviOd(email)).toHaveLength(1);
    expect(await clanstva(email)).toHaveLength(1);

    const email2 = noviEmail();
    const p2 = await izdaj(testEnv, { email: email2, tenantId: t, uloga: 'operater' }, ADMIN);
    const hash = await sha256Hex(p2.token);
    const sada = new Date();
    const a = naredbeIskoristenja(testEnv, hash, kljuc('a-' + email2), '', sada);
    const b = naredbeIskoristenja(testEnv, hash, kljuc('b-' + email2), '', sada);
    expect((await db.batch(a.naredbe))[a.potrosnja].results).toHaveLength(1);
    expect((await db.batch(b.naredbe))[b.potrosnja].results).toHaveLength(0);
    expect((await kljuceviOd(email2)).map((k) => k.id)).toEqual(['a-' + email2]);
  });

  it('opozvana se ne može iskoristiti; vlasnik opoziva samo u svom tenantu', async () => {
    const t = await tenant();
    const drugi = await tenant();
    const email = noviEmail();
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, VLASNIK);
    expect(await opozovi(testEnv, p.id, { tenantId: drugi })).toBe(false);
    expect(await opozovi(testEnv, p.id, { tenantId: t })).toBe(true);
    expect(await opozovi(testEnv, p.id)).toBe(false); // već opozvana
    expect(await provjeri(testEnv, p.token)).toBeNull();
    expect(await iskoristi(testEnv, p.token, kljuc())).toBeNull();
    expect(await korisnikPo(email)).toBeNull();
    expect(await clanstva(email)).toEqual([]);
  });

  it('„Odustani” ne troši: izazov izdan, registracija neuspjela ili prekinuta → pozivnica i dalje vrijedi', async () => {
    const t = await tenant();
    const email = noviEmail();
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, ADMIN);
    const poziv = (await provjeri(testEnv, p.token))!;
    const upis = { purpose: 'poziv' as const, pozivId: poziv.id, email };
    await registrationOptions(testEnv, URL_APP, upis); // korisnik zatvori dijalog
    const o = await registrationOptions(testEnv, URL_APP, upis);
    expect(await provjeriRegistraciju(testEnv, URL_APP, upis, regOdgovor('x', o.challenge, false))).toBeNull();
    expect(await provjeri(testEnv, p.token)).not.toBeNull();
    const o2 = await registrationOptions(testEnv, URL_APP, upis);
    const k = await provjeriRegistraciju(testEnv, URL_APP, upis, regOdgovor('ok-' + email, o2.challenge));
    expect(await iskoristi(testEnv, p.token, k!)).not.toBeNull();
  });

  it('nova pozivnica za isti e-mail i tenant poništi staru; drugi tenant ostaje', async () => {
    const t = await tenant();
    const drugi = await tenant();
    const email = noviEmail();
    const a = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, ADMIN);
    const c = await izdaj(testEnv, { email, tenantId: drugi, uloga: 'operater' }, ADMIN);
    const b = await izdaj(testEnv, { email, tenantId: t, uloga: 'knjigovodja' }, VLASNIK);
    expect(await provjeri(testEnv, a.token)).toBeNull();
    expect(await provjeri(testEnv, b.token)).not.toBeNull();
    expect(await provjeri(testEnv, c.token)).not.toBeNull();
    expect((await otvorenePozivnice(testEnv, { tenantId: t })).map((p) => p.id)).toEqual([b.id]);
  });

  it('postojeći redak korisnik_tenant (stari GoTrue, velika slova) se ažurira, ne duplicira', async () => {
    const t = await tenant();
    const email = noviEmail();
    await db.prepare("INSERT INTO korisnik_tenant (tenant_id, user_email, uloga, aktivan) VALUES (?, ?, 'operater', 0)")
      .bind(t, email.toUpperCase()).run();
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'vlasnik' }, ADMIN);
    expect(await iskoristi(testEnv, p.token, kljuc())).not.toBeNull();
    expect(await clanstva(email)).toEqual([{ tenant_id: t, user_email: email.toUpperCase(), uloga: 'vlasnik', aktivan: 1 }]);
  });

  it('vlasnik: ne poziva vlasnika ni novi passkey (i shema to odbija); aktivan član → vec_clan', async () => {
    const t = await tenant();
    const email = noviEmail();
    await expect(izdaj(testEnv, { email, tenantId: t, uloga: 'vlasnik' }, VLASNIK)).rejects.toMatchObject({ razlog: 'uloga' });
    const id = await korisnik(email);
    await expect(izdaj(testEnv, { email, korisnikId: id }, VLASNIK)).rejects.toMatchObject({ razlog: 'samo_admin' });
    await expect(db.prepare(
      `INSERT INTO pozivnice (token_hash, email, tenant_id, uloga, stvorio, stvorio_tip, created_at, istjece)
       VALUES ('h-${email}', ?, ?, 'vlasnik', 'v', 'vlasnik', 'x', 'y')`,
    ).bind(email, t).run()).rejects.toThrow(/CHECK/);
    await expect(izdaj(testEnv, { email: 'nije-email', tenantId: t, uloga: 'operater' }, ADMIN)).rejects.toBeInstanceOf(PozivOdbijen);
    await expect(izdaj(testEnv, { email, tenantId: 999_999, uloga: 'operater' }, ADMIN)).rejects.toMatchObject({ razlog: 'nema_tenanta' });
    await db.prepare("INSERT INTO korisnik_tenant (tenant_id, user_email, uloga) VALUES (?, ?, 'operater')").bind(t, email).run();
    await expect(izdaj(testEnv, { email, tenantId: t, uloga: 'knjigovodja' }, ADMIN)).rejects.toMatchObject({ razlog: 'vec_clan' });
  });

  it('deaktiviran korisnik: vlasnik ga ne vraća (ni izdavanjem ni iskorištenjem); admin pozivnica ga vraća', async () => {
    const t = await tenant();
    const email = noviEmail();
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, VLASNIK);
    const id = await korisnik(email, 0); // deaktiviran nakon izdavanja
    await expect(izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, VLASNIK)).rejects.toMatchObject({ razlog: 'neaktivan' });
    expect(await provjeri(testEnv, p.token)).toBeNull();
    expect(await iskoristi(testEnv, p.token, kljuc())).toBeNull();
    expect(await korisnikPo(email)).toMatchObject({ aktivan: 0 });
    expect(await clanstva(email)).toEqual([]);

    const a = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, ADMIN);
    const r = await iskoristi(testEnv, a.token, kljuc());
    expect(r?.korisnikId).toBe(id);
    expect(await korisnikPo(email)).toMatchObject({ aktivan: 1 });
  });

  it('novi passkey postojećem korisniku: samo aktivnom; deaktivacija nakon izdavanja ga poništi', async () => {
    const email = noviEmail();
    const id = await korisnik(email, 1, 'Ana');
    const stari = await upisiKljuc(id);
    await expect(izdaj(testEnv, { email: noviEmail(), korisnikId: id }, ADMIN)).rejects.toMatchObject({ razlog: 'drugi_email' });
    await expect(izdaj(testEnv, { email, korisnikId: 999_999 }, ADMIN)).rejects.toMatchObject({ razlog: 'nema_korisnika' });
    const p = await izdaj(testEnv, { email, korisnikId: id }, ADMIN);
    expect(await provjeri(testEnv, p.token)).toMatchObject({ korisnikId: id, tenantId: null, uloga: null, ime: 'Ana' });
    const r = await iskoristi(testEnv, p.token, kljuc('novi-' + email));
    expect(r?.korisnikId).toBe(id);
    expect((await kljuceviOd(email)).map((k) => k.id).sort()).toEqual(['novi-' + email, stari].sort());
    expect(await clanstva(email)).toEqual([]);

    const q = await izdaj(testEnv, { email, korisnikId: id }, ADMIN);
    await db.prepare('UPDATE korisnik SET aktivan = 0 WHERE id = ?').bind(id).run();
    expect(await iskoristi(testEnv, q.token, kljuc())).toBeNull();
    await expect(izdaj(testEnv, { email, korisnikId: id }, ADMIN)).rejects.toMatchObject({ razlog: 'neaktivan' });
  });

  it('korisnik s 5 ključeva ne može potrošiti pozivnicu (ništa ne nastaje)', async () => {
    const t = await tenant();
    const email = noviEmail();
    const id = await korisnik(email);
    for (let i = 0; i < MAX_PASSKEYS_PO_KORISNIKU; i++) await upisiKljuc(id);
    const p = await izdaj(testEnv, { email, tenantId: t, uloga: 'operater' }, ADMIN);
    expect(await provjeri(testEnv, p.token)).toBeNull();
    expect(await iskoristi(testEnv, p.token, kljuc())).toBeNull();
    expect(await kljuceviOd(email)).toHaveLength(MAX_PASSKEYS_PO_KORISNIKU);
    expect(await clanstva(email)).toEqual([]);
  });
});
