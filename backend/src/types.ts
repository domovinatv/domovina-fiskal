// Zajednički tipovi — Env bindings + redovi iz D1 (podskup stupaca koji se koriste).

import type { SendEmailBinding } from './email';

export interface Env {
  DB: D1Database;
  OKOLINA: string; // 'test' | 'prod' — zadana okolina za certifikate
  ADMIN_USER?: string; // Basic Auth za /admin (wrangler secret)
  ADMIN_PASS?: string;
  ENC_MASTER_KEY?: string; // KEK, 64 hex znaka (wrangler secret)
  EMAIL?: SendEmailBinding; // Cloudflare Email Service (send_email binding)
  RESEND_API_KEY?: string; // Resend fallback kanal (wrangler secret)
}

export interface TenantRow {
  id: number;
  oib: string;
  naziv: string;
  adr_ulica: string | null;
  adr_kucni_broj: string | null;
  adr_mjesto: string | null;
  adr_postanski_broj: string | null;
  adr_drzava: string;
  u_sustavu_pdv: number;
  iban: string | null;
  oznaka_slijednosti_def: 'P' | 'N';
  status: 'active' | 'suspended';
  created_at: string;
}

export interface ApiKljucRow {
  id: number;
  tenant_id: number;
  prefiks: string;
  opis: string | null;
  aktivan: number;
  zadnje_koristen_at: string | null;
  created_at: string;
}

export interface PoslovniProstorRow {
  id: number;
  tenant_id: number;
  oznaka: string;
  adr_ulica: string | null;
  adr_naselje: string | null;
  datum_pocetka_primjene: string;
  datum_zatvaranja: string | null;
  cis_status: 'neposlano' | 'prijavljen' | 'greska';
  created_at: string;
}

export interface NaplatniUredajRow {
  id: number;
  poslovni_prostor_id: number;
  oznaka: string;
  opis: string | null;
  aktivan: number;
  created_at: string;
}

export interface OperaterRow {
  id: number;
  tenant_id: number;
  oib_operatera: string;
  ime: string | null;
  aktivan: number;
  created_at: string;
}

export interface CertifikatRow {
  id: number;
  tenant_id: number;
  okolina: 'test' | 'prod';
  enc_alg: string;
  enc_key_id: string;
  fingerprint_sha256: string | null;
  not_after: string | null;
  aktivan: number;
  created_at: string;
}

export interface RacunRow {
  id: number;
  tenant_id: number;
  poslovni_prostor_id: number;
  naplatni_uredaj_id: number;
  operater_id: number | null;
  kupac_id: number | null;
  sekvenca_vrsta: 'ponuda' | 'racun' | 'fiskalni';
  redni_broj: number | null; // NULL = skica
  godina: number | null;
  broj_racuna_full: string | null;
  oznaka_slijednosti: 'P' | 'N';
  datum_vrijeme: string;
  tip_dokumenta: string;
  valuta: string;
  nacin_placanja: string | null;
  datum_dospijeca: string | null;
  vrijedi_do: string | null;
  datum_isporuke: string | null;
  model_placanja: string | null;
  poziv_na_broj: string | null;
  neto: string | null;
  iznos_bez_pdv: string | null;
  pdv: string | null;
  iznos_s_pdv: string | null;
  dospijeva_za_placanje: string | null;
  klauzula_pdv: string | null;
  napomena: string | null;
  interna_biljeska: string | null;
  uvjeti: string | null;
  poslano_email_ts: string | null;
  poslano_email_na: string | null;
  zki: string | null;
  jir: string | null;
  qr_payload: string | null;
  fiskal_nak_dost: number;
  fiskal_pokusaja: number;
  fiskal_zadnji_pokusaj: string | null;
  fiskal_greska: string | null;
  storno_racun_id: number | null;
  status: string;
  created_at: string;
}

export interface StavkaRow {
  id: number;
  racun_id: number;
  redni_broj: number;
  naziv: string;
  opis: string | null;
  kolicina: string;
  jedinica_mjere: string;
  neto_cijena: string;
  popust_posto: string;
  pdv_kategorija: string;
  pdv_stopa: string;
  kpd: string | null;
  kpd_shema: string;
  proizvod_id: number | null;
}

export interface PdvRaspodjelaRow {
  id: number;
  racun_id: number;
  kategorija_pdv: string;
  stopa: string;
  oporezivi_iznos: string;
  iznos_poreza: string;
}

// Hono varijable postavljene u Bearer auth middlewareu.
export interface ApiVarijable {
  tenant: TenantRow;
  apiKljucId: number;
}
