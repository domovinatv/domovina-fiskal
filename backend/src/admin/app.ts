// Server-rendered admin (/admin) — Basic Auth. Upravljanje tenantima i njihovim
// fiskalnim kontekstom (prostori, uređaji, operateri, API ključevi, certifikati).

import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import type { Env } from '../types';
import {
  createApiKljuc,
  createCertifikat,
  createNaplatniUredaj,
  createKorisnikTenant,
  createOperater,
  createPoslovniProstor,
  createProizvod,
  createTenant,
  getKpd,
  getRacunKontekst,
  getTenant,
  izdajSkicu,
  listApiKljucevi,
  listCertifikati,
  listKorisniciTenanta,
  listNaplatniUredjaji,
  listOperateri,
  listPoslovniProstori,
  listProizvodi,
  listRacuni,
  listTenants,
  searchKpd,
  setApiKljucAktivan,
  setKorisnikTenantAktivan,
  setProstorCisStatus,
  zabiljeziSlanjeEmaila,
} from '../db';
import { cisEcho, fiskalizirajRacun, okolinaIzEnv } from '../fiskal/fiskalizacija';
import { parsirajP12 } from '../fiskal/certifikat';
import { emailKonfiguriran, posaljiRacunEmailom } from '../email';
import { kreirajDokument } from '../api/racuni';
import { generirajRacunPdf } from '../pdf/racun-pdf';
import { ENC_KEY_ID, enkriptirajCertifikat } from '../kripto';
import { godinaZagreb, hex, normalizirajTekst, validanOib } from '../util';
import { formatirajGreske, racunModelShema } from '../validacija';
import {
  renderNoviDokumentPage,
  renderRacunDetaljPage,
  renderRacuniPage,
  renderTenantDetaljPage,
  renderTenantiPage,
} from './views';

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
  const [prostori, uredjaji, operateri, kljucevi, certifikati, proizvodi, racuni, korisnici] = await Promise.all([
    listPoslovniProstori(c.env.DB, tenantId),
    listNaplatniUredjaji(c.env.DB, tenantId),
    listOperateri(c.env.DB, tenantId),
    listApiKljucevi(c.env.DB, tenantId),
    listCertifikati(c.env.DB, tenantId),
    listProizvodi(c.env.DB, tenantId),
    listRacuni(c.env.DB, { tenantId, limit: 20 }),
    listKorisniciTenanta(c.env.DB, tenantId),
  ]);
  return { tenant, prostori, uredjaji, operateri, kljucevi, certifikati, proizvodi, racuni, korisnici };
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

// ── Dashboard pristup (korisnik_tenant) — superuser dodaje po EMAILU ──
// Identitet je u GoTrue-u; user_id (sub) se veže sam na prvoj prijavi korisnika.

admin.post('/tenant/:id/korisnici', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  const form = await c.req.parseBody();
  const email = String(form.email ?? '').trim().toLowerCase();
  const uloga = ['vlasnik', 'knjigovodja', 'operater'].includes(String(form.uloga))
    ? (String(form.uloga) as 'vlasnik' | 'knjigovodja' | 'operater')
    : 'vlasnik';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.html(renderTenantDetaljPage({ ...d, greska: `E-mail '${email}' nije valjan.` }), 400);
  }
  try {
    await createKorisnikTenant(c.env.DB, tenantId, { userEmail: email, uloga });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    const poruka = String(e).includes('UNIQUE') ? `Korisnik ${email} već ima pristup ovom tenantu.` : `Greška: ${e}`;
    return c.html(renderTenantDetaljPage({ ...d, greska: poruka }), 400);
  }
});

