// Testna okolina: svježi tenant (nasumični valjani OIB) s prostorom, uređajem,
// operaterom, API ključem i — po želji — certifikatom iz globalnog setupa.
// D1 stanje se dijeli među testovima iste datoteke, pa svaki test radi na
// vlastitom tenantu i ne ovisi o redoslijedu.

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { inject } from 'vitest';
import worker from '../../src/index';
import {
  createApiKljuc,
  createCertifikat,
  createNaplatniUredaj,
  createOperater,
  createPoslovniProstor,
  createTenant,
  setProstorCisStatus,
} from '../../src/db';
import { ENC_KEY_ID, enkriptirajCertifikat } from '../../src/kripto';
import type { Env, TenantRow } from '../../src/types';

export const testEnv = env as unknown as Env;

// Nasumični OIB s ispravnom kontrolnom znamenkom (ISO 7064 MOD 11,10).
export function nasumicniOib(): string {
  const znamenke = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
  let a = 10;
  for (const z of znamenke) {
    a = (a + z) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  const k = (11 - a) % 10;
  return znamenke.join('') + String(k);
}

export interface TestniTenant {
  tenant: TenantRow;
  kljuc: string;
  operaterOib: string;
  prostorId: number;
}

export async function napraviTenanta(
  opcije: { certifikat?: boolean; certIstekao?: boolean; uSustavuPdv?: boolean } = {},
): Promise<TestniTenant> {
  const db = testEnv.DB;
  const tenant = await createTenant(db, {
    oib: nasumicniOib(),
    naziv: 'Testni obveznik d.o.o.',
    adrUlica: 'Ilica 1',
    adrMjesto: 'Zagreb',
    adrPostanskiBroj: '10000',
    uSustavuPdv: opcije.uSustavuPdv ?? true,
    iban: 'HR1210010051863000160',
    oznakaSlijednosti: 'P',
  });
  const pp = await createPoslovniProstor(db, tenant.id, { oznaka: 'WEB', datumPocetkaPrimjene: '2026-01-01' });
  await setProstorCisStatus(db, tenant.id, pp.id, 'prijavljen');
  await createNaplatniUredaj(db, pp.id, { oznaka: '1' });
  const operaterOib = nasumicniOib();
  await createOperater(db, tenant.id, { oibOperatera: operaterOib, ime: 'Operater Test' });
  const { rawKey } = await createApiKljuc(db, tenant.id, 'test');

  if (opcije.certifikat ?? true) {
    const tc = inject('testniCertifikat');
    const enc = await enkriptirajCertifikat(testEnv.ENC_MASTER_KEY!, new Uint8Array([1, 2, 3]).buffer, tc.kljucPem);
    const sada = Date.now();
    await createCertifikat(db, tenant.id, {
      okolina: 'test',
      pkcs12Encrypted: enc.pkcs12Encrypted,
      encKeyId: ENC_KEY_ID,
      encIv: enc.encIv,
      dekWrapped: enc.dekWrapped,
      dekIv: enc.dekIv,
      fingerprintSha256: crypto.randomUUID(),
      kljucPemEncrypted: enc.kljucPemEncrypted,
      kljucIv: enc.kljucIv,
      certPem: tc.certPem,
      certIssuer: tc.issuerDn,
      certSerialDec: tc.serialDec,
      oibCertifikata: tenant.oib,
      subjectDn: `O=TEST HR${tenant.oib}`,
      serialHex: '0a1b2c3d4e5f',
      notBefore: new Date(sada - 86_400_000).toISOString(),
      notAfter: new Date(opcije.certIstekao ? sada - 3_600_000 : sada + 365 * 86_400_000).toISOString(),
    });
  }
  return { tenant, kljuc: rawKey, operaterOib, prostorId: pp.id };
}

// Poziv workera izravno (isti modul graf kao test → vi.mock vrijedi i ovdje).
export async function poziv(putanja: string, init: RequestInit & { kljuc?: string } = {}): Promise<Response> {
  const zaglavlja = new Headers(init.headers);
  if (init.kljuc) zaglavlja.set('Authorization', `Bearer ${init.kljuc}`);
  if (init.body && !zaglavlja.has('Content-Type')) zaglavlja.set('Content-Type', 'application/json');
  const ctx = createExecutionContext();
  const odgovor = await worker.fetch(new Request(`https://fiskal-test.domovina.ai${putanja}`, { ...init, headers: zaglavlja }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return odgovor;
}

export async function json<T = Record<string, any>>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

export function b2cTijelo(t: TestniTenant, dodatno: Record<string, unknown> = {}) {
  return {
    tip: 'FISKALNI_B2C',
    poslovniProstor: 'WEB',
    naplatniUredaj: '1',
    operaterOib: t.operaterOib,
    nacinPlacanja: 'KARTICA',
    stavke: [
      { naziv: 'Crošulja', kolicina: '2', netoCijena: '40.00', pdvStopa: '25' },
      { naziv: 'Dostava', kolicina: '1', netoCijena: '4.00', pdvStopa: '25' },
    ],
    ...dodatno,
  };
}

// Broj redaka, distinct i max rednog broja u slijedu tenanta — za provjeru rupa.
export async function slijed(tenantId: number, vrsta = 'fiskalni') {
  const red = await testEnv.DB
    .prepare(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT redni_broj) AS d, MAX(redni_broj) AS max,
              (SELECT MAX(zadnji_broj) FROM sekvenca WHERE tenant_id = ?1 AND vrsta = ?2) AS sekvenca
       FROM racun WHERE tenant_id = ?1 AND sekvenca_vrsta = ?2 AND redni_broj IS NOT NULL`,
    )
    .bind(tenantId, vrsta)
    .first<{ n: number; d: number; max: number | null; sekvenca: number | null }>();
  return red!;
}
