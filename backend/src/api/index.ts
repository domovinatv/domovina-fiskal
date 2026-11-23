// Javni Bearer API — /api/v1/*. CORS i autentikacija (auth.ts) idu prije
// svih ruta; rute su po domeni: dokumenti, katalog, korisnik + postavke.
// Vidi docs/knowledge/16-dashboard-sso.md.

import { Hono } from 'hono';
import { sinkronizirajTenanta } from '../backup/tenant';
import { passkeyRute } from './app-auth';
import { apiAuth, apiCors } from './auth';
import { clanoviRute } from './clanovi';
import { katalogRute } from './katalog';
import { postavkeRute } from './postavke';
import { racuniRute } from './racuni';
import type { ApiHono } from './tipovi';

export const apiV1 = new Hono<ApiHono>();

// CORS MORA prije autha da preflight (OPTIONS bez Authorization) prođe.
apiV1.use('*', apiCors);
apiV1.use('*', apiAuth);

// BYO backup (src/backup/tenant.ts): nakon uspješne izmjene pošalji promijenjene
// račune tenanta u njegov R2. waitUntil — odgovor klijentu ne čeka backup.
apiV1.use('*', async (c, next) => {
  await next();
  const tenant = c.get('tenant');
  if (c.req.method !== 'GET' && c.req.method !== 'OPTIONS' && c.res.status < 400 && tenant) {
    c.executionCtx.waitUntil(sinkronizirajTenanta(c.env, tenant.id).catch((e) => console.error('backup tenanta', e)));
  }
});

apiV1.route('/', postavkeRute);
apiV1.route('/', racuniRute);
apiV1.route('/', katalogRute);
apiV1.route('/', passkeyRute);
apiV1.route('/', clanoviRute);
