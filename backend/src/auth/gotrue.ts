// Verifikacija GoTrue JWT-a DELEGACIJOM na `GET /auth/v1/user` (dijeljeni
// Supabase/GoTrue na api.domovina.ai). Namjerno NE verificiramo HS256 potpis
// lokalno — to bi tražilo kopiju JWT_SECRET-a u ovaj Worker (blast-radius), a
// delegacija je uz to autoritativna (poštuje logout/ban). Asimetrični JWT +
// JWKS je kasniji end-state — vidi docs/knowledge/16-dashboard-sso.md §8.

import type { Env } from '../types';

export interface GotrueKorisnik {
  sub: string; // GoTrue user id (uuid)
  email: string;
}

// In-memory cache po tokenu (~60 s) — štedi mrežni hop na svaki API poziv.
// Živi po izolatu Workera; logout/ban se propagira najkasnije za TTL.
const TTL_MS = 60_000;
const MAX_UNOSA = 500;
const cache = new Map<string, { korisnik: GotrueKorisnik; istjeceMs: number }>();

// Vraća korisnika za valjan token, null za odbijen/nevaljan token.
// Mrežne greške prema GoTrue-u propagiraju kao iznimka (pozivatelj → 502).
export async function verificirajGotrueToken(env: Env, token: string): Promise<GotrueKorisnik | null> {
  const sad = Date.now();
  const pogodak = cache.get(token);
  if (pogodak && pogodak.istjeceMs > sad) return pogodak.korisnik;

  const odgovor = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!odgovor.ok) {
    cache.delete(token);
    return null;
  }
  const tijelo = (await odgovor.json()) as { id?: string; email?: string };
  if (!tijelo.id || !tijelo.email) return null;

  const korisnik: GotrueKorisnik = { sub: tijelo.id, email: tijelo.email };
  if (cache.size >= MAX_UNOSA) cache.clear(); // primitivna zaštita od rasta
  cache.set(token, { korisnik, istjeceMs: sad + TTL_MS });
  return korisnik;
}
