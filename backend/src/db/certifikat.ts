// D1 pristupni sloj — Certifikati tenanata (privatni ključ enkriptiran at-rest; P12 se ne čuva, K16).
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).

import type {
  CertifikatRow,
} from '../types';

// ───────────────────────── Certifikat ─────────────────────────

export async function createCertifikat(
  db: D1Database,
  tenantId: number,
  c: {
    okolina: 'test' | 'prod';
    encKeyId: string;
    dekWrapped: string;
    dekIv: string;
    fingerprintSha256: string;
    // Faza 2: izvučeni materijal za potpisivanje (parsiran pri uploadu)
    kljucPemEncrypted: ArrayBuffer;
    kljucIv: string;
    certPem: string;
    certIssuer: string;
    certSerialDec: string;
    oibCertifikata: string | null;
    subjectDn: string;
    serialHex: string;
    notBefore: string;
    notAfter: string;
  },
): Promise<void> {
  // Novi cert postaje aktivan; prethodni aktivni za istu okolinu se deaktivira
  // (parcijalni unique indeks dopušta samo jedan aktivan po tenant+okolina).
  await db.batch([
    db
      .prepare(`UPDATE certifikat SET aktivan = 0 WHERE tenant_id = ? AND okolina = ? AND aktivan = 1`)
      .bind(tenantId, c.okolina),
    db
      .prepare(
        `INSERT INTO certifikat (tenant_id, okolina, enc_key_id,
                                 dek_wrapped, dek_iv, fingerprint_sha256,
                                 kljuc_pem_encrypted, kljuc_iv, cert_pem, cert_issuer,
                                 cert_serial_dec, oib_certifikata, subject_dn, serial,
                                 not_before, not_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tenantId, c.okolina, c.encKeyId,
        c.dekWrapped, c.dekIv, c.fingerprintSha256,
        c.kljucPemEncrypted, c.kljucIv, c.certPem, c.certIssuer,
        c.certSerialDec, c.oibCertifikata, c.subjectDn, c.serialHex,
        c.notBefore, c.notAfter,
      ),
  ]);
}

// Aktivni certifikat s materijalom za potpisivanje (enkriptirani ključ + cert).
export interface CertifikatMaterijalRow {
  id: number;
  kljuc_pem_encrypted: ArrayBuffer | null;
  kljuc_iv: string | null;
  dek_wrapped: string;
  dek_iv: string;
  cert_pem: string | null;
  cert_issuer: string | null;
  cert_serial_dec: string | null;
  oib_certifikata: string | null;
  not_after: string | null;
}

export async function getAktivniCertifikat(
  db: D1Database,
  tenantId: number,
  okolina: 'test' | 'prod',
): Promise<CertifikatMaterijalRow | null> {
  return db
    .prepare(
      `SELECT id, kljuc_pem_encrypted, kljuc_iv, dek_wrapped, dek_iv, cert_pem,
              cert_issuer, cert_serial_dec, oib_certifikata, not_after
       FROM certifikat WHERE tenant_id = ? AND okolina = ? AND aktivan = 1`,
    )
    .bind(tenantId, okolina)
    .first<CertifikatMaterijalRow>();
}

export async function listCertifikati(db: D1Database, tenantId: number): Promise<CertifikatRow[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id, okolina, enc_alg, enc_key_id, fingerprint_sha256, not_after, aktivan, created_at
       FROM certifikat WHERE tenant_id = ? ORDER BY id DESC`,
    )
    .bind(tenantId)
    .all<CertifikatRow>();
  return r.results;
}

// Aktivni certifikati koji ističu za ≤ `dana` (uključivo već istekle).
export async function certifikatiKojiIsticu(
  db: D1Database,
  dana: number,
): Promise<{ tenant_id: number; okolina: string; not_after: string }[]> {
  const r = await db
    .prepare(
      `SELECT tenant_id, okolina, not_after FROM certifikat
       WHERE aktivan = 1 AND not_after IS NOT NULL AND julianday(not_after) <= julianday('now', ?)`,
    )
    .bind(`+${dana} days`)
    .all<{ tenant_id: number; okolina: string; not_after: string }>();
  return r.results;
}
