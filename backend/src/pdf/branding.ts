// Izgled PDF računa po tenantu (tablica tenant_branding, migracija 0017):
// akcentna boja, logo (PNG/JPEG ≤ 200 KB) i tekst podnožja. Sve je opcionalno;
// bez retka generator koristi zadanu Domovina temu.
//
// Svako mjesto koje generira PDF računa ide kroz pdfRacuna(), da kupac uvijek
// dobije isti izgled (preuzimanje, e-mail, admin, backup).

import { PDFDocument } from 'pdf-lib';
import type { RacunKontekst } from '../db';
import type { RacunRow, StavkaRow, TenantRow } from '../types';
import { normalizirajTekst } from '../util';
import { generirajRacunPdf, type PdfBranding } from './racun-pdf';

export const LOGO_MAX_BAJTOVA = 200 * 1024;
export const PODNOZJE_MAX = 160;

export interface TenantBrandingRow {
  tenant_id: number;
  boja: string | null;
  podnozje: string | null;
  logo_b64: string | null;
  logo_tip: 'png' | 'jpg' | null;
  updated_at: string;
}

function izBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function tipSlike(b: Uint8Array): 'png' | 'jpg' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}

export async function getTenantBranding(db: D1Database, tenantId: number): Promise<TenantBrandingRow | null> {
  return db.prepare(`SELECT * FROM tenant_branding WHERE tenant_id = ?`).bind(tenantId).first<TenantBrandingRow>();
}

export function brandingIzRetka(r: TenantBrandingRow | null): PdfBranding | null {
  if (!r) return null;
  return { boja: r.boja, podnozje: r.podnozje, logo: r.logo_b64 ? izBase64(r.logo_b64) : null };
}

export async function getPdfBranding(db: D1Database, tenantId: number): Promise<PdfBranding | null> {
  try {
    return brandingIzRetka(await getTenantBranding(db, tenantId));
  } catch (e) {
    // Branding je kozmetika — račun se mora moći preuzeti i bez njega.
    console.error(`branding tenanta ${tenantId}`, e);
    return null;
  }
}

// PDF računa s brandingom tenanta. `branding` se može proslijediti kad je već
// učitan (backup u petlji), inače se čita iz D1.
export async function pdfRacuna(db: D1Database, k: RacunKontekst, branding?: PdfBranding | null): Promise<Uint8Array> {
  const b = branding !== undefined ? branding : await getPdfBranding(db, k.racun.tenant_id);
  return generirajRacunPdf(k, { branding: b });
}

// ── Unos (dashboard PUT /postavke/branding i pregled) ──

export interface UnosBrandinga {
  boja: string | null;
  podnozje: string | null;
  // undefined = logo se ne mijenja; null = ukloni; bajtovi = novi logo
  logo: Uint8Array | null | undefined;
}

type Rezultat = { ok: true; unos: UnosBrandinga } | { ok: false; greska: string };

// logo: base64, data URL ('data:image/png;base64,…') ili bajtovi; null briše logo.
export async function validirajUnosBrandinga(u: Record<string, unknown>): Promise<Rezultat> {
  let boja: string | null = null;
  if (u.boja != null && String(u.boja).trim() !== '') {
    const m = String(u.boja).trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return { ok: false, greska: 'Boja mora biti u obliku #RRGGBB (npr. #C8102E)' };
    boja = `#${m[1].toUpperCase()}`;
  }

  let podnozje: string | null = null;
  if (u.podnozje != null) {
    podnozje = normalizirajTekst(String(u.podnozje)).replace(/\s+/g, ' ') || null;
    if (podnozje && podnozje.length > PODNOZJE_MAX) return { ok: false, greska: `Tekst podnožja smije imati najviše ${PODNOZJE_MAX} znakova` };
  }

  let logo: Uint8Array | null | undefined;
  if (u.logo === null) logo = null;
  else if (u.logo !== undefined) {
    let bajtovi: Uint8Array;
    if (u.logo instanceof Uint8Array) bajtovi = u.logo; // admin: multipart datoteka
    else {
      const s = String(u.logo).trim().replace(/^data:image\/[a-z+.-]+;base64,/i, '').replace(/\s/g, '');
      try {
        bajtovi = izBase64(s);
      } catch {
        return { ok: false, greska: 'Logo nije ispravan base64' };
      }
    }
    if (bajtovi.length > LOGO_MAX_BAJTOVA) return { ok: false, greska: `Logo smije imati najviše ${LOGO_MAX_BAJTOVA / 1024} KB` };
    const tip = tipSlike(bajtovi);
    if (!tip) return { ok: false, greska: 'Logo mora biti PNG ili JPEG' };
    try {
      // Isti put kao generator: ako se ovdje ne ugradi, ne bi ni na računu.
      const doc = await PDFDocument.create();
      const slika = tip === 'png' ? await doc.embedPng(bajtovi) : await doc.embedJpg(bajtovi);
      if (slika.width < 16 || slika.height < 16) return { ok: false, greska: 'Logo je premalen (najmanje 16×16 px)' };
    } catch {
      return { ok: false, greska: 'Logo se ne može pročitati — spremi ga ponovno kao PNG ili JPEG' };
    }
    logo = bajtovi;
  }
  return { ok: true, unos: { boja, podnozje, logo } };
}

