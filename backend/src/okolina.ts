// Okolina fiskalizacije i eRačuna: 'test' (CIS TEST, doku test) ili 'prod'.
// Zadaje je wrangler var OKOLINA; sve što nije točno 'prod' tretira se kao
// test, da pogrešno postavljena varijabla nikad ne pošalje račun na PROD.

import type { Env } from './types';

export type Okolina = 'test' | 'prod';

export function okolinaIzEnv(env: Pick<Env, 'OKOLINA'>): Okolina {
  return env.OKOLINA === 'prod' ? 'prod' : 'test';
}
