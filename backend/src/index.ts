import { Hono } from 'hono';
import type { Env } from './types';
import { admin } from './admin/app';
import { apiV1 } from './api/racuni';
import { brojaci } from './db';
import { sweepNaknadnaDostava } from './fiskal/fiskalizacija';

const app = new Hono<{ Bindings: Env }>();

// Health / info.
app.get('/', async (c) => {
  const counts = await brojaci(c.env.DB).catch(() => ({ tenanti: -1, racuni: -1 }));
  return c.json({
    servis: 'fiskal.domovina.ai',
    svrha: 'open-source SaaS za izdavanje HR fiskaliziranih računa — faza 2: B2C fiskalizacija (ZKI/JIR, CIS)',
    okolinaFiskalizacije: c.env.OKOLINA,
    admin: '/admin',
    api: {
      izdaj: 'POST /api/v1/racun (PONUDA | PREDRACUN | RACUN | FISKALNI_B2C; status nacrt = skica)',
      izdajSkicu: 'POST /api/v1/racun/:id/izdaj',
      fiskaliziraj: 'POST /api/v1/racun/:id/fiskaliziraj (naknadna dostava / retry)',
      dohvat: 'GET /api/v1/racun/:id',
      pdf: 'GET /api/v1/racun/:id/pdf',
      posalji: 'POST /api/v1/racun/:id/posalji',
      popis: 'GET /api/v1/racun',
      proizvodi: 'GET /api/v1/proizvod',
      kpd: 'GET /api/v1/kpd?q=…',
      mojiTenanti: 'GET /api/v1/moji-tenanti (samo korisnički JWT)',
      postavke: 'GET /api/v1/postavke · POST /api/v1/postavke/{prostor|uredjaj|operater}',
      auth: "Bearer <dfk_ API ključ> ILI Bearer <GoTrue JWT> + 'X-Tenant-Id' (dashboard)",
    },
    brojaci: counts,
  });
});

app.route('/admin', admin);
app.route('/api/v1', apiV1);

export default {
  fetch: app.fetch,
  // Cron sweep naknadne dostave: izdani fiskalni računi bez JIR-a (CIS bio
  // nedostupan) šalju se ponovno s NakDost=true — rok je 2 RADNA dana (čl. 21).
  async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      sweepNaknadnaDostava(env).then((r) => {
        if (r.pokusano) console.log(`naknadna dostava: ${r.uspjelo}/${r.pokusano} dobilo JIR`);
      }),
    );
  },
};
