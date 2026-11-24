// Korisnički endpointi (dashboard: moji-tenanti, ja) i self-service postavke
// (prostori / uređaji / operateri).

import { Hono } from 'hono';
import {
  createNaplatniUredaj,
  createOperater,
  createPoslovniProstor,
  getPoslovniProstorByOznaka,
  listMojiTenantiPoEmailu,
  listNaplatniUredjaji,
  listOperateri,
  listPoslovniProstori,
  jeUniqueGreska,
} from '../db';
import { normalizirajTekst, validanOib } from '../util';
import { getTenantBackup, obrisiTenantBackup, spremiTenantBackup, validirajUnos, type TenantBackupRow } from '../backup/tenant';
import { getTenantEmail, obrisiTenantEmail, spremiTenantEmail, validirajUnosEmaila, type TenantEmailRow } from '../email-tenant';
import { jsonTijelo } from './pomocno';
import type { ApiHono, ApiKontekst } from './tipovi';

export const postavkeRute = new Hono<ApiHono>();

// ── Korisnički endpointi (dashboard) ──

// Membershipi prijavljenog korisnika — puni dropdown za tenant-switch.
// Članstvo po e-mailu korisnika (odluka 6).
async function mojiTenanti(c: ApiKontekst) {
  return listMojiTenantiPoEmailu(c.env.DB, c.get('korisnik')!.email);
}
const SAMO_KORISNIK = { greska: 'Endpoint je dostupan samo uz prijavu u dashboard (passkey), ne uz API ključ' } as const;

postavkeRute.get('/moji-tenanti', async (c) => {
  if (!c.get('korisnik')) return c.json(SAMO_KORISNIK, 400);
  return c.json({ tenanti: await mojiTenanti(c) });
});

// Profil + membershipi (bootstrap frontenda).
postavkeRute.get('/ja', async (c) => {
  const k = c.get('korisnik');
  if (!k) return c.json(SAMO_KORISNIK, 400);
  return c.json({
    email: k.email,
    ime: k.ime,
    korisnikId: k.korisnikId,
    prijava: { metoda: k.metoda, od: k.sesijaOd, do: k.sesijaDo },
    tenanti: await mojiTenanti(c),
  });
});

// ── Postavke (prostori / uređaji / operateri) — self-service za dashboard ──
// Uloge (v1, minimalno): vlasnik/knjigovodja = puni pristup; operater smije
// izdavati/fiskalizirati, ali NE mijenjati postavke. Mašinski dfk_ ključ
// (bez korisnika) je tenant-scoped puni pristup — bez dodatnih ograničenja.

function operaterBezPostavki(c: ApiKontekst): boolean {
  return c.get('korisnik')?.uloga === 'operater';
}

postavkeRute.get('/postavke', async (c) => {
  const tenant = c.get('tenant');
  const [prostori, uredjaji, operateri] = await Promise.all([
    listPoslovniProstori(c.env.DB, tenant.id),
    listNaplatniUredjaji(c.env.DB, tenant.id),
    listOperateri(c.env.DB, tenant.id),
  ]);
  return c.json({
    tenant: { id: tenant.id, oib: tenant.oib, naziv: tenant.naziv, uSustavuPdv: !!tenant.u_sustavu_pdv },
    prostori: prostori.map((p) => ({
      id: p.id, oznaka: p.oznaka, ulica: p.adr_ulica, naselje: p.adr_naselje,
      primjenaOd: p.datum_pocetka_primjene, zatvoren: p.datum_zatvaranja, cisStatus: p.cis_status,
    })),
    uredjaji: uredjaji.map((u) => ({
      id: u.id, prostorOznaka: u.pp_oznaka, oznaka: u.oznaka, opis: u.opis, aktivan: !!u.aktivan,
    })),
    operateri: operateri.map((o) => ({ id: o.id, oib: o.oib_operatera, ime: o.ime, aktivan: !!o.aktivan })),
  });
});

postavkeRute.post('/postavke/prostor', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = await jsonTijelo(c);
  const oznaka = normalizirajTekst(String(body.oznaka ?? ''));
  const primjenaOd = String(body.primjenaOd ?? '').trim();
  if (!oznaka || !/^\d{4}-\d{2}-\d{2}$/.test(primjenaOd)) {
    return c.json({ greska: "Obavezno: 'oznaka' i 'primjenaOd' (YYYY-MM-DD)" }, 400);
  }
  try {
    const p = await createPoslovniProstor(c.env.DB, c.get('tenant').id, {
      oznaka,
      adrUlica: String(body.ulica ?? '').trim() || null,
      adrNaselje: String(body.naselje ?? '').trim() || null,
      datumPocetkaPrimjene: primjenaOd,
    });
    return c.json({ id: p.id, oznaka: p.oznaka }, 201);
  } catch (e) {
    if (jeUniqueGreska(e)) return c.json({ greska: `Prostor '${oznaka}' već postoji` }, 409);
    throw e;
  }
});

