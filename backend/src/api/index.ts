// Javni Bearer API — /api/v1/*. CORS i autentikacija (auth.ts) idu prije
// svih ruta; rute su po domeni: dokumenti, katalog, korisnik + postavke.
// Vidi docs/knowledge/16-dashboard-sso.md.

import { Hono } from 'hono';
import { apiAuth, apiCors } from './auth';
import { katalogRute } from './katalog';
import { postavkeRute } from './postavke';
import { racuniRute } from './racuni';
import type { ApiHono } from './tipovi';

export const apiV1 = new Hono<ApiHono>();

// CORS MORA prije autha da preflight (OPTIONS bez Authorization) prođe.
apiV1.use('*', apiCors);
apiV1.use('*', apiAuth);

apiV1.route('/', postavkeRute);
apiV1.route('/', racuniRute);
apiV1.route('/', katalogRute);
