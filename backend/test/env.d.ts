// Tipovi `env` iz cloudflare:test — bindingi workera + testni bindingi iz vitest.config.ts.
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env as WorkerEnv } from '../src/types';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRACIJE: D1Migration[];
    }
  }
}
