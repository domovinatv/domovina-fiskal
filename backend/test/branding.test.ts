// Izgled PDF računa po tenantu (src/pdf/branding.ts, migracija 0017):
// spremanje/validacija kroz /postavke/branding, pregled i da PDF računa
// stvarno nosi logo tenanta.
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';
import { adminSkripta, b2cTijelo, json, napraviTenanta, poziv, testEnv } from './pomocno/okolina';
import { cisVracaJir } from './pomocno/cis-mock';

// 32×32 PNG (crveni kvadrat)
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALElEQVR42u3NQQEAQAQAMC6BJPpHEOtK8NsKLKc6Lr04JhAIBAKBQCAQCLZ8+DEBRi6DaHEAAAAASUVORK5CYII=';

const put = (kljuc: string, tijelo: unknown) =>
  poziv('/api/v1/postavke/branding', { method: 'PUT', kljuc, body: JSON.stringify(tijelo) });

// Broj slika (XObject /Image) na prvoj stranici PDF-a.
async function slikeNaPrvojStranici(r: Response): Promise<number> {
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toContain('application/pdf');
  const doc = await PDFDocument.load(new Uint8Array(await r.arrayBuffer()));
  const resursi = doc.getPage(0).node.Resources();
  const xo = resursi?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xo) return 0;
  return xo.keys().filter((k) => {
    const o = xo.lookup(k) as { dict?: PDFDict };
    return o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image';
  }).length;
}

describe('branding PDF-a', () => {
  beforeEach(() => {
    cisVracaJir();
  });

  it('bez brandinga: prazne vrijednosti, PDF bez slike', async () => {
    const t = await napraviTenanta();
    const b = await json(await poziv('/api/v1/postavke/branding', { kljuc: t.kljuc }));
    expect(b).toMatchObject({ boja: null, podnozje: null, logo: null });
    const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    expect(await slikeNaPrvojStranici(await poziv(`/api/v1/racun/${r.id}/pdf`, { kljuc: t.kljuc }))).toBe(0);
  });

  it('spremi boju, podnožje i logo (data URL); PDF računa nosi logo', async () => {
    const t = await napraviTenanta();
    const r1 = await put(t.kljuc, { boja: 'c8102e', podnozje: '  www.primjer.hr ·\n +385 1 234 5678 ', logo: `data:image/png;base64,${PNG}` });
    const b = await json(r1);
    expect(r1.status, JSON.stringify(b)).toBe(200);
    expect(b.boja).toBe('#C8102E');
    expect(b.podnozje).toBe('www.primjer.hr · +385 1 234 5678');
    expect(b.logo).toBe(`data:image/png;base64,${PNG}`);

    const r = await json(await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t)) }));
    expect(await slikeNaPrvojStranici(await poziv(`/api/v1/racun/${r.id}/pdf`, { kljuc: t.kljuc }))).toBe(1);
  });

  it('PUT bez loga ne briše spremljeni logo; logo: null ga briše', async () => {
    const t = await napraviTenanta();
    await put(t.kljuc, { boja: '#002F6C', logo: PNG });
    const b = await json(await put(t.kljuc, { boja: '#197D4A' }));
    expect(b.boja).toBe('#197D4A');
    expect(b.logo).toContain(PNG);
    expect((await json(await put(t.kljuc, { boja: '#197D4A', logo: null }))).logo).toBeNull();
  });

  it('validacija: boja, tip i veličina loga, duljina podnožja', async () => {
    const t = await napraviTenanta();
    expect((await put(t.kljuc, { boja: 'crvena' })).status).toBe(400);
    expect((await put(t.kljuc, { logo: btoa('GIF89a.........') })).status).toBe(400);
    expect((await put(t.kljuc, { logo: 'nije%base64' })).status).toBe(400);
    // PNG potpis, ali neispravan sadržaj — generator ga ne bi mogao ugraditi
    expect((await put(t.kljuc, { logo: btoa('\x89PNG\r\n\x1a\nsmece') })).status).toBe(400);
    const velik = btoa('\x89PNG\r\n\x1a\n' + 'x'.repeat(210 * 1024));
    expect((await put(t.kljuc, { logo: velik })).status).toBe(400);
    expect((await put(t.kljuc, { podnozje: 'a'.repeat(161) })).status).toBe(400);
    const red = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM tenant_branding WHERE tenant_id = ?').bind(t.tenant.id).first<{ n: number }>();
    expect(red!.n).toBe(0);
  });

  it('pregled: nespremljeni logo se vidi, a ništa se ne sprema', async () => {
    const t = await napraviTenanta();
    const r = await poziv('/api/v1/postavke/branding/pregled', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify({ boja: '#F2B705', logo: PNG }) });
    expect(await slikeNaPrvojStranici(r)).toBe(1);
    expect((await json(await poziv('/api/v1/postavke/branding', { kljuc: t.kljuc }))).boja).toBeNull();
  });

  it('DELETE vraća zadani izgled', async () => {
    const t = await napraviTenanta();
    await put(t.kljuc, { boja: '#C8102E', logo: PNG });
    const b = await json(await poziv('/api/v1/postavke/branding', { method: 'DELETE', kljuc: t.kljuc }));
    expect(b).toMatchObject({ boja: null, logo: null });
  });
});