admin.post('/tenant/:id/korisnici/:kid/:akcija', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const kid = Number(c.req.param('kid'));
  const akcija = c.req.param('akcija');
  if (akcija !== 'aktiviraj' && akcija !== 'deaktiviraj') return c.text(`Nepoznata akcija: ${akcija}`, 400);
  await setKorisnikTenantAktivan(c.env.DB, tenantId, kid, akcija === 'aktiviraj');
  return c.redirect(`/admin/tenant/${tenantId}`, 303);
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

// Upload certifikata (faza 2): P12 + LOZINKA se parsiraju u memoriji zahtjeva
// (node-forge) → privatni ključ (PKCS8) enkriptiran at-rest, cert PEM plaintext.
// Lozinka se NE sprema; plaintext ključ nikad ne napušta memoriju zahtjeva.
admin.post('/tenant/:id/certifikati', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  if (!c.env.ENC_MASTER_KEY) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'ENC_MASTER_KEY secret nije postavljen — upload certifikata nije moguć.' }), 503);
  }
  const form = await c.req.parseBody();
  const datoteka = form.p12;
  const lozinka = String(form.lozinka ?? '');
  const okolina = String(form.okolina ?? 'test') === 'prod' ? 'prod' : 'test';
  if (!(datoteka instanceof File) || datoteka.size === 0) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Odaberi P12/PFX datoteku.' }), 400);
  }
  if (datoteka.size > 64 * 1024) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Datoteka je prevelika za certifikat (limit 64 KB).' }), 400);
  }
  if (!lozinka) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Lozinka P12 kontejnera je obavezna (potrebna za izvlačenje ključa za potpisivanje).' }), 400);
  }
  try {
    const p12 = await datoteka.arrayBuffer();
    const parsirano = parsirajP12(p12, lozinka);
    if (parsirano.oib && parsirano.oib !== d.tenant.oib) {
      return c.html(
        renderTenantDetaljPage({ ...d, greska: `OIB u certifikatu (${parsirano.oib}) ne odgovara OIB-u tenanta (${d.tenant.oib}) — CIS bi odbio poruke (s005).` }),
        400,
      );
    }
    const otisak = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', p12)));
    const enc = await enkriptirajCertifikat(c.env.ENC_MASTER_KEY, p12, parsirano.privatniKljucPem);
    await createCertifikat(c.env.DB, tenantId, {
      okolina,
      pkcs12Encrypted: enc.pkcs12Encrypted,
      encKeyId: ENC_KEY_ID,
      encIv: enc.encIv,
      dekWrapped: enc.dekWrapped,
      dekIv: enc.dekIv,
      fingerprintSha256: otisak,
      kljucPemEncrypted: enc.kljucPemEncrypted,
      kljucIv: enc.kljucIv,
      certPem: parsirano.certPem,
      certIssuer: parsirano.issuerDn,
      certSerialDec: parsirano.serialDec,
      oibCertifikata: parsirano.oib,
      subjectDn: parsirano.subjectDn,
      serialHex: parsirano.serialHex,
      notBefore: parsirano.notBefore,
      notAfter: parsirano.notAfter,
    });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    return c.html(renderTenantDetaljPage({ ...d, greska: `Parsiranje/enkripcija certifikata nije uspjelo: ${(e as Error).message}` }), 400);
  }
});

// Ručno označavanje CIS statusa poslovnog prostora — prijava/odjava prostora od
// 2017. ide isključivo kroz ePoreznu (SOAP metoda ukinuta), pa je ovo evidencija.
admin.post('/tenant/:id/prostori/:pid/cis-status', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const pid = Number(c.req.param('pid'));
  const form = await c.req.parseBody();
  const status = String(form.status) === 'prijavljen' ? 'prijavljen' : 'neposlano';
  await setProstorCisStatus(c.env.DB, tenantId, pid, status);
  return c.redirect(`/admin/tenant/${tenantId}`, 303);
});

// CIS Echo proba (bez potpisa/certifikata) — dokazuje mrežni put do CIS-a.
admin.get('/cis/echo', async (c) => {
  try {
    const rezultat = await cisEcho(c.env);
    return c.json({ okolina: okolinaIzEnv(c.env), ...rezultat });
  } catch (e) {
    return c.json({ okolina: okolinaIzEnv(c.env), ok: false, greska: (e as Error).message }, 502);
  }
});

// ───────────────────────── Proizvodi (katalog s KPD 2025) ─────────────────────────

