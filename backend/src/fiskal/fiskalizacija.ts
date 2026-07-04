// Orkestracija B2C fiskalizacije (faza 2): ZKI na edge-u (11-* §7 opcija A),
// slanje RacunZahtjev na CIS, parsiranje JIR/grešaka, naknadna dostava.
//
// Semantika (02-* §8): račun je pravno IZDAN sa ZKI-jem (status 'izdano');
// JIR stiže sinkrono kad CIS radi, inače naknadnom dostavom (NakDost=true,
// NOVI IdPoruke, ISTI ZKI/DatVrijeme) u roku DVA RADNA DANA (čl. 21. st. 2.).

import type { Env } from '../types';
import type { RacunKontekst } from '../db';
import {
  getAktivniCertifikat,
  getRacunKontekst,
  logPoruka,
  racuniZaNaknadnuDostavu,
  zapisiFiskalGresku,
  zapisiJir,
  zapisiZki,
} from '../db';
import { dekriptirajKljucPem } from '../kripto';
import { uCente } from '../util';
import { certPemUDerB64 } from './certifikat';
import { greskaJeRetryable, parsirajOdgovor, soapPoziv, type CisGreska, type Okolina } from './cis';
import { echoXml, soapEnvelopa, potpisiZahtjev, zahtjevXml, type CisRacun, type PotpisniMaterijal } from './xml';
import { fiskalniQrPayload, izracunajZki } from './zki';

export function okolinaIzEnv(env: Env): Okolina {
  return env.OKOLINA === 'prod' ? 'prod' : 'test';
}

export interface PotpisniKontekst extends PotpisniMaterijal {
  oibCertifikata: string | null;
  notAfter: string | null;
}

// Učitaj aktivni certifikat tenanta i dekriptiraj ključ (samo u memoriji poziva).
export async function ucitajPotpisniMaterijal(
  env: Env,
  tenantId: number,
): Promise<{ materijal: PotpisniKontekst } | { greska: string }> {
  if (!env.ENC_MASTER_KEY) return { greska: 'ENC_MASTER_KEY secret nije postavljen' };
  const okolina = okolinaIzEnv(env);
  const red = await getAktivniCertifikat(env.DB, tenantId, okolina);
  if (!red) return { greska: `Tenant nema aktivan certifikat za okolinu '${okolina}' — uploadaj P12 u adminu` };
  if (!red.kljuc_pem_encrypted || !red.kljuc_iv || !red.cert_pem) {
    return { greska: 'Certifikat je spremljen prije faze 2 (bez izvučenog ključa) — ponovno ga uploadaj s lozinkom' };
  }
  if (red.not_after && new Date(red.not_after).getTime() < Date.now()) {
    return { greska: `Certifikat je istekao ${red.not_after} — obnovi ga prije fiskalizacije` };
  }
  const privatniKljucPem = await dekriptirajKljucPem(env.ENC_MASTER_KEY, {
    kljucPemEncrypted: red.kljuc_pem_encrypted,
    kljucIv: red.kljuc_iv,
    dekWrapped: red.dek_wrapped,
    dekIv: red.dek_iv,
  });
  return {
    materijal: {
      privatniKljucPem,
      certDerB64: certPemUDerB64(red.cert_pem),
      issuerDn: red.cert_issuer ?? '',
      serialDec: red.cert_serial_dec ?? '0',
      oibCertifikata: red.oib_certifikata,
      notAfter: red.not_after,
    },
  };
}

const NACIN_PLAC_CIS: Record<string, 'G' | 'K' | 'T' | 'O'> = {
  gotovina: 'G',
  kartica: 'K',
  transakcijski: 'T',
  ostalo: 'O',
};

