// Server-rendered admin (/admin) — Basic Auth. Upravljanje tenantima i njihovim
// fiskalnim kontekstom (prostori, uređaji, operateri, API ključevi, certifikati).

import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import type { Env } from '../types';
import {
  createApiKljuc,
  createCertifikat,
  createNaplatniUredaj,
  createOperater,
  createPoslovniProstor,
  createTenant,
  getTenant,
  listApiKljucevi,
  listCertifikati,
  listNaplatniUredjaji,
  listOperateri,
  listPoslovniProstori,
  listRacuni,
  listTenants,
  setApiKljucAktivan,
} from '../db';
import { ENC_KEY_ID, enkriptirajCertifikat } from '../kripto';
import { hex, normalizirajTekst, validanOib } from '../util';
import { renderRacuniPage, renderTenantDetaljPage, renderTenantiPage } from './views';

export const admin = new Hono<{ Bindings: Env }>();

// Basic Auth gate na cijelo /admin stablo. Bez postavljenih secreta → 503 (safe default).
admin.use('*', async (c, next) => {
  if (!c.env.ADMIN_USER || !c.env.ADMIN_PASS) {
    return c.text('Admin nije konfiguriran (postavi ADMIN_USER + ADMIN_PASS secrete).', 503);
  }
  const mw = basicAuth({
    username: c.env.ADMIN_USER,
    password: c.env.ADMIN_PASS,
    realm: 'DOMOVINA Fiskal admin',
  });
  return mw(c, next);
});

admin.get('/', async (c) => c.html(renderTenantiPage(await listTenants(c.env.DB))));

admin.post('/tenanti', async (c) => {
  const form = await c.req.parseBody();
  const oib = String(form.oib ?? '').trim();
  const naziv = normalizirajTekst(String(form.naziv ?? ''));
  if (!naziv || !validanOib(oib)) {
    return c.html(
      renderTenantiPage(
        await listTenants(c.env.DB),
        !naziv ? 'Naziv je obavezan.' : `OIB '${oib}' nije valjan (kontrolna znamenka).`,
      ),
      400,
    );
  }
  try {
    const t = await createTenant(c.env.DB, {
      oib,
      naziv,
      adrUlica: String(form.ulica ?? '').trim() || null,
      adrMjesto: String(form.mjesto ?? '').trim() || null,
      adrPostanskiBroj: String(form.postanski_broj ?? '').trim() || null,
      iban: String(form.iban ?? '').trim() || null,
      uSustavuPdv: String(form.u_sustavu_pdv ?? '1') === '1',
      oznakaSlijednosti: String(form.oznaka_slijednosti ?? 'P') === 'N' ? 'N' : 'P',
    });
    return c.redirect(`/admin/tenant/${t.id}`, 303);
  } catch (e) {
    const poruka = String(e).includes('UNIQUE') ? `Tenant s OIB-om ${oib} već postoji.` : `Greška: ${e}`;
    return c.html(renderTenantiPage(await listTenants(c.env.DB), poruka), 400);
  }
});

// Detalj tenanta — zajednički loader za GET i re-render nakon POST akcija.
async function detaljData(c: { env: Env }, tenantId: number) {
  const tenant = await getTenant(c.env.DB, tenantId);
  if (!tenant) return null;
  const [prostori, uredjaji, operateri, kljucevi, certifikati, racuni] = await Promise.all([
    listPoslovniProstori(c.env.DB, tenantId),
    listNaplatniUredjaji(c.env.DB, tenantId),
    listOperateri(c.env.DB, tenantId),
    listApiKljucevi(c.env.DB, tenantId),
    listCertifikati(c.env.DB, tenantId),
    listRacuni(c.env.DB, { tenantId, limit: 20 }),
  ]);
  return { tenant, prostori, uredjaji, operateri, kljucevi, certifikati, racuni };
}

admin.get('/tenant/:id', async (c) => {
  const d = await detaljData(c, Number(c.req.param('id')));
  if (!d) return c.text('Tenant ne postoji', 404);
  return c.html(renderTenantDetaljPage(d));
});

admin.post('/tenant/:id/prostori', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  const form = await c.req.parseBody();
  const oznaka = normalizirajTekst(String(form.oznaka ?? ''));
  const datum = String(form.datum_pocetka ?? '').trim();
  if (!oznaka || !datum) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Oznaka i datum početka primjene su obavezni.' }), 400);
  }
  try {
    await createPoslovniProstor(c.env.DB, tenantId, {
      oznaka,
      adrUlica: String(form.ulica ?? '').trim() || null,
      adrNaselje: String(form.naselje ?? '').trim() || null,
      datumPocetkaPrimjene: datum,
    });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    const poruka = String(e).includes('UNIQUE') ? `Prostor '${oznaka}' već postoji.` : `Greška: ${e}`;
    return c.html(renderTenantDetaljPage({ ...d, greska: poruka }), 400);
  }
});

