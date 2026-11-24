// Članovi tenanta u dashboardu — samo `vlasnik` tog tenanta (docs/passkey/, odluke 4 i 200+).
// Vlasnik vidi članove i otvorene pozivnice, poziva knjigovođu ili operatera (pozivnica odmah
// ide e-mailom, link se uz to vrati jednom kao rezerva), šalje je ponovno, opoziva
// pozivnicu i deaktivira knjigovođu ili operatera u svom tenantu. Vlasnike (i sebe) ne dira:
// to ide kroz administratora (/admin, S3). Mašinski dfk_ ključ nema korisnika, pa ovdje 403.

import { Hono } from 'hono';
import { naredba, zabiljezi, type Tko } from '../app-auth/aktivnost';
import { posaljiPozivnicu } from '../app-auth/pozivnica-email';
import { izdaj, opozovi, otvorenePozivnice, ponovnoIzdaj, PORUKE_ODBIJANJA, PozivOdbijen, type RazlogOdbijanja } from '../app-auth/pozivnice';
import { idIzParametra, jsonTijelo } from './pomocno';
import type { ApiHono, ApiKontekst } from './tipovi';

export const clanoviRute = new Hono<ApiHono>();

clanoviRute.use('/clanovi', samoVlasnik);
clanoviRute.use('/clanovi/*', samoVlasnik);

async function samoVlasnik(c: ApiKontekst, next: () => Promise<void>) {
  if (c.get('korisnik')?.uloga !== 'vlasnik') return c.json({ greska: 'Članovima upravlja samo vlasnik tenanta' }, 403);
  return next();
}

const vlasnik = (c: ApiKontekst): Tko => ({ email: c.get('korisnik')!.email, tip: 'vlasnik' });

const STATUS_ODBIJANJA: Partial<Record<RazlogOdbijanja, 403 | 409>> = { uloga: 403, vec_clan: 409, neaktivan: 409 };

clanoviRute.get('/clanovi', async (c) => {
  const tenantId = c.get('tenant').id;
  const ja = c.get('korisnik')!.email.toLowerCase();
  const clanovi = (await c.env.DB.prepare(
    `SELECT kt.id, lower(kt.user_email) AS email, kt.uloga, kt.aktivan, k.ime, k.aktivan AS korisnik_aktivan,
            (SELECT COUNT(*) FROM korisnik_passkeys kp WHERE kp.korisnik_id = k.id) AS passkeyi
     FROM korisnik_tenant kt LEFT JOIN korisnik k ON k.email = lower(kt.user_email)
     WHERE kt.tenant_id = ? ORDER BY kt.id`,
  ).bind(tenantId).all<{
    id: number; email: string; uloga: string; aktivan: number; ime: string | null; korisnik_aktivan: number | null; passkeyi: number;
  }>()).results;
  const pozivnice = await otvorenePozivnice(c.env, { tenantId });
  return c.json({
    clanovi: clanovi.map((r) => ({
      id: r.id, email: r.email, ime: r.ime, uloga: r.uloga, aktivan: !!r.aktivan,
      imaPasskey: r.passkeyi > 0, korisnikAktivan: r.korisnik_aktivan == null ? null : !!r.korisnik_aktivan, ja: r.email === ja,
    })),
    // Tko je izdao: samo vrsta (admin/vlasnik), ne e-mail administratora.
    pozivnice: pozivnice.map((p) => ({
      id: p.id, email: p.email, ime: p.ime, uloga: p.uloga, stvorioTip: p.stvorio_tip, stvorena: p.created_at, istjece: p.istjece,
    })),
  });
});

/** Pošalji izdanu pozivnicu mailom, zabilježi izdavanje i složi odgovor (link samo ovdje, jednom). */
async function posaljiIOdgovori(
  c: ApiKontekst,
  p: { token: string; id: number; email: string; istjece: string },
  o: { ime: string | null; uloga: 'knjigovodja' | 'operater'; zamjenjuje?: number },
) {
  const tenantId = c.get('tenant').id;
  const link = `${new URL(c.req.url).origin}/app/poziv#${p.token}`;
  const slanje = await posaljiPozivnicu(c.env, { email: p.email, ime: o.ime, link, istjece: p.istjece, tenantId, uloga: o.uloga, stvorio: vlasnik(c) });
  await zabiljezi(c.env, vlasnik(c), {
    radnja: 'poziv.izdan', email: p.email, tenantId, pozivnicaId: p.id,
    detalji: {
      uloga: o.uloga, vrsta: 'tenant', ...(o.zamjenjuje ? { zamjenjuje: o.zamjenjuje } : {}),
      poslano: slanje.poslano, ...(slanje.kanal ? { kanal: slanje.kanal } : {}),
    },
  });
  return c.json({ id: p.id, email: p.email, istjece: p.istjece, link, poslano: slanje.poslano, emailGreska: slanje.greska }, 201);
}

