// Testovi se izvode u workerd-u (@cloudflare/vitest-pool-workers) s lokalnim D1
// i migracijama iz migrations/ — isti runtime kao produkcija. CIS se mocka u
// testovima (test/pomocno/cis-mock.ts); nijedan test ne ide na mrežu.

import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migracije = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        remoteBindings: false,
        // TEST okolina iz wrangler.toml (OKOLINA=test, zasebna D1) — lokalno, bez deploya.
        wrangler: { configPath: './wrangler.toml', environment: 'test' },
        miniflare: {
          bindings: {
            TEST_MIGRACIJE: migracije,
            ENC_MASTER_KEY: '00'.repeat(32), // samo za testove
            // Admin prijava (docs/knowledge/20-admin-prijava.md) — samo za testove.
            ADMIN_EMAILS: 'admin@primjer.hr,Drugi@Primjer.hr',
            ADMIN_SKRIPTA_TOKEN: 'testni-skripta-token-0123456789abcdef',
            ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
            ACCESS_AUD: 'testni-aud',
            // Prijelazni Basic Auth fallback (do PROD provjere Accessa).
            ADMIN_USER: 'admin',
            ADMIN_PASS: 'test-lozinka',
            ALARM_EMAIL: 'alarmi@primjer.hr',
          },
        },
      }),
    ],
    test: {
      globalSetup: ['./test/globalni-setup.ts'],
      setupFiles: ['./test/pomocno/setup.ts'],
      testTimeout: 30_000,
    },
  };
});
