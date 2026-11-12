import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './types';
import { admin } from './admin/app';
import { apiV1 } from './api';
import { brojaci, dohvatiStanje, racuniBezJiraStarijiOd } from './db';
import { obradiAlarme, provjeriCisEcho } from './alarmi';
import { okolinaIzEnv, sweepNaknadnaDostava } from './fiskal/fiskalizacija';
import { layout } from './admin/views';
import { escapeHtml } from './util';

const app = new Hono<{ Bindings: Env }>();

// K9: neuhvaćena iznimka (D1 greška, bug) → JSON na API-ju, HTML u adminu,
// umjesto Honoovog plain-text „Internal Server Error”. Klijent dobiva samo id;
// detalji (poruka, stack) idu u log pod istim id-em. Sub-appovi (admin, apiV1)
// nemaju vlastiti onError, pa njihove iznimke stižu ovdje.
app.onError((greska, c) => {
  if (greska instanceof HTTPException) return greska.getResponse(); // namjerni HTTP odgovor (Hono middleware)
  const id = crypto.randomUUID();
  const tenant = (c as unknown as { get(k: string): { id?: number } | undefined }).get('tenant');
  console.error(
    `[greška ${id}] ${c.req.method} ${c.req.path}${tenant?.id ? ` tenant=${tenant.id}` : ''}:`,
    greska instanceof Error ? (greska.stack ?? greska.message) : String(greska),
  );
  if (c.req.path === '/admin' || c.req.path.startsWith('/admin/')) {
    return c.html(
      layout(
        'Greška — DOMOVINA Fiskal',
        `<h1>Interna greška</h1><p>Nešto je pošlo po zlu. Oznaka greške za log: <code>${escapeHtml(id)}</code></p><p><a href="/admin">← natrag</a></p>`,
      ),
      500,
    );
  }
  return c.json({ greska: 'Interna greška', id }, 500);
});

// Health / info.
app.get('/', async (c) => {
  const counts = await brojaci(c.env.DB).catch(() => ({ tenanti: -1, racuni: -1 }));
  return c.json({
    servis: 'fiskal.domovina.ai',
    svrha: 'open-source SaaS za izdavanje HR fiskaliziranih računa — B2C fiskalizacija (ZKI/JIR, CIS), eRačun 2.0 preko posrednika',
    okolinaFiskalizacije: c.env.OKOLINA,
    admin: '/admin',
    api: {
      izdaj: 'POST /api/v1/racun (PONUDA | PREDRACUN | RACUN | FISKALNI_B2C; status nacrt = skica)',
      izdajSkicu: 'POST /api/v1/racun/:id/izdaj',
      fiskaliziraj: 'POST /api/v1/racun/:id/fiskaliziraj (naknadna dostava / retry)',
      storno: 'POST /api/v1/racun/:id/storno { vanjskaReferenca?, stavke?: [{ redak, kolicina? }], napomena? }',
      idempotencija: "polje vanjskaReferenca ili zaglavlje 'Idempotency-Key' → 201 novi / 200 + Idempotent-Replay / 409",
      poReferenci: 'GET /api/v1/racun?vanjskaReferenca=…',
      zdravlje: 'GET /api/v1/zdravlje (bez autentikacije; 503 = platforma) · GET /api/v1/zdravlje/backlog (503 = računi bez JIR-a > 24 h)',
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
// tenantima (samo zbirni brojevi). Registrirano prije /api/v1 da ga Bearer
// middleware ne presretne.
//
// K10: 503 samo kad PLATFORMA ne radi (CIS echo, sweep). Backlog tenanata
// (računi bez JIR-a > 24 h) ima vlasnika i alarm mailom, pa ne smije držati
// globalni 503 danima; vidi se u tijelu, a tko ga baš želi nadzirati koristi
// /api/v1/zdravlje/backlog (503 dok backlog postoji).
async function backlog(db: D1Database) {
  const bezJira = await racuniBezJiraStarijiOd(db, 24);
  return { racunaBezJira24h: bezJira.reduce((n, g) => n + g.broj, 0), obveznikaSBacklogom: bezJira.length };
}

app.get('/api/v1/zdravlje', async (c) => {
  const [stanje, b] = await Promise.all([dohvatiStanje(c.env.DB), backlog(c.env.DB)]);
  const zadnjiOk = stanje.cis_echo_zadnji_ok?.vrijednost ?? null;
  const zadnjiPokusaj = stanje.cis_echo_zadnji_pokusaj?.vrijednost ?? null;
  const cisOk = !!zadnjiOk && !!zadnjiPokusaj && Date.parse(zadnjiPokusaj) - Date.parse(zadnjiOk) <= 3_600_000;
  const sweep = stanje.sweep_zadnji?.vrijednost ? (JSON.parse(stanje.sweep_zadnji.vrijednost) as Record<string, unknown>) : null;
  const sweepSvjez = !!sweep && Date.now() - Date.parse(String(sweep.kada)) < 40 * 60_000; // cron je */15
  const ok = cisOk && sweepSvjez;
  return c.json(
    {
      ok,
      okolina: okolinaIzEnv(c.env),
      cisEcho: { ok: cisOk, zadnjiOk, zadnjiPokusaj, posluziteljCertNotAfter: stanje.cis_posluzitelj_cert_not_after?.vrijednost ?? null },
      sweepZadnji: sweep,
      ...b,
    },
    ok ? 200 : 503,
  );
});

app.get('/api/v1/zdravlje/backlog', async (c) => {
  const b = await backlog(c.env.DB);
  const ok = b.racunaBezJira24h === 0;
  return c.json({ ok, ...b }, ok ? 200 : 503);
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
