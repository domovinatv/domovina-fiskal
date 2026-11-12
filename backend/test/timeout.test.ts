// K6: vanjski fetch pozivi imaju timeout (AbortSignal.timeout), a poruka greške
// razlikuje timeout od HTTP greške.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verificirajGotrueToken } from '../src/auth/gotrue';
import { DokuKlijent } from '../src/eracun/doku';
import { fetchSTimeoutom, TIMEOUT_MS } from '../src/util';
import { testEnv } from './pomocno/okolina';

// fetch koji nikad ne odgovori — odbije tek kad signal abortira (kao pravi fetch).
function fetchKojiVisi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_u, init) =>
      new Promise((_ok, ne) => {
        const s = init?.signal;
        if (!s) return; // bez signala bi visio zauvijek — test bi pao na timeoutu
        s.addEventListener('abort', () => ne(s.reason));
      }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('K6: timeouti vanjskih poziva', () => {
  it('fetchSTimeoutom: zaglavljen upstream → greška s „timeout” i nazivom servisa', async () => {
    fetchKojiVisi();
    await expect(fetchSTimeoutom('Resend', 'https://primjer.hr', {}, 20)).rejects.toThrow(/Resend.*timeout/);
  });

  it('fetchSTimeoutom: HTTP greška nije timeout — Response se vraća pozivatelju', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', { status: 503 }));
    const r = await fetchSTimeoutom('VIES', 'https://primjer.hr', {}, 1000);
    expect(r.status).toBe(503);
  });

  it('GoTrue i doku šalju signal (svaki poziv ima timeout)', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    await verificirajGotrueToken({ ...testEnv, SUPABASE_URL: 'https://gotrue.primjer.hr' }, `t-${crypto.randomUUID()}`);
    await new DokuKlijent('a', 's', 'test').dohvatiStatus(1);
    expect(mock).toHaveBeenCalledTimes(2);
    for (const [, init] of mock.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('vrijednosti timeouta po servisu (§3 K6)', () => {
    expect(TIMEOUT_MS).toEqual({ gotrue: 5_000, doku: 20_000, resend: 15_000, registar: 10_000, firecrawl: 70_000 });
  });
});
