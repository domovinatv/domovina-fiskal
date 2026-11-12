// K9: neuhvaćena iznimka → JSON 500 na /api/v1, HTML 500 na /admin, uz id
// koji se nalazi i u logu (da se iz prijave klijenta nađe zapis).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';
import { adminSkripta, napraviTenanta, poziv, testEnv } from './pomocno/okolina';

// D1 koji baca na svaki upit — simulira grešku baze / bug.
const pokvarenaBaza = {
  prepare() {
    throw new Error('D1_ERROR: simulirana greška baze');
  },
  batch() {
    throw new Error('D1_ERROR: simulirana greška baze');
  },
} as unknown as D1Database;
const env: Env = { ...testEnv, DB: pokvarenaBaza };

afterEach(() => vi.restoreAllMocks());

describe('K9: globalni onError', () => {
  it('API → JSON 500 { greska, id }, id u logu s metodom i putanjom', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await poziv('/api/v1/racun', { kljuc: t.kljuc, env });
    expect(r.status).toBe(500);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    const tijelo = (await r.json()) as { greska: string; id: string };
    expect(tijelo.greska).toBe('Interna greška');
    expect(tijelo.id).toMatch(/^[0-9a-f-]{36}$/);
    const zapis = log.mock.calls.map((a) => a.map(String).join(' ')).join('\n');
    expect(zapis).toContain(tijelo.id);
    expect(zapis).toContain('GET /api/v1/racun');
    expect(zapis).toContain('simulirana greška baze');
    expect(JSON.stringify(tijelo)).not.toContain('simulirana'); // detalji ne idu klijentu
  });

  it('admin → HTML 500 s id-em', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await poziv('/admin', { env, headers: { Authorization: adminSkripta() } });
    expect(r.status).toBe(500);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const html = await r.text();
    const id = log.mock.calls.map((a) => a.map(String).join(' ')).join('\n').match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
    expect(id).toBeTruthy();
    expect(html).toContain(id!);
    expect(html).not.toContain('simulirana');
  });
});