export async function spremiTenantBranding(db: D1Database, tenantId: number, unos: UnosBrandinga): Promise<void> {
  const logoB64 = unos.logo ? uBase64(unos.logo) : null;
  const logoTip = unos.logo ? tipSlike(unos.logo) : null;
  if (unos.logo === undefined) {
    await db
      .prepare(
        `INSERT INTO tenant_branding (tenant_id, boja, podnozje) VALUES (?, ?, ?)
         ON CONFLICT (tenant_id) DO UPDATE SET boja = excluded.boja, podnozje = excluded.podnozje, updated_at = datetime('now')`,
      )
      .bind(tenantId, unos.boja, unos.podnozje)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO tenant_branding (tenant_id, boja, podnozje, logo_b64, logo_tip) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id) DO UPDATE SET boja = excluded.boja, podnozje = excluded.podnozje,
           logo_b64 = excluded.logo_b64, logo_tip = excluded.logo_tip, updated_at = datetime('now')`,
      )
      .bind(tenantId, unos.boja, unos.podnozje, logoB64, logoTip)
      .run();
  }
}

export async function obrisiTenantBranding(db: D1Database, tenantId: number): Promise<void> {
  await db.prepare(`DELETE FROM tenant_branding WHERE tenant_id = ?`).bind(tenantId).run();
}

export function brandingJson(r: TenantBrandingRow | null) {
  return {
    boja: r?.boja ?? null,
    podnozje: r?.podnozje ?? null,
    logo: r?.logo_b64 ? `data:image/${r.logo_tip === 'jpg' ? 'jpeg' : 'png'};base64,${r.logo_b64}` : null,
    azurirano: r?.updated_at ?? null,
  };
}

// Ogledni PDF s (još nespremljenim) unosom. Izostavljen logo = spremljeni logo,
// da pregled odgovara onome što će biti nakon spremanja.
export async function pdfPregleda(db: D1Database, tenant: TenantRow, unos: UnosBrandinga): Promise<Uint8Array> {
  let logo = unos.logo;
  if (logo === undefined) {
    const spremljeno = await getTenantBranding(db, tenant.id);
    logo = spremljeno?.logo_b64 ? izBase64(spremljeno.logo_b64) : null;
  }
  return generirajRacunPdf(primjerKontekst(tenant), { branding: { boja: unos.boja, podnozje: unos.podnozje, logo } });
}

// ── Ogledni račun za pregled izgleda (podaci tenanta, izmišljene stavke) ──

export function primjerKontekst(tenant: TenantRow): RacunKontekst {
  const pdv = !!tenant.u_sustavu_pdv;
  const stavka = (i: number, naziv: string, kolicina: string, cijena: string, iznos: string): StavkaRow => ({
    id: i, racun_id: 0, redni_broj: i, naziv, opis: null, kolicina, jedinica_mjere: 'kom', neto_cijena: cijena,
    popust_posto: '0', pdv_kategorija: pdv ? 'S' : 'E', pdv_stopa: pdv ? '25' : '0', kpd: null, kpd_shema: 'CG',
    proizvod_id: null, iznos,
  });
  const osnovica = '120.00';
  const porez = pdv ? '30.00' : '0.00';
  const ukupno = pdv ? '150.00' : '120.00';
  const racun = {
    id: 0, tenant_id: tenant.id, poslovni_prostor_id: 0, naplatni_uredaj_id: 0, operater_id: null, kupac_id: null,
    sekvenca_vrsta: 'racun', redni_broj: null, godina: null, broj_racuna_full: null,
    oznaka_slijednosti: 'P', datum_vrijeme: new Date().toISOString(), tip_dokumenta: 'racun', valuta: 'EUR',
    nacin_placanja: 'Transakcijski račun', datum_dospijeca: null, vrijedi_do: null, datum_isporuke: null,
    model_placanja: 'HR00', poziv_na_broj: '1', neto: osnovica, iznos_bez_pdv: osnovica, pdv: porez,
    iznos_s_pdv: ukupno, dospijeva_za_placanje: ukupno, klauzula_pdv: null,
    napomena: 'Ovo je ogledni račun za pregled izgleda — nije izdan ni fiskaliziran.',
    interna_biljeska: null, uvjeti: null, poslano_email_ts: null, poslano_email_na: null, zki: null, jir: null,
    qr_payload: null, doku_id: null, eracun_status: null, eracun_delivery_block: null, eracun_zadnja_provjera: null,
    eracun_greska: null, fiskal_nak_dost: 0, fiskal_pokusaja: 0, fiskal_zadnji_pokusaj: null, fiskal_greska: null,
    // Skica: bez broja i bez barkodova za plaćanje (pravi IBAN tenanta!).
    storno_racun_id: null, status: 'nacrt',
  } as RacunRow;
  return {
    racun,
    stavke: [stavka(1, 'Primjer usluge ili proizvoda', '2', '40.00', '80.00'), stavka(2, 'Druga stavka', '1', '40.00', '40.00')],
    raspodjela: pdv ? [{ id: 0, racun_id: 0, kategorija_pdv: 'S', stopa: '25', oporezivi_iznos: osnovica, iznos_poreza: porez }] : [],
    tenant, ppOznaka: '1', nuOznaka: '1', operaterIme: null, operaterOib: null, stornoOriginal: null,
    kupac: { naziv: 'Kupac d.o.o.', oib: null, vat_number: null, adr_ulica: 'Ulica 1', adr_grad: 'Zagreb', adr_postanski_broj: '10000', adr_drzava: 'HR', email: null, tip: 'pravna' },
  };
}
