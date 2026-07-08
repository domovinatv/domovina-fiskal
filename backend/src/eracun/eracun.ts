// Orkestracija eRačuna 2.0 preko posrednika doku (faza 3 MVP).
//
// Tok slanja: učitaj kontekst → provjeri tip/kupca → dešifriraj doku token tenanta
// → mapiraj u DokuInvoice → POST /create → perzistiraj doku_id + status razmjene
// → logiraj zahtjev/odgovor. doku gradi/potpisuje/šalje UBL svojim certom.
//
// Multitenant model: BYO-key — token je PO tenantu (doku_konfig), a naša
// integracija se doku-u predstavlja globalnim DOKU_SOFTWARE_API_TOKEN-om.

import type { Env } from '../types';
import {
  getDokuKonfig,
  getRacunKontekst,
  logPoruka,
  setDokuAmsRegistriran,
  zapisiEracunGresku,
  zapisiEracunSlanje,
  zapisiEracunStatus,
} from '../db';
import { dekriptirajTajnu } from '../kripto';
import { DokuKlijent, type DokuExchangeStatus, type DokuOkolina } from './doku';
import { mapirajZaDoku } from './mapiranje';

export function okolinaZaDoku(env: Env): DokuOkolina {
  return env.OKOLINA === 'prod' ? 'prod' : 'test';
}

// doku exchange status → interni status računa.
function statusRacunaIzDoku(s: DokuExchangeStatus | null): string {
  if (s === 'DELIVERED' || s === 'FISCALIZED') return 'fiskaliziran';
  return 'poslan'; // IMPORTED ili nepoznato
}

// Sastavi klijent za tenanta (dešifrira token). Vraća grešku umjesto bacanja.
async function napraviKlijent(env: Env, tenantId: number): Promise<{ klijent: DokuKlijent; okolina: DokuOkolina } | { greska: string }> {
  if (!env.DOKU_SOFTWARE_API_TOKEN) return { greska: 'DOKU_SOFTWARE_API_TOKEN secret nije postavljen' };
  if (!env.ENC_MASTER_KEY) return { greska: 'ENC_MASTER_KEY secret nije postavljen' };
  const okolina = okolinaZaDoku(env);
  const konfig = await getDokuKonfig(env.DB, tenantId, okolina);
  if (!konfig) return { greska: `Tenant nema doku token za okolinu '${okolina}' — postavi ga u adminu` };
  const token = await dekriptirajTajnu(env.ENC_MASTER_KEY, {
    tokenEncrypted: konfig.token_encrypted,
    encIv: konfig.enc_iv,
    dekWrapped: konfig.dek_wrapped,
    dekIv: konfig.dek_iv,
  });
  return { klijent: new DokuKlijent(token, env.DOKU_SOFTWARE_API_TOKEN, okolina), okolina };
}

export interface EracunIshod {
  ok: boolean;
  dokuId?: number;
  status?: string | null; // doku exchange status
  deliveryBlock?: string | null;
  greska?: string;
}

