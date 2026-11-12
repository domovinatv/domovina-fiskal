// Katalog proizvoda i KPD 2025 pretraga.

import { Hono } from 'hono';
import { listProizvodi, searchKpd } from '../db';
import { formatirajGreske } from '../validacija';
import { cijeliBroj } from './pomocno';
import type { ApiHono } from './tipovi';

export const katalogRute = new Hono<ApiHono>();

// ── Proizvodi (katalog) + KPD pretraga ──

katalogRute.get('/proizvod', async (c) => {
  const proizvodi = await listProizvodi(c.env.DB, c.get('tenant').id);
  return c.json({
    proizvodi: proizvodi.map((p) => ({
      id: p.id, naziv: p.naziv, sifra: p.sifra, jedinicaMjere: p.jedinica_mjere,
      netoCijena: p.neto_cijena, pdvStopa: p.pdv_stopa, pdvKategorija: p.pdv_kategorija,
      kpd: p.kpd, aktivan: !!p.aktivan,
    })),
  });
});

katalogRute.get('/kpd', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.trim().length < 2) return c.json({ greska: "Parametar 'q' mora imati barem 2 znaka" }, 400);
  const l = cijeliBroj('limit', 1, 100, 20).safeParse(c.req.query('limit'));
  if (!l.success) return c.json({ greska: 'Validacija nije prošla', detalji: formatirajGreske(l.error).map((g) => ({ ...g, polje: 'limit' })) }, 400);
  return c.json({ rezultati: await searchKpd(c.env.DB, q, l.data) });
});