admin.post('/tenant/:id/proizvodi', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const d = await detaljData(c, tenantId);
  if (!d) return c.text('Tenant ne postoji', 404);
  const form = await c.req.parseBody();
  const naziv = normalizirajTekst(String(form.naziv ?? ''));
  const cijena = String(form.cijena ?? '').trim();
  const kpd = String(form.kpd ?? '').trim();
  if (!naziv || !/^-?\d+(\.\d{1,2})?$/.test(cijena)) {
    return c.html(renderTenantDetaljPage({ ...d, greska: 'Naziv i neto cijena (decimalna točka, 2 decimale) su obavezni.' }), 400);
  }
  // KPD mora postojati u službenom šifrarniku (DZS KPD 2025) — kao Firin picker.
  const kpdZapis = await getKpd(c.env.DB, kpd);
  if (!kpdZapis) {
    return c.html(renderTenantDetaljPage({ ...d, greska: `KPD šifra '${kpd}' ne postoji u KPD 2025 šifrarniku — koristi pretragu.` }), 400);
  }
  const stopa = ['25', '13', '5', '0'].includes(String(form.stopa)) ? String(form.stopa) : '25';
  try {
    await createProizvod(c.env.DB, tenantId, {
      naziv,
      sifra: String(form.sifra ?? '').trim() || null,
      jedinicaMjere: String(form.jedinica ?? 'H87').trim() || 'H87',
      netoCijena: cijena,
      pdvStopa: d.tenant.u_sustavu_pdv ? stopa : '0',
      pdvKategorija: d.tenant.u_sustavu_pdv ? (stopa === '0' ? 'Z' : 'S') : 'E',
      kpd,
    });
    return c.redirect(`/admin/tenant/${tenantId}`, 303);
  } catch (e) {
    const poruka = String(e).includes('UNIQUE') ? `Proizvod sa šifrom već postoji.` : `Greška: ${e}`;
    return c.html(renderTenantDetaljPage({ ...d, greska: poruka }), 400);
  }
});

// KPD pretraga za picker (JSON; Basic Auth naslijeđen).
admin.get('/api/kpd', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.trim().length < 2) return c.json({ rezultati: [] });
  return c.json({ rezultati: await searchKpd(c.env.DB, q, 15) });
});

// ───────────────────────── Novi dokument (forma → kreirajDokument) ─────────────────────────

admin.get('/tenant/:id/dokument/novi', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const tenant = await getTenant(c.env.DB, tenantId);
  if (!tenant) return c.text('Tenant ne postoji', 404);
  const [uredjaji, operateri, proizvodi] = await Promise.all([
    listNaplatniUredjaji(c.env.DB, tenantId),
    listOperateri(c.env.DB, tenantId),
    listProizvodi(c.env.DB, tenantId),
  ]);
  return c.html(renderNoviDokumentPage(tenant, uredjaji, operateri, proizvodi));
});

