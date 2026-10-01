import { Hono } from 'hono';
import type { Env } from './types';
import { admin } from './admin/app';
import { apiV1 } from './api/racuni';
import { brojaci, dohvatiStanje, racuniBezJiraStarijiOd } from './db';
import { obradiAlarme, provjeriCisEcho } from './alarmi';
import { okolinaIzEnv, sweepNaknadnaDostava } from './fiskal/fiskalizacija';

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
      posaljiEracun: 'POST /api/v1/racun/:id/posalji-eracun (eRačun 2.0 preko doku-a)',
      eracunStatus: 'GET /api/v1/racun/:id/eracun-status',
      provjeriPrimatelja: 'POST /api/v1/eracun/provjeri-primatelja { oib }',
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

// Zdravlje za vanjski monitoring — BEZ autentikacije i bez podataka o
// tenantima (samo zbirni brojevi). 503 kad nešto traži pažnju. Registrirano
// prije /api/v1 da ga Bearer middleware ne presretne.
app.get('/api/v1/zdravlje', async (c) => {
  const [stanje, bezJira] = await Promise.all([dohvatiStanje(c.env.DB), racuniBezJiraStarijiOd(c.env.DB, 24)]);
  const zadnjiOk = stanje.cis_echo_zadnji_ok?.vrijednost ?? null;
  const zadnjiPokusaj = stanje.cis_echo_zadnji_pokusaj?.vrijednost ?? null;
  const cisOk = !!zadnjiOk && !!zadnjiPokusaj && Date.parse(zadnjiPokusaj) - Date.parse(zadnjiOk) <= 3_600_000;
  const sweep = stanje.sweep_zadnji?.vrijednost ? (JSON.parse(stanje.sweep_zadnji.vrijednost) as Record<string, unknown>) : null;
  const sweepSvjez = !!sweep && Date.now() - Date.parse(String(sweep.kada)) < 40 * 60_000; // cron je */15
  const racunaBezJira24h = bezJira.reduce((n, g) => n + g.broj, 0);
  const ok = cisOk && sweepSvjez && racunaBezJira24h === 0;
  return c.json(
    {
      ok,
      okolina: okolinaIzEnv(c.env),
      cisEcho: { ok: cisOk, zadnjiOk, zadnjiPokusaj },
      sweepZadnji: sweep,
      racunaBezJira24h,
    },
    ok ? 200 : 503,
  );
});

app.route('/admin', admin);
app.route('/api/v1', apiV1);

export default {
  fetch: app.fetch,
  // Cron (Faza 4.2):
  //   */15 — CIS echo, sweep naknadne dostave (NakDost=true, rok 2 RADNA dana,
  //          čl. 21.), pa alarmi koji ovise o sweepu;
  //   0 6  — dnevni alarmi (istek certifikata tenanata i poslužitelja CIS-a).
  async scheduled(ctrl: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(izvediCron(ctrl.cron, env));
  },
};

export async function izvediCron(cron: string, env: Env): Promise<void> {
  if (cron === '0 6 * * *') {
    const poslani = await obradiAlarme(env, { dnevno: true });
    if (poslani.length) console.log(`dnevni alarmi: ${poslani.join(', ')}`);
    return;
  }
  await provjeriCisEcho(env);
  const r = await sweepNaknadnaDostava(env);
  if (r.pokusano || r.zaustavljeno.length) {
    console.log(`naknadna dostava: ${r.uspjelo}/${r.pokusano} dobilo JIR; zaustavljeno ${r.zaustavljeno.length}`);
  }
  const poslani = await obradiAlarme(env);
  if (poslani.length) console.log(`alarmi: ${poslani.join(', ')}`);
}