// RacunKontekst (D1) → CisRacun (XML model). Vraća grešku umjesto bacanja da
// pozivatelji mogu vratiti čist 4xx.
export function mapirajZaCis(k: RacunKontekst, nakDost: boolean): { cis: CisRacun } | { greska: string } {
  const r = k.racun;
  if (r.redni_broj == null || r.godina == null) return { greska: 'Račun nema dodijeljen broj (skica se ne fiskalizira)' };
  if (!k.operaterOib) return { greska: 'Fiskalni račun mora imati operatera (OibOper)' };
  const nacin = NACIN_PLAC_CIS[r.nacin_placanja ?? ''];
  if (!nacin) return { greska: `Način plaćanja '${r.nacin_placanja}' se ne može mapirati u CIS G/K/T/O` };

  // PDV raščlamba → CIS blokovi: S/AA (i Z sa stopom 0) u <Pdv>, E u IznosOslobPdv,
  // O u IznosNePodlOpor. AE (prijenos obveze) nema smisla u B2C — odbij ranije.
  const pdv: CisRacun['pdv'] = [];
  let oslobCenti = 0;
  let nePodlCenti = 0;
  for (const g of k.raspodjela) {
    if (g.kategorija_pdv === 'S' || g.kategorija_pdv === 'AA' || g.kategorija_pdv === 'Z') {
      pdv.push({ stopa: g.stopa, osnovica: g.oporezivi_iznos, iznos: g.iznos_poreza });
    } else if (g.kategorija_pdv === 'E') {
      oslobCenti += uCente(g.oporezivi_iznos, 'oslobodjeno');
    } else if (g.kategorija_pdv === 'O') {
      nePodlCenti += uCente(g.oporezivi_iznos, 'nePodlOpor');
    } else {
      return { greska: `PDV kategorija '${g.kategorija_pdv}' nije podržana za B2C fiskalizaciju` };
    }
  }

  return {
    cis: {
      oib: k.tenant.oib,
      uSustPdv: !!k.tenant.u_sustavu_pdv,
      datVrijIso: r.datum_vrijeme,
      oznSlijed: r.oznaka_slijednosti,
      brOznRac: String(r.redni_broj),
      oznPosPr: k.ppOznaka,
      oznNapUr: k.nuOznaka,
      pdv,
      iznosOslobPdv: oslobCenti ? (oslobCenti / 100).toFixed(2) : null,
      iznosNePodlOpor: nePodlCenti ? (nePodlCenti / 100).toFixed(2) : null,
      iznosUkupno: r.iznos_s_pdv ?? '0.00',
      nacinPlac: nacin,
      oibOper: k.operaterOib,
      zastKod: r.zki ?? '',
      nakDost,
      oibPrimatelja: k.kupac?.oib ?? null,
    },
  };
}

export interface FiskalizacijaIshod {
  ok: boolean;
  jir?: string;
  zki?: string;
  greska?: string;
  greske?: CisGreska[];
  retryable?: boolean;
}