admin.post('/tenant/:id/dokument/novi', async (c) => {
  const tenantId = Number(c.req.param('id'));
  const tenant = await getTenant(c.env.DB, tenantId);
  if (!tenant) return c.text('Tenant ne postoji', 404);
  const form = await c.req.parseBody({ all: true });
  const s = (k: string) => String((form as Record<string, unknown>)[k] ?? '').trim();
  const niz = (k: string): string[] => {
    const v = (form as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.map(String) : v !== undefined ? [String(v)] : [];
  };

  const [ppOznaka, nuOznaka] = s('pp_nu').split('|');
  const proizvodi = niz('st_proizvod[]');
  const nazivi = niz('st_naziv[]');
  const kolicine = niz('st_kolicina[]');
  const jms = niz('st_jm[]');
  const cijene = niz('st_cijena[]');
  const popusti = niz('st_popust[]');
  const stope = niz('st_stopa[]');
  const kpdovi = niz('st_kpd[]');

  const stavke = nazivi
    .map((_, i) => ({
      ...(proizvodi[i] ? { proizvodId: Number(proizvodi[i]) } : {}),
      ...(nazivi[i] ? { naziv: nazivi[i] } : {}),
      kolicina: kolicine[i] || '1',
      ...(jms[i] ? { jedinicaMjere: jms[i] } : {}),
      ...(cijene[i] ? { netoCijena: cijene[i] } : {}),
      popustPosto: popusti[i] || '0',
      ...(stope[i] ? { pdvStopa: stope[i] } : {}),
      ...(kpdovi[i] ? { kpd: kpdovi[i] } : {}),
    }))
    .filter((st) => 'naziv' in st || 'proizvodId' in st); // preskoči prazne retke

  const kandidat = {
    tip: s('tip'),
    poslovniProstor: ppOznaka ?? '',
    naplatniUredaj: nuOznaka ?? '',
    ...(s('operater') ? { operaterOib: s('operater') } : {}),
    nacinPlacanja: s('nacin') || 'TRANSAKCIJSKI',
    ...(s('dospijece') ? { datumDospijeca: s('dospijece') } : {}),
    ...(s('vrijedi_do') ? { vrijediDo: s('vrijedi_do') } : {}),
    ...(s('napomena') ? { napomena: s('napomena') } : {}),
    ...(s('uvjeti') ? { uvjeti: s('uvjeti') } : {}),
    ...(s('kupac_naziv')
      ? {
          kupac: {
            naziv: s('kupac_naziv'),
            ...(s('kupac_oib') ? { oib: s('kupac_oib') } : {}),
            ...(s('kupac_email') ? { email: s('kupac_email') } : {}),
            adresa: {
              ...(s('kupac_ulica') ? { ulica: s('kupac_ulica') } : {}),
              ...(s('kupac_grad') ? { grad: s('kupac_grad') } : {}),
              ...(s('kupac_pbr') ? { postanskiBroj: s('kupac_pbr') } : {}),
            },
          },
        }
      : {}),
    stavke,
    status: s('akcija') === 'skica' ? 'nacrt' : 'izdano',
  };

  const ponovnaForma = async (greska: string, status: 400 | 404 | 409) => {
    const [uredjaji, operateri, katalog] = await Promise.all([
      listNaplatniUredjaji(c.env.DB, tenantId),
      listOperateri(c.env.DB, tenantId),
      listProizvodi(c.env.DB, tenantId),
    ]);
    return c.html(renderNoviDokumentPage(tenant, uredjaji, operateri, katalog, greska), status);
  };

  const parsed = racunModelShema.safeParse(kandidat);
  if (!parsed.success) {
    const detalji = formatirajGreske(parsed.error).map((g) => `${g.polje}: ${g.poruka}`).join(' · ');
    return ponovnaForma(detalji, 400);
  }
  const rezultat = await kreirajDokument(c.env, tenant, parsed.data);
  if ('greska' in rezultat) {
    const detalji = rezultat.detalji?.map((g) => `${g.polje}: ${g.poruka}`).join(' · ');
    return ponovnaForma(detalji ? `${rezultat.greska} — ${detalji}` : rezultat.greska, rezultat.status);
  }
  return c.redirect(`/admin/racun/${rezultat.racun.id}`, 303);
});

// ───────────────────────── Detalj dokumenta + akcije ─────────────────────────

// Kontekst dokumenta preko bilo kojeg tenanta (admin vidi sve) — tenant_id iz računa.
async function adminRacunKontekst(c: { env: Env }, racunId: number) {
  const red = await c.env.DB.prepare(`SELECT tenant_id FROM racun WHERE id = ?`).bind(racunId).first<{ tenant_id: number }>();
  if (!red) return null;
  return getRacunKontekst(c.env.DB, red.tenant_id, racunId);
}

admin.get('/racun/:id', async (c) => {
  const k = await adminRacunKontekst(c, Number(c.req.param('id')));
  if (!k) return c.text('Dokument ne postoji', 404);
  const ok = c.req.query('ok');
  return c.html(renderRacunDetaljPage(k, ok ? { ok } : undefined));
});

admin.get('/racun/:id/pdf', async (c) => {
  const k = await adminRacunKontekst(c, Number(c.req.param('id')));
  if (!k) return c.text('Dokument ne postoji', 404);
  const pdf = await generirajRacunPdf(k);
  return new Response(pdf.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${k.racun.tip_dokumenta}-${(k.racun.broj_racuna_full ?? 'skica').replace(/\//g, '-')}.pdf"`,
    },
  });
});

admin.post('/racun/:id/izdaj', async (c) => {
  const id = Number(c.req.param('id'));
  const k = await adminRacunKontekst(c, id);
  if (!k) return c.text('Dokument ne postoji', 404);
  if (k.racun.status !== 'nacrt') return c.html(renderRacunDetaljPage(k, { greska: 'Dokument je već izdan.' }), 409);
  const sada = new Date();
  await izdajSkicu(c.env.DB, {
    tenantId: k.racun.tenant_id,
    racunId: id,
    sekvencaVrsta: k.racun.sekvenca_vrsta,
    oznakaSlijednosti: k.racun.oznaka_slijednosti,
    poslovniProstorId: k.racun.poslovni_prostor_id,
    naplatniUredajId: k.racun.naplatni_uredaj_id,
    oznPP: k.ppOznaka,
    oznNU: k.nuOznaka,
    godina: godinaZagreb(sada),
    datumVrijeme: sada.toISOString(),
  });
  return c.redirect(`/admin/racun/${id}`, 303);
});

// Ručno okidanje (naknadne) fiskalizacije iz admin detalja računa.
admin.post('/racun/:id/fiskaliziraj', async (c) => {
  const id = Number(c.req.param('id'));
  const k = await adminRacunKontekst(c, id);
  if (!k) return c.text('Dokument ne postoji', 404);
  if (k.racun.tip_dokumenta !== 'fiskalni_b2c') {
    return c.html(renderRacunDetaljPage(k, { greska: 'Samo fiskalni B2C računi se fiskaliziraju.' }), 409);
  }
  const ishod = await fiskalizirajRacun(c.env, k.racun.tenant_id, id).catch((e) => ({
    ok: false as const, greska: (e as Error).message,
  }));
  const poruka = ishod.ok ? `Fiskalizirano — JIR ${ishod.jir}` : `Fiskalizacija nije uspjela: ${ishod.greska}`;
  return c.redirect(`/admin/racun/${id}?ok=${encodeURIComponent(poruka)}`, 303);
});

admin.post('/racun/:id/posalji', async (c) => {
  const id = Number(c.req.param('id'));
  const k = await adminRacunKontekst(c, id);
  if (!k) return c.text('Dokument ne postoji', 404);
  if (!emailKonfiguriran(c.env)) {
    return c.html(renderRacunDetaljPage(k, { greska: 'Slanje e-maila nije konfigurirano (ni send_email binding ni RESEND_API_KEY).' }), 503);
  }
  const form = await c.req.parseBody();
  const na = String(form.na ?? '').trim() || k.kupac?.email || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(na)) {
    return c.html(renderRacunDetaljPage(k, { greska: 'Upiši valjanu e-mail adresu primatelja.' }), 400);
  }
  const pdf = await generirajRacunPdf(k);
  let kanal: string;
  try {
    ({ kanal } = await posaljiRacunEmailom(c.env, k, pdf, na));
  } catch (e) {
    return c.html(renderRacunDetaljPage(k, { greska: `Slanje nije uspjelo: ${(e as Error).message}` }), 502);
  }
  await zabiljeziSlanjeEmaila(c.env.DB, k.racun.tenant_id, id, na);
  return c.redirect(`/admin/racun/${id}?ok=${encodeURIComponent(`Poslano na ${na} (${kanal})`)}`, 303);
});

// Globalni popis dokumenata (svi tenanti).
admin.get('/racuni', async (c) => {
  const racuni = await listRacuni(c.env.DB, { limit: 100 });
  return c.html(renderRacuniPage(racuni));
});
