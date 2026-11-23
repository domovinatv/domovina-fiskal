// /admin/korisnici — korisnici customer dashboarda i pozivnice (docs/passkey/, S3, odluke 300+).
// Uzor UX-a: ~/git/logomedo/logomedo.com src/pages/admin/korisnici.astro i docs/admin.md
// („Izdavanje pozivnice”, „Novi passkey”, „Deaktivacija”).
//
// Bez pozivnice nema passkeya, pa ni ulaska: e-mail se više ne dodaje izravno u korisnik_tenant.
// Admin smije sve što vlasnik ne smije (odluka 205): pozvati vlasnika, deaktivirati i aktivirati
// cijelog korisnika (passkeyi ostaju, pa aktivacija vraća pristup bez pozivnice), izdati „Novi
// passkey” i vratiti članstvo u tenantu. Link pozivnice prikazuje se samo u odgovoru na izdavanje.
// Svaka radnja ostavlja zapis u korisnik_aktivnost (migracija 0015, odluka 300).
import { Hono, type Context } from 'hono';
import { naredba, zabiljezi, zadnjaAktivnost, type Tko } from '../app-auth/aktivnost';
import { izdaj, opozovi, otvorenePozivnice, PORUKE_ODBIJANJA, PozivOdbijen, type RazlogOdbijanja } from '../app-auth/pozivnice';
import { listTenants } from '../db';
import type { Env } from '../types';
import type { AdminHono } from './auth/zastita';
import { renderKorisniciPage, type KorisnikPrikaz, type NoviLink } from './views-korisnici';

export const korisniciAdmin = new Hono<AdminHono>();

const ID = '{[1-9][0-9]{0,14}}';
type AdminCtx = Context<AdminHono>;

/** Tko radi: e-mail prijavljenog administratora; bearer skripta nema sesiju. */
export const adminTko = (c: AdminCtx): Tko => ({ email: c.get('sesija')?.email ?? 'skripta', tip: 'admin' });

/** Povratak nakon POST-a: samo vlastite stranice (nikad otvoreni redirect). */
function povratak(v: unknown): string {
  const s = String(v ?? '');
  return /^\/admin\/tenant\/[1-9][0-9]{0,14}$/.test(s) ? s : '/admin/korisnici';
}

const STATUS_ODBIJANJA: Partial<Record<RazlogOdbijanja, 404 | 409>> = { nema_tenanta: 404, nema_korisnika: 404, vec_clan: 409, neaktivan: 409 };

interface KorisnikRed {
  id: number; email: string; ime: string | null; aktivan: number; created_at: string;
  passkeyi: number; zadnja_upotreba: string | null; sesije: number; clanstva: string;
}

export async function listKorisnici(env: Pick<Env, 'DB'>, sada = new Date()): Promise<KorisnikPrikaz[]> {
  const r = await env.DB.prepare(
    `SELECT k.id, k.email, k.ime, k.aktivan, k.created_at,
       (SELECT COUNT(*) FROM korisnik_passkeys kp WHERE kp.korisnik_id = k.id) AS passkeyi,
       (SELECT MAX(kp.last_used_at) FROM korisnik_passkeys kp WHERE kp.korisnik_id = k.id) AS zadnja_upotreba,
       (SELECT COUNT(*) FROM korisnik_sesije s WHERE s.korisnik_id = k.id AND s.expires_at > ?) AS sesije,
       (SELECT json_group_array(json_object('id', kt.id, 'tenantId', kt.tenant_id, 'naziv', t.naziv, 'uloga', kt.uloga, 'aktivan', kt.aktivan))
          FROM korisnik_tenant kt JOIN tenant t ON t.id = kt.tenant_id WHERE lower(kt.user_email) = k.email) AS clanstva
     FROM korisnik k ORDER BY k.aktivan DESC, k.email`,
  ).bind(sada.toISOString()).all<KorisnikRed>();
  return r.results.map((k) => ({
    id: k.id, email: k.email, ime: k.ime, aktivan: k.aktivan === 1, createdAt: k.created_at,
    passkeyi: k.passkeyi, zadnjaUpotreba: k.zadnja_upotreba, sesije: k.sesije,
    clanstva: (JSON.parse(k.clanstva || '[]') as KorisnikPrikaz['clanstva']).map((x) => ({ ...x, aktivan: !!x.aktivan })),
  }));
}