// Glavni tok: izračunaj/upiši ZKI (ako nedostaje) pa pošalji RacunZahtjev.
// Koriste ga: POST /racun (sinkrono nakon izdavanja), retry endpoint, admin i cron sweep.
export async function fiskalizirajRacun(env: Env, tenantId: number, racunId: number): Promise<FiskalizacijaIshod> {
  const k = await getRacunKontekst(env.DB, tenantId, racunId);
  if (!k) return { ok: false, greska: `Račun ${racunId} ne postoji` };
  if (k.racun.tip_dokumenta !== 'fiskalni_b2c') return { ok: false, greska: 'Samo fiskalni B2C računi se fiskaliziraju' };
  if (k.racun.jir) return { ok: true, jir: k.racun.jir, zki: k.racun.zki ?? undefined };

  const m = await ucitajPotpisniMaterijal(env, tenantId);
  if ('greska' in m) return { ok: false, greska: m.greska };
  if (m.materijal.oibCertifikata && m.materijal.oibCertifikata !== k.tenant.oib) {
    return { ok: false, greska: `OIB certifikata (${m.materijal.oibCertifikata}) ≠ OIB tenanta (${k.tenant.oib}) — CIS bi vratio s005` };
  }

  const okolina = okolinaIzEnv(env);
  const iznosCenti = uCente(k.racun.iznos_s_pdv ?? '0', 'iznosUkupno');

  // ZKI: računa se JEDNOM i ostaje isti kroz sve pokušaje (02-* §8).
  let zki = k.racun.zki;
  if (!zki) {
    zki = izracunajZki(m.materijal.privatniKljucPem, {
      oib: k.tenant.oib,
      datVrijIso: k.racun.datum_vrijeme,
      brOznRac: String(k.racun.redni_broj),
      oznPosPr: k.ppOznaka,
      oznNapUr: k.nuOznaka,
      iznosUkupno: k.racun.iznos_s_pdv ?? '0.00',
    });
    const qrZki = fiskalniQrPayload({ jir: null, zki, datVrijIso: k.racun.datum_vrijeme, iznosCenti });
    await zapisiZki(env.DB, tenantId, racunId, zki, qrZki);
    k.racun.zki = zki;
  }

  const nakDost = k.racun.fiskal_nak_dost === 1;
  const mapirano = mapirajZaCis(k, nakDost);
  if ('greska' in mapirano) return { ok: false, zki, greska: mapirano.greska };

  // Svako slanje = NOVI IdPoruke (i kod ponavljanja!), Zaglavlje/DatumVrijeme = sada.
  const idPoruke = crypto.randomUUID();
  const sada = new Date().toISOString();
  const xml = zahtjevXml('RacunZahtjev', mapirano.cis, idPoruke, sada);
  const potpisano = potpisiZahtjev(xml, 'RacunZahtjev', m.materijal);
  const envelopa = soapEnvelopa(potpisano);

  await logPoruka(env.DB, {
    tenantId, racunId, vrstaPoruke: 'racun_b2c', smjer: 'zahtjev',
    messageId: idPoruke, okolina, requestXml: envelopa,
  });

  let odgovorXml: string;
  let httpStatus: number;
  try {
    const odgovor = await soapPoziv(okolina, 'racuni', envelopa);
    odgovorXml = odgovor.tijelo;
    httpStatus = odgovor.status;
  } catch (e) {
    const poruka = `Transport prema CIS-u nije uspio: ${(e as Error).message}`;
    await Promise.all([
      logPoruka(env.DB, {
        tenantId, racunId, vrstaPoruke: 'racun_b2c', smjer: 'odgovor',
        messageId: idPoruke, okolina, sifraGreske: 'transport', porukaGreske: poruka,
      }),
      zapisiFiskalGresku(env.DB, tenantId, racunId, `transport: ${poruka}`, true),
    ]);
    return { ok: false, zki, greska: poruka, greske: [{ sifra: 'transport', poruka }], retryable: true };
  }

  const parsirano = parsirajOdgovor(odgovorXml);
  const prvaGreska = parsirano.greske[0] ?? null;
  await logPoruka(env.DB, {
    tenantId, racunId, vrstaPoruke: 'racun_b2c', smjer: 'odgovor',
    messageId: idPoruke, okolina, responseXml: odgovorXml,
    jir: parsirano.jir, sifraGreske: prvaGreska?.sifra, porukaGreske: prvaGreska?.poruka,
  });

  if (parsirano.jir) {
    const qrJir = fiskalniQrPayload({ jir: parsirano.jir, zki, datVrijIso: k.racun.datum_vrijeme, iznosCenti });
    await zapisiJir(env.DB, tenantId, racunId, parsirano.jir, qrJir);
    return { ok: true, jir: parsirano.jir, zki };
  }

  // HTTP != 200 bez parsirane CIS greške = infrastrukturni problem → retry.
  const greske: CisGreska[] = parsirano.greske.length
    ? parsirano.greske
    : [{ sifra: 'http', poruka: `CIS je vratio HTTP ${httpStatus} bez čitljivog odgovora` }];
  const retryable = greske.some((g) => greskaJeRetryable(g.sifra));
  const opis = greske.map((g) => `${g.sifra}: ${g.poruka}`).join(' · ');
  await zapisiFiskalGresku(env.DB, tenantId, racunId, opis, retryable);
  return { ok: false, zki, greska: opis, greske, retryable };
}

// EchoRequest — provjera dostupnosti/veze (nije potpisan, ne treba certifikat).
export async function cisEcho(env: Env, tekst = 'domovina-fiskal echo proba'): Promise<{ ok: boolean; odgovor: string }> {
  const okolina = okolinaIzEnv(env);
  const envelopa = soapEnvelopa(echoXml(tekst));
  const odgovor = await soapPoziv(okolina, 'echo', envelopa);
  const parsirano = parsirajOdgovor(odgovor.tijelo);
  return { ok: parsirano.echoTekst === tekst, odgovor: parsirano.echoTekst ?? odgovor.tijelo.slice(0, 500) };
}

// Cron sweep naknadne dostave — pokušaj sve kandidate, greške samo zabilježi.
export async function sweepNaknadnaDostava(env: Env): Promise<{ pokusano: number; uspjelo: number }> {
  const kandidati = await racuniZaNaknadnuDostavu(env.DB);
  let uspjelo = 0;
  for (const kandidat of kandidati) {
    try {
      const ishod = await fiskalizirajRacun(env, kandidat.tenant_id, kandidat.id);
      if (ishod.ok) uspjelo++;
    } catch (e) {
      console.error(`sweep: račun ${kandidat.id} — ${(e as Error).message}`);
    }
  }
  return { pokusano: kandidati.length, uspjelo };
}
