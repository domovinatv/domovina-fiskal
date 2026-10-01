import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRacun, getRacunKontekst } from '../src/db';
import { posaljiRacunEmailom } from '../src/email';
import { stornoOpis } from '../src/pdf/racun-pdf';
import { sweepNaknadnaDostava } from '../src/fiskal/fiskalizacija';
import { b2cTijelo, json, napraviTenanta, poziv, slijed, testEnv, type TestniTenant } from './pomocno/okolina';
import { cisNedostupan, cisVracaJir } from './pomocno/cis-mock';

const db = testEnv.DB;

async function izdaj(t: TestniTenant, dodatno: Record<string, unknown> = {}) {
  const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, dodatno)) });
  expect(r.status).toBe(201);
  return json(r);
}

const storno = (t: TestniTenant, id: number, tijelo: Record<string, unknown> = {}) =>
  poziv(`/api/v1/racun/${id}/storno`, { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(tijelo) });

describe('Storno (POST /racun/:id/storno)', () => {
  let poslano: string[];
  beforeEach(() => {
    poslano = cisVracaJir();
  });

  it('cijeli: negativne cijene, isti iznos s minusom, original → storniran, fiskaliziran s negativnim iznosom', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t); // 2×40 + 4 = 84 + 25 % = 105.00
    const r = await storno(t, original.id, { vanjskaReferenca: 'CRO-1-povrat' });
    expect(r.status).toBe(201);
    const s = await json(r);
    expect(s.stornoZaId).toBe(original.id);
    expect(s.iznosi.iznosSPdv).toBe('-105.00');
    expect(s.stavke.map((x: { netoCijena: string; kolicina: string }) => [x.netoCijena, x.kolicina])).toEqual([['-40.00', '2'], ['-4.00', '1']]);
    expect(s.jir).toBeTruthy();
    expect(poslano.at(-1)).toContain('<tns:IznosUkupno>-105.00</tns:IznosUkupno>');
    expect(poslano.at(-1)).toContain('<tns:NacinPlac>K</tns:NacinPlac>');
    expect((await getRacun(db, t.tenant.id, original.id))!.status).toBe('storniran');
    // Ponovljeni zahtjev (Stripe retry) → isti storno, bez novog broja.
    const ponovno = await storno(t, original.id, { vanjskaReferenca: 'CRO-1-povrat' });
    expect(ponovno.status).toBe(200);
    expect((await json(ponovno)).id).toBe(s.id);
  });

  it('dvostruki storno (druga referenca) → 409', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t);
    expect((await storno(t, original.id, { vanjskaReferenca: 'A' })).status).toBe(201);
    const drugi = await storno(t, original.id, { vanjskaReferenca: 'B' });
    expect(drugi.status).toBe(409);
    expect((await json(drugi)).greska).toMatch(/već u cijelosti storniran/);
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 2, sekvenca: 2 });
  });

  it('djelomični: stavke [{redak, kolicina}]; zbroj storna ≤ original; kad dosegne puni iznos → storniran', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t);
    const prvi = await storno(t, original.id, { vanjskaReferenca: 'P1', stavke: [{ redak: 1, kolicina: 1 }] });
    expect(prvi.status).toBe(201);
    expect((await json(prvi)).iznosi.iznosSPdv).toBe('-50.00');
    expect((await getRacun(db, t.tenant.id, original.id))!.status).toBe('fiskaliziran');
    // Prevelika količina na retku → 400; preostali iznos se ne smije premašiti → 409.
    expect((await storno(t, original.id, { stavke: [{ redak: 1, kolicina: 3 }] })).status).toBe(400);
    const preko = await storno(t, original.id, { vanjskaReferenca: 'P2', stavke: [{ redak: 1, kolicina: 2 }, { redak: 2 }] });
    expect(preko.status).toBe(409);
    expect((await json(preko)).greska).toMatch(/premašuje preostali iznos/);
    // Ostatak (1×40 + 4) = 55.00 → original postaje storniran.
    const drugi = await storno(t, original.id, { vanjskaReferenca: 'P3', stavke: [{ redak: 1, kolicina: 1 }, { redak: 2 }] });
    expect(drugi.status).toBe(201);
    expect((await json(drugi)).iznosi.iznosSPdv).toBe('-55.00');
    expect((await getRacun(db, t.tenant.id, original.id))!.status).toBe('storniran');
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 3, max: 3, sekvenca: 3 });
  });

  it('storno nefiskalnog dokumenta → 400; nepostojećeg → 404; storno storna → 400', async () => {
    const t = await napraviTenanta();
    const ponuda = await json(
      await poziv('/api/v1/racun', {
        method: 'POST', kljuc: t.kljuc,
        body: JSON.stringify({ tip: 'RACUN', poslovniProstor: 'WEB', naplatniUredaj: '1', stavke: [{ naziv: 'X', netoCijena: '10', pdvStopa: '25' }] }),
      }),
    );
    expect((await storno(t, ponuda.id)).status).toBe(400);
    expect((await storno(t, 999_999)).status).toBe(404);
    const original = await izdaj(t);
    const s = await json(await storno(t, original.id, { stavke: [{ redak: 2 }] }));
    expect((await storno(t, s.id)).status).toBe(400);
    // I kroz POST /racun sa stornoZaId vrijede ista pravila.
    const krozRacun = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stornoZaId: ponuda.id })) });
    expect(krozRacun.status).toBe(400);
  });

  it('storno s pozitivnim iznosom kroz POST /racun → 400', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t);
    const r = await poziv('/api/v1/racun', { method: 'POST', kljuc: t.kljuc, body: JSON.stringify(b2cTijelo(t, { stornoZaId: original.id })) });
    expect(r.status).toBe(400);
    expect((await json(r)).greska).toMatch(/negativan ukupni iznos/);
  });

  it('utrka dva puna storna s različitim referencama → jedan 201, drugi 409, bez rupe u slijedu', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t);
    const [a, b] = await Promise.all([storno(t, original.id, { vanjskaReferenca: 'U1' }), storno(t, original.id, { vanjskaReferenca: 'U2' })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await slijed(t.tenant.id)).toMatchObject({ n: 2, max: 2, sekvenca: 2 });
  });

  it('trigger 0009: upis storna preko iznosa ili na storniran original pada (mreža ispod aplikacije)', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t);
    const umetni = (iznos: string) =>
      db
        .prepare(
          `INSERT INTO racun (tenant_id, poslovni_prostor_id, naplatni_uredaj_id, sekvenca_vrsta, oznaka_slijednosti,
                              datum_vrijeme, tip_dokumenta, iznos_s_pdv, storno_racun_id, status)
           SELECT tenant_id, poslovni_prostor_id, naplatni_uredaj_id, 'fiskalni', 'P', datetime('now'), 'fiskalni_b2c', ?, id, 'izdano'
           FROM racun WHERE id = ?`,
        )
        .bind(iznos, original.id)
        .run();
    await expect(umetni('-105.01')).rejects.toThrow(/STORNO: zbroj storna premašuje/);
    await umetni('-105.00');
    expect((await getRacun(db, t.tenant.id, original.id))!.status).toBe('storniran');
    await expect(umetni('-0.01')).rejects.toThrow(/STORNO: original je već storniran/);
  });

  it('storniran original bez JIR-a i dalje ide u naknadnu dostavu', async () => {
    const t = await napraviTenanta();
    cisNedostupan();
    const original = await izdaj(t);
    expect(original.jir).toBeNull();
    expect((await storno(t, original.id)).status).toBe(201);
    expect((await getRacun(db, t.tenant.id, original.id))!.status).toBe('storniran');
    await db.prepare(`UPDATE racun SET fiskal_zadnji_pokusaj = datetime('now', '-2 hours') WHERE tenant_id = ?`).bind(t.tenant.id).run();
    cisVracaJir();
    await sweepNaknadnaDostava(testEnv);
    const r = (await getRacun(db, t.tenant.id, original.id))!;
    expect(r.jir).toBeTruthy();
    expect(r.status).toBe('storniran');
  });

  it('PDF i e-mail storna navode „Storno računa br. X od DD.MM.GGGG."', async () => {
    const t = await napraviTenanta();
    const original = await izdaj(t);
    const s = await json(await storno(t, original.id));
    const k = (await getRacunKontekst(db, t.tenant.id, s.id))!;
    expect(k.stornoOriginal?.broj).toBe(original.brojRacuna);
    const ocekivano = stornoOpis(k.stornoOriginal!);
    expect(ocekivano).toMatch(/^Storno računa br\. 1\/WEB\/1 od \d{2}\.\d{2}\.\d{4}\.$/);
    expect(stornoOpis({ broj: '7/WEB/1', datumVrijeme: '2026-07-15T22:30:00.000Z' })).toBe('Storno računa br. 7/WEB/1 od 16.07.2026.');
    const send = vi.fn(async (_p: { text: string }) => ({}));
    await posaljiRacunEmailom({ EMAIL: { send } }, k, new Uint8Array([37, 80, 68, 70]), 'kupac@primjer.hr');
    expect(send.mock.calls[0][0].text).toContain(ocekivano);
    const pdf = await poziv(`/api/v1/racun/${s.id}/pdf`, { kljuc: t.kljuc });
    expect(pdf.status).toBe(200);
  });
});