/** Članovi jednog tenanta za detalj tenanta: redak korisnik_tenant + stanje passkey računa. */
export interface ClanTenanta {
  id: number; email: string; uloga: 'vlasnik' | 'knjigovodja' | 'operater'; aktivan: number; created_at: string;
  korisnik_id: number | null; korisnik_aktivan: number | null; passkeyi: number;
}
export async function listClanoviTenanta(env: Pick<Env, 'DB'>, tenantId: number): Promise<ClanTenanta[]> {
  return (await env.DB.prepare(
    `SELECT kt.id, lower(kt.user_email) AS email, kt.uloga, kt.aktivan, kt.created_at,
            k.id AS korisnik_id, k.aktivan AS korisnik_aktivan,
            (SELECT COUNT(*) FROM korisnik_passkeys kp WHERE kp.korisnik_id = k.id) AS passkeyi
     FROM korisnik_tenant kt LEFT JOIN korisnik k ON k.email = lower(kt.user_email)
     WHERE kt.tenant_id = ? ORDER BY kt.id`,
  ).bind(tenantId).all<ClanTenanta>()).results;
}

async function stranica(c: AdminCtx, o: { link?: NoviLink; greska?: string; tenantId?: number } = {}, status: 200 | 400 | 404 | 409 = 200) {
  const [korisnici, pozivnice, tenanti, aktivnost] = await Promise.all([
    listKorisnici(c.env), otvorenePozivnice(c.env), listTenants(c.env.DB), zadnjaAktivnost(c.env, { limit: 50 }),
  ]);
  return c.html(renderKorisniciPage({ korisnici, pozivnice, tenanti, aktivnost, ...o }), status);
}

const linkPozivnice = (c: AdminCtx, token: string) => `${new URL(c.req.url).origin}/app/poziv#${token}`;

korisniciAdmin.get('/korisnici', (c) => {
  const t = Number(c.req.query('tenant'));
  return stranica(c, { tenantId: Number.isSafeInteger(t) && t > 0 ? t : undefined });
});

// Nova pozivnica za tenant (bilo koja uloga). Link se prikazuje samo u ovom odgovoru.
korisniciAdmin.post('/korisnici/pozivnica', async (c) => {
  const form = await c.req.parseBody();
  const tenantId = Number(form.tenant_id);
  const uloga = String(form.uloga ?? '');
  const email = String(form.email ?? '');
  const ime = String(form.ime ?? '').trim() || null;
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) return stranica(c, { greska: 'Odaberi tenant.' }, 400);
  const tko = adminTko(c);
  try {
    const p = await izdaj(c.env, { email, ime, tenantId, uloga }, tko);
    await zabiljezi(c.env, tko, { radnja: 'poziv.izdan', email: p.email, tenantId, pozivnicaId: p.id, detalji: { uloga, vrsta: 'tenant' } });
    return stranica(c, { link: { url: linkPozivnice(c, p.token), email: p.email, istjece: p.istjece, vrsta: 'tenant' }, tenantId });
  } catch (e) {
    if (e instanceof PozivOdbijen) return stranica(c, { greska: PORUKE_ODBIJANJA[e.razlog], tenantId }, STATUS_ODBIJANJA[e.razlog] ?? 400);
    throw e;
  }
});

korisniciAdmin.post(`/korisnici/pozivnica/:pid${ID}/opozovi`, async (c) => {
  const id = Number(c.req.param('pid'));
  const form = await c.req.parseBody();
  const p = await c.env.DB.prepare('SELECT id, email, tenant_id, korisnik_id FROM pozivnice WHERE id = ?')
    .bind(id).first<{ id: number; email: string; tenant_id: number | null; korisnik_id: number | null }>();
  if (!p || !(await opozovi(c.env, id))) return stranica(c, { greska: 'Nema te otvorene pozivnice.' }, 404);
  await zabiljezi(c.env, adminTko(c), {
    radnja: 'poziv.opozvan', email: p.email, tenantId: p.tenant_id, korisnikId: p.korisnik_id, pozivnicaId: p.id,
  });
  return c.redirect(povratak(form.povratak), 303);
});

// Novi passkey (izgubljen ili novi uređaj): pozivnica za isti račun, stari ključevi ostaju.
// Samo aktivnom korisniku; deaktiviranog vraća „Aktiviraj”.
korisniciAdmin.post(`/korisnici/:kid${ID}/novi-passkey`, async (c) => {
  const kid = Number(c.req.param('kid'));
  const k = await c.env.DB.prepare('SELECT id, email FROM korisnik WHERE id = ?').bind(kid).first<{ id: number; email: string }>();
  if (!k) return stranica(c, { greska: PORUKE_ODBIJANJA.nema_korisnika }, 404);
  const tko = adminTko(c);
  try {
    const p = await izdaj(c.env, { email: k.email, korisnikId: k.id }, tko);
    await zabiljezi(c.env, tko, { radnja: 'poziv.izdan', email: p.email, korisnikId: k.id, pozivnicaId: p.id, detalji: { vrsta: 'novi_passkey' } });
    return stranica(c, { link: { url: linkPozivnice(c, p.token), email: p.email, istjece: p.istjece, vrsta: 'novi_passkey' } });
  } catch (e) {
    if (e instanceof PozivOdbijen) return stranica(c, { greska: PORUKE_ODBIJANJA[e.razlog] }, STATUS_ODBIJANJA[e.razlog] ?? 400);
    throw e;
  }
});