// Pozivnica odmah ide e-mailom (pošiljateljem tenanta ako ga ima); link se vraća samo ovdje,
// jednom, da ga vlasnik pošalje sam ako mail ne prođe (`poslano: false`, `emailGreska`).
clanoviRute.post('/clanovi/pozivnica', async (c) => {
  const body = await jsonTijelo(c);
  const uloga = String(body.uloga ?? '');
  if (uloga !== 'knjigovodja' && uloga !== 'operater') {
    return c.json({ greska: PORUKE_ODBIJANJA.uloga }, uloga === 'vlasnik' ? 403 : 400);
  }
  const ime = typeof body.ime === 'string' ? body.ime : null;
  try {
    const p = await izdaj(c.env, { email: String(body.email ?? ''), ime, tenantId: c.get('tenant').id, uloga }, vlasnik(c));
    return posaljiIOdgovori(c, p, { ime, uloga });
  } catch (e) {
    if (e instanceof PozivOdbijen) return c.json({ greska: PORUKE_ODBIJANJA[e.razlog], razlog: e.razlog }, STATUS_ODBIJANJA[e.razlog] ?? 400);
    throw e;
  }
});

// Pošalji ponovno: nova pozivnica istih podataka (stari link prestaje vrijediti) i odmah mailom.
clanoviRute.post('/clanovi/pozivnica/:id/posalji-ponovno', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  try {
    const p = await ponovnoIzdaj(c.env, id, vlasnik(c), { tenantId: c.get('tenant').id });
    if (!p) return c.json({ greska: 'Nema te otvorene pozivnice u ovom tenantu' }, 404);
    // Vlasnik ne smije pozvati vlasnika: `izdaj` to već odbija (uloga), pa je ovdje samo knjigovođa ili operater.
    return posaljiIOdgovori(c, p, { ime: p.stara.ime, uloga: p.stara.uloga as 'knjigovodja' | 'operater', zamjenjuje: p.stara.id });
  } catch (e) {
    if (e instanceof PozivOdbijen) return c.json({ greska: PORUKE_ODBIJANJA[e.razlog], razlog: e.razlog }, STATUS_ODBIJANJA[e.razlog] ?? 400);
    throw e;
  }
});

clanoviRute.post('/clanovi/pozivnica/:id/opozovi', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  const tenantId = c.get('tenant').id;
  if (!(await opozovi(c.env, id, { tenantId }))) {
    return c.json({ greska: 'Nema te otvorene pozivnice u ovom tenantu' }, 404);
  }
  const p = await c.env.DB.prepare('SELECT email FROM pozivnice WHERE id = ?').bind(id).first<{ email: string }>();
  await zabiljezi(c.env, vlasnik(c), { radnja: 'poziv.opozvan', email: p?.email ?? null, tenantId, pozivnicaId: id });
  return c.json({ ok: true });
});

// Deaktivacija člana: korisnik_tenant.aktivan = 0 (pristup tenantu prestaje sljedećim
// zahtjevom, jer auth provjerava članstvo svaki put) i opoziv njegovih otvorenih pozivnica
// za ovaj tenant. Ostali tenanti tog korisnika i njegove sesije ostaju. Ponovni ulazak:
// nova pozivnica.
clanoviRute.post('/clanovi/:id/deaktiviraj', async (c) => {
  const id = idIzParametra(c);
  if (id instanceof Response) return id;
  const tenantId = c.get('tenant').id;
  const clan = await c.env.DB.prepare('SELECT id, lower(user_email) AS email, uloga, aktivan FROM korisnik_tenant WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first<{ id: number; email: string; uloga: string; aktivan: number }>();
  if (!clan) return c.json({ greska: 'Nema tog člana u ovom tenantu' }, 404);
  if (clan.email === c.get('korisnik')!.email.toLowerCase()) return c.json({ greska: 'Ne možeš deaktivirati sebe' }, 409);
  if (clan.uloga === 'vlasnik') return c.json({ greska: 'Vlasnika deaktivira samo administrator' }, 403);
  const sada = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE korisnik_tenant SET aktivan = 0 WHERE id = ? AND tenant_id = ? AND uloga <> 'vlasnik'`).bind(id, tenantId),
    c.env.DB.prepare(
      `UPDATE pozivnice SET opozvana_at = ? WHERE tenant_id = ? AND email = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL`,
    ).bind(sada, tenantId, clan.email),
    ...(clan.aktivan
      ? [naredba(c.env.DB, vlasnik(c), { radnja: 'clanstvo.deaktivirano', email: clan.email, tenantId, detalji: { uloga: clan.uloga, clanstvoId: clan.id } })]
      : []),
  ]);
  return c.json({ ok: true, vecNeaktivan: !clan.aktivan });
});