postavkeRute.post('/postavke/uredjaj', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = await jsonTijelo(c);
  const prostorOznaka = String(body.prostorOznaka ?? '').trim();
  const oznaka = normalizirajTekst(String(body.oznaka ?? ''));
  if (!prostorOznaka || !oznaka) return c.json({ greska: "Obavezno: 'prostorOznaka' i 'oznaka'" }, 400);
  const pp = await getPoslovniProstorByOznaka(c.env.DB, c.get('tenant').id, prostorOznaka);
  if (!pp) return c.json({ greska: `Poslovni prostor '${prostorOznaka}' ne postoji` }, 404);
  try {
    const u = await createNaplatniUredaj(c.env.DB, pp.id, { oznaka, opis: String(body.opis ?? '').trim() || null });
    return c.json({ id: u.id, oznaka: u.oznaka }, 201);
  } catch (e) {
    if (jeUniqueGreska(e)) return c.json({ greska: `Uređaj '${oznaka}' već postoji u tom prostoru` }, 409);
    throw e;
  }
});

postavkeRute.post('/postavke/operater', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const body = await jsonTijelo(c);
  const oib = String(body.oib ?? '').trim();
  if (!validanOib(oib)) return c.json({ greska: `OIB operatera '${oib}' nije valjan` }, 400);
  try {
    const o = await createOperater(c.env.DB, c.get('tenant').id, {
      oibOperatera: oib,
      ime: normalizirajTekst(String(body.ime ?? '')) || null,
    });
    return c.json({ id: o.id, oib: o.oib_operatera }, 201);
  } catch (e) {
    if (jeUniqueGreska(e)) return c.json({ greska: `Operater ${oib} već postoji` }, 409);
    throw e;
  }
});

// ── BYO backup u tenantov Cloudflare R2 (docs/knowledge/23-backup.md §Razina 2) ──
// Token se nikad ne vraća; GET pokazuje samo odredište i stanje.

function backupJson(b: TenantBackupRow | null) {
  if (!b) return { ukljucen: false };
  return {
    ukljucen: !!b.aktivan,
    cfAccountId: b.cf_account_id,
    bucket: b.bucket,
    jurisdikcija: b.jurisdikcija,
    prefiks: b.prefiks,
    tokenPrefiks: b.token_prefiks,
    sinkroniziranoDo: b.sinkronizirano_do,
    zadnjaSinkronizacija: b.zadnja_sinkronizacija,
    zadnjiSnapshot: b.zadnji_snapshot,
    greska: b.zadnja_greska,
    greskaKada: b.zadnja_greska_ts,
  };
}

postavkeRute.get('/postavke/backup', async (c) => {
  return c.json(backupJson(await getTenantBackup(c.env.DB, c.get('tenant').id)));
});

postavkeRute.put('/postavke/backup', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const v = validirajUnos(await jsonTijelo(c));
  if (!v.ok) return c.json({ greska: v.greska }, 400);
  const tenant = c.get('tenant');
  let kreiran = false;
  try {
    ({ kreiran } = await spremiTenantBackup(c.env, tenant.id, tenant.oib, v.unos));
  } catch (e) {
    return c.json({ greska: `Backup nije spremljen: ${(e as Error).message}` }, 400);
  }
  return c.json({ ...backupJson(await getTenantBackup(c.env.DB, tenant.id)), bucketKreiran: kreiran });
});

postavkeRute.delete('/postavke/backup', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  await obrisiTenantBackup(c.env.DB, c.get('tenant').id);
  return c.json({ ukljucen: false });
});

// ── Vlastiti pošiljatelj e-maila (BYO Resend, src/email-tenant.ts) ──
// Bez njega računi idu s racuni@domovina.ai. Ključ se nikad ne vraća.

function emailJson(e: TenantEmailRow | null) {
  if (!e) return { ukljucen: false, posiljatelj: 'racuni@domovina.ai' };
  return {
    ukljucen: !!e.aktivan,
    posiljatelj: e.posiljatelj_email,
    posiljateljEmail: e.posiljatelj_email,
    posiljateljIme: e.posiljatelj_ime,
    replyTo: e.reply_to,
    tokenPrefiks: e.token_prefiks,
    domenaProvjerena: !!e.domena_provjerena,
    zadnjeSlanje: e.zadnje_slanje,
    greska: e.zadnja_greska,
    greskaKada: e.zadnja_greska_ts,
  };
}

postavkeRute.get('/postavke/email', async (c) => {
  return c.json(emailJson(await getTenantEmail(c.env.DB, c.get('tenant').id)));
});

// Body: { posiljateljEmail, posiljateljIme?, replyTo?, apiKey? } — apiKey smije izostati
// kad je ključ već spremljen (promjena samo adrese ili imena).
postavkeRute.put('/postavke/email', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  const v = validirajUnosEmaila(await jsonTijelo(c));
  if (!v.ok) return c.json({ greska: v.greska }, 400);
  const tenant = c.get('tenant');
  try {
    await spremiTenantEmail(c.env, tenant.id, v.unos);
  } catch (e) {
    return c.json({ greska: `Pošiljatelj nije spremljen: ${(e as Error).message}` }, 400);
  }
  return c.json(emailJson(await getTenantEmail(c.env.DB, tenant.id)));
});

postavkeRute.delete('/postavke/email', async (c) => {
  if (operaterBezPostavki(c)) return c.json({ greska: 'Uloga operater ne smije mijenjati postavke' }, 403);
  await obrisiTenantEmail(c.env.DB, c.get('tenant').id);
  return c.json(emailJson(null));
});