// Deaktivacija korisnika: aktivan = 0, sve sesije obrisane, otvorene pozivnice tog e-maila
// opozvane (svi tenanti). Passkeyi i članstva ostaju, pa „Aktiviraj” vraća pristup bez pozivnice.
// Radnja nad već deaktiviranim (ili aktivacija aktivnog) ne radi ništa i ne ostavlja zapis.
korisniciAdmin.post(`/korisnici/:kid${ID}/:akcija{deaktiviraj|aktiviraj}`, async (c) => {
  const kid = Number(c.req.param('kid'));
  const ukljuci = c.req.param('akcija') === 'aktiviraj';
  const db = c.env.DB;
  const k = await db.prepare('SELECT id, email, aktivan FROM korisnik WHERE id = ?').bind(kid).first<{ id: number; email: string; aktivan: number }>();
  if (!k) return stranica(c, { greska: PORUKE_ODBIJANJA.nema_korisnika }, 404);
  const tko = adminTko(c);
  if (ukljuci && k.aktivan === 0) {
    await db.batch([
      db.prepare('UPDATE korisnik SET aktivan = 1 WHERE id = ? AND aktivan = 0').bind(kid),
      naredba(db, tko, { radnja: 'korisnik.aktiviran', email: k.email, korisnikId: kid }),
    ]);
  } else if (!ukljuci && k.aktivan === 1) {
    const at = new Date().toISOString();
    const [sesije, pozivnice] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM korisnik_sesije WHERE korisnik_id = ?').bind(kid).first<{ n: number }>(),
      db.prepare('SELECT COUNT(*) AS n FROM pozivnice WHERE email = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL AND istjece > ?')
        .bind(k.email, at).first<{ n: number }>(),
    ]);
    await db.batch([
      db.prepare('UPDATE korisnik SET aktivan = 0 WHERE id = ? AND aktivan = 1').bind(kid),
      db.prepare('DELETE FROM korisnik_sesije WHERE korisnik_id = ?').bind(kid),
      db.prepare('UPDATE pozivnice SET opozvana_at = ? WHERE email = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL').bind(at, k.email),
      naredba(db, tko, {
        radnja: 'korisnik.deaktiviran', email: k.email, korisnikId: kid,
        detalji: { sesijaObrisano: sesije?.n ?? 0, pozivnicaOpozvano: pozivnice?.n ?? 0 },
      }),
    ]);
  }
  return c.redirect('/admin/korisnici', 303);
});

/**
 * Članstvo u tenantu (korisnik_tenant.aktivan), s detalja tenanta. Admin smije i vlasnika i
 * vraćanje bez pozivnice (odluka 205). Deaktivacija opoziva i otvorene pozivnice tog e-maila u
 * tenantu, kao kod vlasnika (/api/v1/clanovi).
 */
export async function postaviClanstvo(c: AdminCtx, tenantId: number, id: number, ukljuci: boolean): Promise<void> {
  const db = c.env.DB;
  const kt = await db.prepare('SELECT id, lower(user_email) AS email, uloga, aktivan FROM korisnik_tenant WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first<{ id: number; email: string; uloga: string; aktivan: number }>();
  if (!kt || kt.aktivan === (ukljuci ? 1 : 0)) return;
  const zapis = naredba(db, adminTko(c), {
    radnja: ukljuci ? 'clanstvo.aktivirano' : 'clanstvo.deaktivirano', email: kt.email, tenantId, detalji: { uloga: kt.uloga, clanstvoId: kt.id },
  });
  const promjena = db.prepare('UPDATE korisnik_tenant SET aktivan = ? WHERE id = ? AND tenant_id = ?').bind(ukljuci ? 1 : 0, id, tenantId);
  await db.batch(ukljuci ? [promjena, zapis] : [
    promjena,
    db.prepare('UPDATE pozivnice SET opozvana_at = ? WHERE tenant_id = ? AND email = ? AND iskoristena_at IS NULL AND opozvana_at IS NULL')
      .bind(new Date().toISOString(), tenantId, kt.email),
    zapis,
  ]);
}