describe('branding u adminu (/admin/tenant/:id/izgled)', () => {
  const ORIGIN = 'https://fiskal-test.domovina.ai';
  const pngBajtovi = () => Uint8Array.from(atob(PNG), (z) => z.charCodeAt(0));
  async function forma(putanja: string, polja: Record<string, string | Blob>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(polja)) fd.append(k, v);
    // poziv() bez Content-Type stavi JSON — multipart granicu treba prenijeti ručno.
    const zahtjev = new Request('https://x/', { method: 'POST', body: fd });
    return poziv(putanja, {
      method: 'POST',
      headers: { Authorization: adminSkripta(), Origin: ORIGIN, 'Content-Type': zahtjev.headers.get('content-type')! },
      body: await zahtjev.arrayBuffer(),
    });
  }
  const spremljeno = (tenantId: number) =>
    testEnv.DB.prepare('SELECT boja, podnozje, logo_tip FROM tenant_branding WHERE tenant_id = ?').bind(tenantId).first<{ boja: string | null; podnozje: string | null; logo_tip: string | null }>();

  it('spremi s datotekom; prikaz ima logo; bez nove datoteke logo ostaje; ukloni i obriši', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const baza = `/admin/tenant/${t.tenant.id}/izgled`;
    const r = await forma(baza, { vlastitaBoja: '1', boja: '#c8102e', podnozje: 'www.primjer.hr', logo: new File([pngBajtovi()], 'logo.png', { type: 'image/png' }) });
    expect(r.status, await r.clone().text()).toBe(303);
    expect(await spremljeno(t.tenant.id)).toEqual({ boja: '#C8102E', podnozje: 'www.primjer.hr', logo_tip: 'png' });

    const html = await (await poziv(`/admin/tenant/${t.tenant.id}`, { headers: { Authorization: adminSkripta() } })).text();
    expect(html).toContain('id="izgled"');
    expect(html).toContain(`data:image/png;base64,${PNG}`);

    // Prazan file input (preglednik ga šalje kao praznu datoteku) i bez vlastite boje.
    await forma(baza, { boja: '#c8102e', podnozje: '', logo: new File([], '', { type: 'application/octet-stream' }) });
    expect(await spremljeno(t.tenant.id)).toEqual({ boja: null, podnozje: null, logo_tip: 'png' });

    await forma(baza, { ukloniLogo: '1', podnozje: '' });
    expect((await spremljeno(t.tenant.id))!.logo_tip).toBeNull();

    expect((await forma(`${baza}/obrisi`, {})).status).toBe(303);
    expect(await spremljeno(t.tenant.id)).toBeNull();
  });

  it('pregled vraća PDF s logom i ništa ne sprema; neispravna slika je 400 s porukom', async () => {
    const t = await napraviTenanta({ certifikat: false });
    const r = await forma(`/admin/tenant/${t.tenant.id}/izgled/pregled`, { vlastitaBoja: '1', boja: '#F2B705', logo: new File([pngBajtovi()], 'l.png') });
    expect(await slikeNaPrvojStranici(r)).toBe(1);
    expect(await spremljeno(t.tenant.id)).toBeNull();

    const losa = await forma(`/admin/tenant/${t.tenant.id}/izgled`, { logo: new File([new TextEncoder().encode('GIF89a......')], 'l.gif') });
    expect(losa.status).toBe(400);
    expect(await losa.text()).toContain('Logo mora biti PNG ili JPEG');
  });
});
