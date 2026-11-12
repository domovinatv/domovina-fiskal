// JSON prikaz dokumenata u odgovorima API-ja. Nazivi polja su ugovor prema
// webshopu (docs/handoff/faza-4-* §3) — ne mijenjati bez razloga.

import { getPdvRaspodjela, getStavke } from '../db';
import type { RacunRow } from '../types';

// Status fiskalizacije iz retka — za GET (poll JIR-a), popis i ponovljeni zahtjev.
export function fiskalizacijaIzRetka(r: RacunRow): { status: 'fiskaliziran' | 'ceka_jir'; greska?: string | null; automatskiRetry?: boolean } {
  if (r.jir) return { status: 'fiskaliziran' };
  return { status: 'ceka_jir', greska: r.fiskal_greska, automatskiRetry: r.fiskal_pokusaja === 0 || r.fiskal_nak_dost === 1 };
}

// Sažeti prikaz dokumenta u popisu (GET /racun).
export function racunUPopis(r: RacunRow) {
  return {
    id: r.id,
    vanjskaReferenca: r.vanjska_referenca,
    brojRacuna: r.broj_racuna_full,
    tip: r.tip_dokumenta,
    status: r.status,
    datumVrijeme: r.datum_vrijeme,
    valuta: r.valuta,
    iznosSPdv: r.iznos_s_pdv,
    zki: r.zki,
    jir: r.jir,
    ...(r.tip_dokumenta === 'fiskalni_b2c' ? { fiskalizacija: { status: fiskalizacijaIzRetka(r).status } } : {}),
    stornoZaId: r.storno_racun_id,
  };
}

// Puni JSON prikaz dokumenta (za 201 i GET po id-u).
export async function racunUOdgovor(db: D1Database, r: RacunRow) {
  const [stavke, raspodjela] = await Promise.all([getStavke(db, r.id), getPdvRaspodjela(db, r.id)]);
  return {
    id: r.id,
    vanjskaReferenca: r.vanjska_referenca,
    brojRacuna: r.broj_racuna_full, // null za skicu
    redniBroj: r.redni_broj,
    godina: r.godina,
    tip: r.tip_dokumenta,
    status: r.status,
    datumVrijeme: r.datum_vrijeme,
    datumDospijeca: r.datum_dospijeca,
    vrijediDo: r.vrijedi_do,
    datumIsporuke: r.datum_isporuke,
    valuta: r.valuta,
    nacinPlacanja: r.nacin_placanja,
    placanje: r.broj_racuna_full ? { model: r.model_placanja, pozivNaBroj: r.poziv_na_broj } : null,
    iznosi: {
      neto: r.neto,
      iznosBezPdv: r.iznos_bez_pdv,
      pdv: r.pdv,
      iznosSPdv: r.iznos_s_pdv,
      dospijevaZaPlacanje: r.dospijeva_za_placanje,
    },
    klauzulaPdv: r.klauzula_pdv,
    napomena: r.napomena,
    pdvRaspodjela: raspodjela.map((p) => ({
      kategorija: p.kategorija_pdv,
      stopa: p.stopa,
      oporeziviIznos: p.oporezivi_iznos,
      iznosPoreza: p.iznos_poreza,
    })),
    stavke: stavke.map((s) => ({
      redniBroj: s.redni_broj,
      naziv: s.naziv,
      kolicina: s.kolicina,
      jedinicaMjere: s.jedinica_mjere,
      netoCijena: s.neto_cijena,
      popustPosto: s.popust_posto,
      pdvKategorija: s.pdv_kategorija,
      pdvStopa: s.pdv_stopa,
      kpd: s.kpd,
      proizvodId: s.proizvod_id,
    })),
    pdf: `/api/v1/racun/${r.id}/pdf`,
    poslanoEmail: r.poslano_email_ts ? { kada: r.poslano_email_ts, na: r.poslano_email_na } : null,
    // Fiskalizacija (faza 2) — popunjeno samo za tip fiskalni_b2c.
    zki: r.zki,
    jir: r.jir,
    fiskalniQr: r.qr_payload,
    ...(r.tip_dokumenta === 'fiskalni_b2c'
      ? {
          fiskalizacija: fiskalizacijaIzRetka(r),
          fiskalGreska: r.fiskal_greska,
          fiskalPokusaja: r.fiskal_pokusaja,
          naknadnaDostava: !!r.fiskal_nak_dost,
          stornoZaId: r.storno_racun_id,
        }
      : {}),
    // eRačun 2.0 (doku) — popunjeno samo za eracun_b2b/eracun_b2g.
    ...(r.tip_dokumenta === 'eracun_b2b' || r.tip_dokumenta === 'eracun_b2g'
      ? {
          eracun: {
            dokuId: r.doku_id,
            status: r.eracun_status,
            deliveryBlock: r.eracun_delivery_block,
            zadnjaProvjera: r.eracun_zadnja_provjera,
            greska: r.eracun_greska,
          },
        }
      : {}),
  };
}

