// Prije svake testne datoteke: D1 migracije (idempotentno) + zaštita da nijedan
// test ne pozove pravi CIS (transport baca dok ga test ne zamijeni mockom).
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';
import { postaviCisTransport } from '../../src/fiskal/cis';

await applyD1Migrations(env.DB, env.TEST_MIGRACIJE);

export const zabranjenCis = async (): Promise<never> => {
  throw new Error('Pravi CIS je u testovima zabranjen — postavi mock (test/pomocno/cis-mock.ts)');
};

beforeEach(() => postaviCisTransport(zabranjenCis));
