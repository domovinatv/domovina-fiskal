// Korisnički (dashboard) put javnog API-ja: GoTrue JWT + X-Tenant-Id.
// GoTrue se mocka preko globalnog fetch-a (verificirajGotrueToken delegira na
// GET /auth/v1/user). K5: bind po e-mailu samo uz potvrđenu adresu.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKorisnikTenant } from '../src/db';
import { json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';

const db = testEnv.DB;

// Svaki test dobiva jedinstven token (cache u gotrue.ts je po tokenu).
function noviToken(): string {
  const dio = () => btoa(crypto.randomUUID()).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `eyJ${dio()}.${dio()}.${dio()}`;
}

function mockGotrue(korisnik: { id: string; email: string; email_confirmed_at?: string | null }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (ulaz) => {
    const url = typeof ulaz === 'string' ? ulaz : ulaz instanceof URL ? ulaz.href : ulaz.url;
    if (url.endsWith('/auth/v1/user')) return Response.json(korisnik);
    throw new Error(`neočekivan fetch u testu: ${url}`);
  });
}

const zaglavlja = (token: string, tenantId?: number) => ({
  Authorization: `Bearer ${token}`,
  ...(tenantId ? { 'X-Tenant-Id': String(tenantId) } : {}),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('K5: bind po e-mailu traži potvrđenu adresu', () => {
  it('nepotvrđen e-mail vlasnika → 403, redak ostaje nevezan, tenant se ne vidi u /moji-tenanti', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const email = `vlasnik-${crypto.randomUUID()}@primjer.hr`;
    const kt = await createKorisnikTenant(db, t.tenant.id, { userEmail: email, uloga: 'vlasnik' });
    mockGotrue({ id: crypto.randomUUID(), email, email_confirmed_at: null });
    const token = noviToken();

    const r = await poziv('/api/v1/racun', { headers: zaglavlja(token, t.tenant.id) });
    expect(r.status).toBe(403);
    expect((await json(r)).greska).toMatch(/potvrdi/i);
    const red = await db.prepare('SELECT user_id FROM korisnik_tenant WHERE id = ?').bind(kt.id).first<{ user_id: string | null }>();
    expect(red!.user_id).toBeNull();

    const moji = await json(await poziv('/api/v1/moji-tenanti', { headers: zaglavlja(token) }));
    expect(moji.tenanti).toEqual([]);
  });

  it('potvrđen e-mail → 200 i bind; nakon toga match po user_id i bez potvrde', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const email = `vlasnik-${crypto.randomUUID()}@primjer.hr`;
    const kt = await createKorisnikTenant(db, t.tenant.id, { userEmail: email, uloga: 'vlasnik' });
    const sub = crypto.randomUUID();
    mockGotrue({ id: sub, email: email.toUpperCase(), email_confirmed_at: '2026-11-12T10:00:00Z' });

    const r = await poziv('/api/v1/racun', { headers: zaglavlja(noviToken(), t.tenant.id) });
    expect(r.status).toBe(200);
    const red = await db.prepare('SELECT user_id FROM korisnik_tenant WHERE id = ?').bind(kt.id).first<{ user_id: string | null }>();
    expect(red!.user_id).toBe(sub);

    // Isti korisnik (sub), npr. promijenio e-mail koji još nije potvrđen: user_id match vrijedi.
    vi.restoreAllMocks();
    mockGotrue({ id: sub, email: 'novi@primjer.hr', email_confirmed_at: null });
    const token = noviToken();
    expect((await poziv('/api/v1/racun', { headers: zaglavlja(token, t.tenant.id) })).status).toBe(200);
    const moji = await json(await poziv('/api/v1/moji-tenanti', { headers: zaglavlja(token) }));
    expect(moji.tenanti.map((x: { tenantId: number }) => x.tenantId)).toEqual([t.tenant.id]);
  });

  it('nevaljan token (GoTrue 401) → 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    const r = await poziv('/api/v1/racun', { headers: zaglavlja(noviToken(), 1) });
    expect(r.status).toBe(401);
  });
});

// Korak 8 (§4): ostatak korisničkog puta.
describe('GoTrue put: tenant, uloga, cache', () => {
  async function korisnik(uloga: 'vlasnik' | 'operater') {
    const t = await napraviTenanta({ certifikat: false });
    const email = `${uloga}-${crypto.randomUUID()}@primjer.hr`;
    await createKorisnikTenant(db, t.tenant.id, { userEmail: email, uloga });
    const spy = mockGotrue({ id: crypto.randomUUID(), email, email_confirmed_at: '2026-11-12T10:00:00Z' });
    return { t, spy, token: noviToken() };
  }

  it('bez X-Tenant-Id → 400', async () => {
    const { token } = await korisnik('vlasnik');
    expect((await poziv('/api/v1/racun', { headers: zaglavlja(token) })).status).toBe(400);
  });

  it('tuđi tenant → 403', async () => {
    const { token } = await korisnik('vlasnik');
    const tudji = await napraviTenanta({ certifikat: false });
    expect((await poziv('/api/v1/racun', { headers: zaglavlja(token, tudji.tenant.id) })).status).toBe(403);
  });

  it('operater čita, ali ne mijenja postavke → 403', async () => {
    const { t, token } = await korisnik('operater');
    expect((await poziv('/api/v1/racun', { headers: zaglavlja(token, t.tenant.id) })).status).toBe(200);
    const r = await poziv('/api/v1/postavke/prostor', {
      method: 'POST',
      headers: { ...zaglavlja(token, t.tenant.id), 'Content-Type': 'application/json' },
      body: JSON.stringify({ oznaka: 'NOVI', datumPocetkaPrimjene: '2026-01-01' }),
    });
    expect(r.status).toBe(403);
  });

  it('isti token u kratkom roku → GoTrue se zove jednom (cache)', async () => {
    const { t, spy, token } = await korisnik('vlasnik');
    for (let i = 0; i < 3; i++) expect((await poziv('/api/v1/racun', { headers: zaglavlja(token, t.tenant.id) })).status).toBe(200);
    expect(spy.mock.calls.filter(([u]) => String(u instanceof Request ? u.url : u).endsWith('/auth/v1/user'))).toHaveLength(1);
  });
});
