import { Hono } from 'hono';
import type { Env } from './types';
import { admin } from './admin/app';
import { apiV1 } from './api/racuni';
import { brojaci } from './db';

const app = new Hono<{ Bindings: Env }>();

// Health / info.
app.get('/', async (c) => {
  const counts = await brojaci(c.env.DB).catch(() => ({ tenanti: -1, racuni: -1 }));
  return c.json({
    servis: 'fiskal.domovina.ai',
    svrha: 'open-source SaaS za izdavanje HR (fiskaliziranih) računa — faza 0: skela',
    admin: '/admin',
    api: {
      izdaj: 'POST /api/v1/racun',
      dohvat: 'GET /api/v1/racun/:id',
      popis: 'GET /api/v1/racun',
      auth: 'Bearer <API ključ>',
    },
    brojaci: counts,
  });
});

app.route('/admin', admin);
app.route('/api/v1', apiV1);

export default app;