admin.post('/tenant/:id/uredjaji', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  const form = await c.req.parseBody();
  const ppId = Number(form.poslovni_prostor_id ?? 0);
  const oznaka = normalizirajTekst(String(form.oznaka ?? ''));
  // PP mora pripadati OVOM tenantu (ne vjeruj form inputu).
  if (!oznaka || !d.prostori.some((p) => p.id === ppId)) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Odaberi valjan poslovni prostor i upiši oznaku uređaja.' }), 400);
  }
  try {
    await createNaplatniUredaj(c.env.DB, ppId, { oznaka, opis: String(form.opis ?? '').trim() || null });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    const poruka = String(e).includes('UNIQUE') ? `Uređaj '${oznaka}' već postoji u tom prostoru.` : `Greška: ${e}`;
    return c.html(renderTenantDetaljPage({ ...d, greska: poruka }), 400);
  }
});

admin.post('/tenant/:id/operateri', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  const form = await c.req.parseBody();
  const oib = String(form.oib ?? '').trim();
  if (!validanOib(oib)) {
    return c.html(renderTenantDetaljPage({ ...d, greska: `OIB operatera '${oib}' nije valjan.` }), 400);
  }
  try {
    await createOperater(c.env.DB, tenantId, { oibOperatera: oib, ime: normalizirajTekst(String(form.ime ?? '')) || null });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    const poruka = String(e).includes('UNIQUE') ? `Operater ${oib} već postoji.` : `Greška: ${e}`;
    return c.html(renderTenantDetaljPage({ ...d, greska: poruka }), 400);
  }
});

// Kreiraj API ključ → re-renderaj detalj sa sirovim ključem prikazanim JEDNOM.
admin.post('/tenant/:id/kljucevi', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const form = await c.req.parseBody();
  const opis = normalizirajTekst(String(form.opis ?? '')) || null;
  const { rawKey } = await createApiKljuc(c.env.DB, tenantId, opis);
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  return c.html(renderTenantDetaljPage({ ...d, noviKljuc: { rawKey, opis } }));
});

admin.post('/tenant/:id/kljucevi/:kid/:akcija', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const kid = Number(c.req.param('kid'));
  const akcija = c.req.param('akcija');
  if (akcija !== 'aktiviraj' && akcija !== 'deaktiviraj') return c.text(`Nepoznata akcija: ${akcija}`, 400);
  await setApiKljucAktivan(c.env.DB, tenantId, kid, akcija === 'aktiviraj');
  return c.redirect(`/admin/tenant/${tenantId}`, 303);
});

// Upload certifikata — SAMO sprema enkriptirano (envelope AES-256-GCM);
// koristi se tek od faze 2. Plaintext P12 živi isključivo u memoriji zahtjeva.
admin.post('/tenant/:id/certifikati', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  if (!c.env.ENC_MASTER_KEY) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'ENC_MASTER_KEY secret nije postavljen — upload certifikata nije moguć.' }), 503);
  }
  const form = await c.req.parseBody();
  const datoteka = form.p12;
  const okolina = String(form.okolina ?? 'test') === 'prod' ? 'prod' : 'test';
  if (!(datoteka instanceof File) || datoteka.size === 0) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Odaberi P12/PFX datoteku.' }), 400);
  }
  if (datoteka.size > 64 * 1024) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Datoteka je prevelika za certifikat (limit 64 KB).' }), 400);
  }
  try {
    const p12 = await datoteka.arrayBuffer();
    const otisak = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', p12)));
    const enc = await enkriptirajCertifikat(c.env.ENC_MASTER_KEY, p12);
    await createCertifikat(c.env.DB, tenantId, {
      okolina,
      pkcs12Encrypted: enc.pkcs12Encrypted,
      encKeyId: ENC_KEY_ID,
      encIv: enc.encIv,
      dekWrapped: enc.dekWrapped,
      dekIv: enc.dekIv,
      fingerprintSha256: otisak,
    });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    return c.html(renderTenantDetaljPage({ ...d, greska: `Enkripcija/spremanje nije uspjelo: ${e}` }), 500);
  }
});

// Globalni popis računa (svi tenanti).
admin.get('/racuni', async (c) => {
  const racuni = await listRacuni(c.env.DB, { limit: 100 });
  return c.html(renderRacuniPage(racuni));
});
