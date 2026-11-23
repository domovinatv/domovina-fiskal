// Dnevni platformski backup: cijela D1 baza kao SQL dump (gzip) u privatni R2
// bucket `fiskal-backup-secured` (TEST: `fiskal-backup-secured-test`), EU jurisdikcija.
// PROD bucket ima Bucket Lock od 4018 dana (11 godina): objekt se ne može
// obrisati ni prepisati, pa ni kompromitirani Worker ne može uništiti povijest.
// Postupak vraćanja: docs/knowledge/23-backup.md.

import type { Env } from '../types';
import { postaviStanje } from '../db';
import { okolinaIzEnv } from '../okolina';
import { gzip, izveziBazuSql, sha256Hex } from './dump';

export interface PlatformskiBackup {
  kada: string;
  kljuc: string;
  bajtova: number;
  bajtovaSql: number;
  sha256: string;
  redaka: number;
  zadnjaMigracija: string | null;
}

export async function napraviPlatformskiBackup(env: Env, sada = new Date()): Promise<PlatformskiBackup> {
  if (!env.BACKUP) throw new Error('R2 binding BACKUP nije konfiguriran');
  const dump = await izveziBazuSql(env.DB);
  const tijelo = await gzip(dump.sql);
  const sha256 = await sha256Hex(dump.sql);
  const iso = sada.toISOString();
  // d1/<okolina>/2026/11/2026-11-23T01-30-00Z.sql.gz — jedinstven po izvođenju
  // (bucket lock ne dopušta prepisivanje istog ključa).
  const kljuc = `d1/${okolinaIzEnv(env)}/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(0, 19).replace(/:/g, '-')}Z.sql.gz`;
  const redaka = Object.values(dump.redaka).reduce((a, b) => a + b, 0);
  await env.BACKUP.put(kljuc, tijelo, {
    httpMetadata: { contentType: 'application/gzip' }, // bez contentEncoding: klijent ne smije sam raspakirati
    customMetadata: {
      sha256_sql: sha256,
      redaka: String(redaka),
      zadnja_migracija: dump.zadnjaMigracija ?? '',
      tablice: JSON.stringify(dump.redaka),
    },
  });
  const rez: PlatformskiBackup = {
    kada: iso,
    kljuc,
    bajtova: tijelo.byteLength,
    bajtovaSql: dump.sql.length,
    sha256,
    redaka,
    zadnjaMigracija: dump.zadnjaMigracija,
  };
  await postaviStanje(env.DB, 'backup_zadnji', JSON.stringify(rez));
  return rez;
}
