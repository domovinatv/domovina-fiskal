// Članovi tenanta u dashboardu — samo `vlasnik` tog tenanta (docs/passkey/, odluke 4 i 200+).
// Vlasnik vidi članove i otvorene pozivnice, poziva knjigovođu ili operatera, opoziva
// pozivnicu i deaktivira knjigovođu ili operatera u svom tenantu. Vlasnike (i sebe) ne dira:
// to ide kroz administratora (/admin, S3). Mašinski dfk_ ključ nema korisnika, pa ovdje 403.

import { Hono } from 'hono';
import { naredba, zabiljezi, type Tko } from '../app-auth/aktivnost';
import { izdaj, opozovi, otvorenePozivnice, PORUKE_ODBIJANJA, PozivOdbijen, type RazlogOdbijanja } from '../app-auth/pozivnice';
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

// Link se vraća samo ovdje, jednom; šalje ga vlasnik sam (Worker ne šalje mail, odluka 7).
clanoviRute.post('/clanovi/pozivnica', async (c) => {
  const body = await jsonTijelo(c);
  const uloga = String(body.uloga ?? '');
  if (uloga !== 'knjigovodja' && uloga !== 'operater') {
    return c.json({ greska: PORUKE_ODBIJANJA.uloga }, uloga === 'vlasnik' ? 403 : 400);
  }
  try {
    const p = await izdaj(
      c.env,
      { email: String(body.email ?? ''), ime: typeof body.ime === 'string' ? body.ime : null, tenantId: c.get('tenant').id, uloga },
      vlasnik(c),
    );
    await zabiljezi(c.env, vlasnik(c), { radnja: 'poziv.izdan', email: p.email, tenantId: c.get('tenant').id, pozivnicaId: p.id, detalji: { uloga, vrsta: 'tenant' } });
    return c.json({ id: p.id, email: p.email, istjece: p.istjece, link: `${new URL(c.req.url).origin}/app/poziv#${p.token}` }, 201);
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
