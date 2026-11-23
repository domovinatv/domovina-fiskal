// Backup (docs/knowledge/23-backup.md): dnevni platformski SQL dump u R2 i
// BYO backup po tenantu (tenantov vlastiti Cloudflare R2).

import type { Env } from '../types';
import { postaviStanje } from '../db';
import { napraviPlatformskiBackup } from './platforma';

export { napraviPlatformskiBackup } from './platforma';

// Cron 30 1 * * *. Greška platformskog backupa ne smije zaustaviti snapshotove
// tenanata (i obrnuto); svaka se zapisuje, a alarm hvata izostanak (alarmi.ts).
export async function dnevniBackup(env: Env): Promise<void> {
  try {
    const b = await napraviPlatformskiBackup(env);
    console.log(`backup: ${b.kljuc} (${b.bajtova} B gzip, ${b.redaka} redaka)`);
  } catch (e) {
    console.error('backup platforme nije uspio', e);
    await postaviStanje(env.DB, 'backup_zadnja_greska', `${new Date().toISOString()} ${String(e)}`.slice(0, 1000));
  }
}
