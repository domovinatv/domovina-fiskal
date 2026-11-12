// K22: zadnje_koristen_at API ključa osvježava se najviše jednom u 60 s,
// umjesto D1 UPDATE-a pri svakom API pozivu.
import { describe, expect, it } from 'vitest';
import { napraviTenanta, poziv, testEnv } from './pomocno/okolina';

async function zadnje(tenantId: number) {
  const r = await testEnv.DB
    .prepare('SELECT zadnje_koristen_at AS z FROM api_kljuc WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ z: string | null }>();
  return r!.z;
}

async function postavi(tenantId: number, izraz: string) {
  await testEnv.DB.prepare(`UPDATE api_kljuc SET zadnje_koristen_at = ${izraz} WHERE tenant_id = ?`).bind(tenantId).run();
}

describe('touch API ključa (K22)', () => {
  it('prvi poziv upisuje vrijeme', async () => {
    const t = await napraviTenanta({ certifikat: false });
    expect(await zadnje(t.tenant.id)).toBeNull();
    expect((await poziv('/api/v1/racun', { kljuc: t.kljuc })).status).toBe(200);
    expect(await zadnje(t.tenant.id)).not.toBeNull();
  });

  it('svježe vrijeme (< 60 s) se ne prepisuje', async () => {
    const t = await napraviTenanta({ certifikat: false });
    await postavi(t.tenant.id, `datetime('now', '-30 seconds')`);
    const prije = await zadnje(t.tenant.id);
    expect((await poziv('/api/v1/racun', { kljuc: t.kljuc })).status).toBe(200);
    expect(await zadnje(t.tenant.id)).toBe(prije);
  });

  it('staro vrijeme (> 60 s) se osvježava', async () => {
    const t = await napraviTenanta({ certifikat: false });
    await postavi(t.tenant.id, `datetime('now', '-2 minutes')`);
    const prije = await zadnje(t.tenant.id);
    expect((await poziv('/api/v1/racun', { kljuc: t.kljuc })).status).toBe(200);
    expect(await zadnje(t.tenant.id)).not.toBe(prije);
  });
});