// Glavni tok slanja eRačuna.
export async function posaljiEracun(env: Env, tenantId: number, racunId: number): Promise<EracunIshod> {
  const k = await getRacunKontekst(env.DB, tenantId, racunId);
  if (!k) return { ok: false, greska: `Račun ${racunId} ne postoji` };
  if (k.racun.tip_dokumenta !== 'eracun_b2b' && k.racun.tip_dokumenta !== 'eracun_b2g') {
    return { ok: false, greska: 'Samo eRačun (B2B/B2G) se šalje preko doku-a' };
  }
  if (k.racun.status === 'nacrt') return { ok: false, greska: 'Skica se ne šalje — prvo izdaj dokument' };
  if (k.racun.doku_id) {
    return { ok: true, dokuId: k.racun.doku_id, status: k.racun.eracun_status, deliveryBlock: k.racun.eracun_delivery_block };
  }

  const kl = await napraviKlijent(env, tenantId);
  if ('greska' in kl) return { ok: false, greska: kl.greska };

  const mapirano = mapirajZaDoku(k);
  if ('greska' in mapirano) return { ok: false, greska: mapirano.greska };

  const messageId = crypto.randomUUID();
  await logPoruka(env.DB, {
    tenantId, racunId, vrstaPoruke: 'eracun', smjer: 'zahtjev',
    messageId, okolina: kl.okolina, requestXml: JSON.stringify({ invoice: mapirano.invoice }),
  });

  const odgovor = await kl.klijent.posaljiRacun(mapirano.invoice);
  if (!odgovor.ok || !odgovor.data) {
    const poruka = odgovor.greska ?? `doku HTTP ${odgovor.status}`;
    await Promise.all([
      logPoruka(env.DB, {
        tenantId, racunId, vrstaPoruke: 'eracun', smjer: 'odgovor',
        messageId, okolina: kl.okolina, sifraGreske: String(odgovor.status), porukaGreske: poruka,
      }),
      zapisiEracunGresku(env.DB, tenantId, racunId, poruka),
    ]);
    return { ok: false, greska: poruka };
  }

  const d = odgovor.data;
  await Promise.all([
    logPoruka(env.DB, {
      tenantId, racunId, vrstaPoruke: 'eracun', smjer: 'odgovor',
      messageId, okolina: kl.okolina, responseXml: JSON.stringify(d),
    }),
    zapisiEracunSlanje(env.DB, tenantId, racunId, {
      dokuId: d.id,
      status: null, // exchange status stiže tek preko GET /outgoing/{id}
      deliveryBlock: d.deliveryBlock,
      noviStatusRacuna: 'poslan',
    }),
  ]);

  return { ok: true, dokuId: d.id, status: null, deliveryBlock: d.deliveryBlock };
}

// Osvježi status razmjene/naplate iz doku-a (poll; webhook nije javno dokumentiran).
export async function osvjeziEracunStatus(env: Env, tenantId: number, racunId: number): Promise<EracunIshod> {
  const k = await getRacunKontekst(env.DB, tenantId, racunId);
  if (!k) return { ok: false, greska: `Račun ${racunId} ne postoji` };
  if (!k.racun.doku_id) return { ok: false, greska: 'Račun još nije poslan preko doku-a' };

  const kl = await napraviKlijent(env, tenantId);
  if ('greska' in kl) return { ok: false, greska: kl.greska };

  const odgovor = await kl.klijent.dohvatiStatus(k.racun.doku_id);
  if (!odgovor.ok || !odgovor.data) {
    const poruka = odgovor.greska ?? `doku HTTP ${odgovor.status}`;
    await zapisiEracunGresku(env.DB, tenantId, racunId, poruka);
    return { ok: false, greska: poruka };
  }
  const exchange = odgovor.data.data.exchange;
  await zapisiEracunStatus(env.DB, tenantId, racunId, {
    status: exchange.status,
    deliveryBlock: k.racun.eracun_delivery_block,
    noviStatusRacuna: statusRacunaIzDoku(exchange.status),
  });
  return { ok: true, dokuId: k.racun.doku_id, status: exchange.status };
}

// Provjeri je li primatelj (OIB) registriran za eDelivery (AMS lookup preko doku-a).
export async function provjeriPrimatelja(
  env: Env,
  tenantId: number,
  oib: string,
): Promise<{ ok: boolean; registriran?: boolean; mpsEndpoint?: string | null; greska?: string }> {
  const kl = await napraviKlijent(env, tenantId);
  if ('greska' in kl) return { ok: false, greska: kl.greska };
  const r = await kl.klijent.provjeriPrimatelja(oib);
  if (!r.ok) return { ok: false, greska: r.greska };
  if (r.status === 404 || !r.data) return { ok: true, registriran: false, mpsEndpoint: null };
  return { ok: true, registriran: true, mpsEndpoint: r.data.mpsEndpoint };
}

// Objavi tenanta na AMS-u za ZAPRIMANJE ulaznih eRačuna (preko doku-a).
export async function registrirajZaZaprimanje(env: Env, tenantId: number): Promise<{ ok: boolean; greska?: string }> {
  const kl = await napraviKlijent(env, tenantId);
  if ('greska' in kl) return { ok: false, greska: kl.greska };
  const r = await kl.klijent.registrirajZaZaprimanje();
  if (!r.ok) return { ok: false, greska: r.greska };
  await setDokuAmsRegistriran(env.DB, tenantId, kl.okolina, true);
  return { ok: true };
}
