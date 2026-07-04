// PDF vizualizacija dokumenta (pdf-lib, čisti JS — radi na Workers bez
// Browser Renderinga; preporuka "fallback" iz docs/knowledge/09-* §5.2).
// Sadrži sve obvezne elemente čl. 79. Zakona o PDV-u (09-* §1) + HUB3 barkod
// za plaćanje. Fiskalni dodaci (JIR/ZKI/QR) dolaze u fazi 2.

import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { RacunKontekst } from '../db';
import { izCenti, uCente } from '../util';
import { fiskalniQrBarkod, hub3Barkod } from './hub3';
import fontRegularData from './fontovi/DejaVuSans.subset.ttf';
import fontBoldData from './fontovi/DejaVuSans-Bold.subset.ttf';

const NAVY = rgb(0, 0.184, 0.424); // #002F6C
const MUTED = rgb(0.353, 0.396, 0.439);
const LINIJA = rgb(0.882, 0.898, 0.918);
const CRNA = rgb(0.1, 0.1, 0.12);

const A4 = { w: 595.28, h: 841.89 };
const MARGINA = 42;
const SIRINA = A4.w - 2 * MARGINA;

const NASLOVI: Record<string, string> = {
  ponuda: 'PONUDA',
  predracun: 'PREDRAČUN',
  racun: 'RAČUN',
  fiskalni_b2c: 'RAČUN',
};

// '1234.56' → '1.234,56' (hrvatski zapis na ispisu; u bazi/API-ju ostaje točka)
export function iznosHr(s: string | null): string {
  if (s == null) return '';
  const [cijeli, dec = '00'] = s.replace('-', '').split('.');
  const grupe = cijeli.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${s.startsWith('-') ? '-' : ''}${grupe},${dec.padEnd(2, '0')}`;
}

function datumHr(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}.` : iso;
}

function datumVrijemeHr(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('hr-HR', {
    timeZone: 'Europe/Zagreb',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return f.format(d).replace(', ', ' ');
}

interface Crtac {
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  doc: PDFDocument;
  novaStranica: () => void;
}

function tekst(c: Crtac, s: string, x: number, size: number, opts?: { bold?: boolean; boja?: ReturnType<typeof rgb>; desno?: number }) {
  const font = opts?.bold ? c.bold : c.font;
  let px = x;
  if (opts?.desno !== undefined) px = opts.desno - font.widthOfTextAtSize(s, size);
  c.page.drawText(s, { x: px, y: c.y, size, font, color: opts?.boja ?? CRNA });
}

function linija(c: Crtac, yOffset = -4) {
  c.page.drawLine({
    start: { x: MARGINA, y: c.y + yOffset },
    end: { x: MARGINA + SIRINA, y: c.y + yOffset },
    thickness: 0.7,
    color: LINIJA,
  });
}

// Jednostavan word-wrap za nazive stavki.
function prelomi(font: PDFFont, s: string, size: number, maxSirina: number): string[] {
  const rijeci = s.split(/\s+/);
  const redovi: string[] = [];
  let red = '';
  for (const r of rijeci) {
    const kandidat = red ? `${red} ${r}` : r;
    if (font.widthOfTextAtSize(kandidat, size) <= maxSirina) red = kandidat;
    else {
      if (red) redovi.push(red);
      red = r;
    }
  }
  if (red) redovi.push(red);
  return redovi.length ? redovi : [''];
}

export async function generirajRacunPdf(k: RacunKontekst): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontRegularData);
  const bold = await doc.embedFont(fontBoldData);

  const r = k.racun;
  const t = k.tenant;
  const naslov = NASLOVI[r.tip_dokumenta] ?? r.tip_dokumenta.toUpperCase();
  const jeSkica = r.status === 'nacrt';

  doc.setTitle(`${naslov} ${r.broj_racuna_full ?? '(skica)'} — ${t.naziv}`);
  doc.setLanguage('hr');

  const c: Crtac = {
    doc, font, bold,
    page: doc.addPage([A4.w, A4.h]),
    y: A4.h - MARGINA,
    novaStranica() {
      this.page = doc.addPage([A4.w, A4.h]);
      this.y = A4.h - MARGINA;
    },
  };

  // ── Zaglavlje: izdavatelj (lijevo) + naslov dokumenta (desno) ──
  c.y -= 12;
  tekst(c, t.naziv, MARGINA, 14, { bold: true, boja: NAVY });
  tekst(c, `${naslov}${jeSkica ? ' — SKICA' : ''}`, 0, 16, { bold: true, boja: jeSkica ? MUTED : NAVY, desno: MARGINA + SIRINA });
  c.y -= 15;
  const adresaIzdavatelja = [t.adr_ulica, t.adr_kucni_broj].filter(Boolean).join(' ');
  tekst(c, adresaIzdavatelja, MARGINA, 9, { boja: MUTED });
  tekst(c, jeSkica ? 'broj se dodjeljuje pri izdavanju' : `br. ${r.broj_racuna_full}`, 0, 12, { bold: !jeSkica, desno: MARGINA + SIRINA });
  c.y -= 12;
  tekst(c, [t.adr_postanski_broj, t.adr_mjesto].filter(Boolean).join(' '), MARGINA, 9, { boja: MUTED });
  c.y -= 12;
  tekst(c, `OIB: ${t.oib}`, MARGINA, 9, { boja: MUTED });
  if (!t.u_sustavu_pdv) {
    tekst(c, 'Izdavatelj nije u sustavu PDV-a', 0, 8.5, { boja: MUTED, desno: MARGINA + SIRINA });
  }
  c.y -= 12;
  if (t.iban) tekst(c, `IBAN: ${t.iban}`, MARGINA, 9, { boja: MUTED });
  c.y -= 10;
  linija(c);
  c.y -= 18;

  // ── Meta (desni stupac) + kupac (lijevi stupac) ──
  const metaX = MARGINA + 330;
  const meta: [string, string][] = [
    ['Datum i vrijeme:', datumVrijemeHr(r.datum_vrijeme)],
    ...(r.datum_isporuke ? [['Datum isporuke:', datumHr(r.datum_isporuke)] as [string, string]] : []),
    ...(r.datum_dospijeca ? [['Dospijeće:', datumHr(r.datum_dospijeca)] as [string, string]] : []),
    ...(r.vrijedi_do ? [['Vrijedi do:', datumHr(r.vrijedi_do)] as [string, string]] : []),
    ['Način plaćanja:', r.nacin_placanja ?? '—'],
    ['Poslovni prostor / uređaj:', `${k.ppOznaka} / ${k.nuOznaka}`],
    // Samo ime — puni podaci operatera (s OIB-om) su u bloku "Fiskalni podaci";
    // duga vrijednost bi se preklopila s labelom u uskom meta stupcu.
    ...(k.operaterIme || k.operaterOib
      ? [['Operater:', (k.operaterIme ?? k.operaterOib ?? '').trim()] as [string, string]]
      : []),
  ];

  const kupacPocetakY = c.y;
  tekst(c, r.tip_dokumenta === 'ponuda' || r.tip_dokumenta === 'predracun' ? 'Za:' : 'Kupac:', MARGINA, 8, { boja: MUTED });
  c.y -= 13;
  if (k.kupac) {
    tekst(c, k.kupac.naziv, MARGINA, 11, { bold: true });
    c.y -= 13;
    if (k.kupac.adr_ulica) { tekst(c, k.kupac.adr_ulica, MARGINA, 9); c.y -= 12; }
    const grad = [k.kupac.adr_postanski_broj, k.kupac.adr_grad].filter(Boolean).join(' ');
    if (grad) { tekst(c, `${grad}${k.kupac.adr_drzava && k.kupac.adr_drzava !== 'HR' ? `, ${k.kupac.adr_drzava}` : ''}`, MARGINA, 9); c.y -= 12; }
    if (k.kupac.oib) { tekst(c, `OIB: ${k.kupac.oib}`, MARGINA, 9); c.y -= 12; }
  } else {
    tekst(c, 'krajnji kupac', MARGINA, 10, { boja: MUTED });
    c.y -= 13;
  }
  const kupacKrajY = c.y;

  c.y = kupacPocetakY;
  for (const [labela, vrijednost] of meta) {
    tekst(c, labela, metaX, 8.5, { boja: MUTED });
    tekst(c, vrijednost, 0, 8.5, { desno: MARGINA + SIRINA });
    c.y -= 12;
  }
  c.y = Math.min(c.y, kupacKrajY) - 14;

  // ── Tablica stavki (čl. 79: naziv, količina, jed. cijena bez PDV-a, popust, stopa) ──
  //   stupci: Rbr · Naziv · Kol. · JM · Cijena · Popust · PDV · Iznos
  const st = {
    rbr: MARGINA,
    naziv: MARGINA + 24,
    kol: MARGINA + 238, // desni rub = kol + 30
    jm: MARGINA + 276,
    cijena: MARGINA + 352, // desno poravnato
    popust: MARGINA + 392, // desno
    pdv: MARGINA + 400, // desni rub = pdv + 28
    iznos: MARGINA + SIRINA, // desno
  };
  const zaglavljeTablice = () => {
    tekst(c, '#', st.rbr, 8, { bold: true, boja: MUTED });
    tekst(c, 'Naziv', st.naziv, 8, { bold: true, boja: MUTED });
    tekst(c, 'Kol.', 0, 8, { bold: true, boja: MUTED, desno: st.kol + 30 });
    tekst(c, 'JM', st.jm, 8, { bold: true, boja: MUTED });
    tekst(c, 'Cijena', 0, 8, { bold: true, boja: MUTED, desno: st.cijena });
    tekst(c, 'Pop.%', 0, 8, { bold: true, boja: MUTED, desno: st.popust });
    tekst(c, 'PDV%', 0, 8, { bold: true, boja: MUTED, desno: st.pdv + 28 });
    tekst(c, 'Iznos', 0, 8, { bold: true, boja: MUTED, desno: st.iznos });
    linija(c);
    c.y -= 16;
  };
  zaglavljeTablice();

  for (let i = 0; i < k.stavke.length; i++) {
    const s = k.stavke[i];
    const redovaNaziva = prelomi(font, s.naziv, 9, st.kol - st.naziv - 40);
    const visinaRetka = 12 * redovaNaziva.length + (s.kpd ? 10 : 0) + 5;
    if (c.y - visinaRetka < 150) {
      c.novaStranica();
      c.y -= 10;
      zaglavljeTablice();
    }
    // osnovica stavke: cijena × kol × (1 − popust) — isti izračun kao u validaciji
    const cijenaCenti = uCente(s.neto_cijena, 'cijena');
    const kolTis = Math.round(Number(s.kolicina) * 1000);
    const popustBps = Math.round(Number(s.popust_posto) * 100);
    const sirovo = cijenaCenti * kolTis * (10000 - popustBps);
    const osnovica = Math.sign(sirovo) * Math.round(Math.abs(sirovo) / 1e7);
    const iznosStr = izCenti(osnovica);

    tekst(c, String(i + 1), st.rbr, 9, { boja: MUTED });
    tekst(c, redovaNaziva[0], st.naziv, 9);
    tekst(c, String(s.kolicina).replace('.', ','), 0, 9, { desno: st.kol + 30 });
    tekst(c, s.jedinica_mjere, st.jm, 9);
    tekst(c, iznosHr(s.neto_cijena), 0, 9, { desno: st.cijena });
    tekst(c, popustBps ? String(s.popust_posto).replace('.', ',') : '—', 0, 9, { desno: st.popust });
    tekst(c, s.pdv_stopa, 0, 9, { desno: st.pdv + 28 });
    tekst(c, iznosHr(iznosStr), 0, 9, { desno: st.iznos });
    for (let j = 1; j < redovaNaziva.length; j++) {
      c.y -= 12;
      tekst(c, redovaNaziva[j], st.naziv, 9);
    }
    if (s.kpd) {
      c.y -= 10;
      tekst(c, `KPD: ${s.kpd}`, st.naziv, 7, { boja: MUTED });
    }
    c.y -= 17;
  }
  linija(c, 8);
  c.y -= 6;

  // ── PDV rekapitulacija po stopi (čl. 79 t. 8–9) + ukupno ──
  if (c.y < 230) c.novaStranica();
  const recapX = MARGINA + 250;
  if (t.u_sustavu_pdv) {
    for (const p of k.raspodjela) {
      tekst(c, `Osnovica ${p.stopa}% (${p.kategorija_pdv}):`, recapX, 9, { boja: MUTED });
      tekst(c, iznosHr(p.oporezivi_iznos), 0, 9, { desno: recapX + 160 });
      tekst(c, `PDV ${p.stopa}%:`, recapX + 175, 9, { boja: MUTED });
      tekst(c, iznosHr(p.iznos_poreza), 0, 9, { desno: MARGINA + SIRINA });
      c.y -= 13;
    }
    c.y -= 4;
  }
  tekst(c, 'Ukupno bez PDV-a:', recapX, 10, { boja: MUTED });
  tekst(c, `${iznosHr(r.iznos_bez_pdv)} ${r.valuta}`, 0, 10, { desno: MARGINA + SIRINA });
  c.y -= 14;
  tekst(c, 'PDV ukupno:', recapX, 10, { boja: MUTED });
  tekst(c, `${iznosHr(r.pdv)} ${r.valuta}`, 0, 10, { desno: MARGINA + SIRINA });
  c.y -= 17;
  tekst(c, 'ZA PLATITI:', recapX, 12, { bold: true, boja: NAVY });
  tekst(c, `${iznosHr(r.dospijeva_za_placanje)} ${r.valuta}`, 0, 12, { bold: true, boja: NAVY, desno: MARGINA + SIRINA });
  c.y -= 22;

  // ── Klauzule (čl. 79 st. 1. t. 11–15: oslobođenje / prijenos obveze) ──
  if (r.klauzula_pdv) {
    tekst(c, r.klauzula_pdv, MARGINA, 9, { bold: true });
    c.y -= 14;
  }
  if (r.napomena) {
    for (const red of prelomi(font, `Napomena: ${r.napomena}`, 8.5, SIRINA)) {
      tekst(c, red, MARGINA, 8.5, { boja: MUTED });
      c.y -= 11;
    }
    c.y -= 3;
  }

  // ── Fiskalni podaci: ZKI + JIR + fiskalni QR (obavezni elementi, 02-* §10) ──
  if (r.tip_dokumenta === 'fiskalni_b2c' && r.zki) {
    const QR_STRANICA = 76; // ~2,7 cm — iznad zakonskog minimuma 2×2 cm
    if (c.y < 120 + QR_STRANICA) c.novaStranica();
    const vrhBloka = c.y;
    tekst(c, 'Fiskalni podaci', MARGINA, 9, { bold: true, boja: NAVY });
    c.y -= 13;
    tekst(c, `ZKI: ${r.zki}`, MARGINA, 8.5);
    c.y -= 12;
    tekst(c, r.jir ? `JIR: ${r.jir}` : 'JIR: — (račun izdan bez JIR-a; dostavlja se naknadno)', MARGINA, 8.5);
    c.y -= 12;
    if (k.operaterOib) {
      tekst(c, `Operater: ${k.operaterIme ?? ''} (OIB ${k.operaterOib})`.trim(), MARGINA, 8.5);
      c.y -= 12;
    }
    tekst(c, 'Provjera računa: skeniraj QR ili porezna.gov.hr/rn', MARGINA, 7.5, { boja: MUTED });
    if (r.qr_payload) {
      try {
        const qr = fiskalniQrBarkod(r.qr_payload);
        c.page.drawSvgPath(qr.putanja, {
          x: MARGINA + SIRINA - QR_STRANICA,
          y: vrhBloka + 10,
          scale: QR_STRANICA / qr.sirina,
          color: CRNA,
          borderWidth: 0,
        });
      } catch {
        // QR se ne smije srušiti render računa — JIR/ZKI tekst je dovoljan za provjeru.
      }
    }
    c.y = Math.min(c.y, vrhBloka + 10 - QR_STRANICA) - 16;
  }

  // ── Podaci za plaćanje + HUB3 barkod (samo izdani dokumenti s IBAN-om) ──
  if (t.iban && !jeSkica && (uCente(r.dospijeva_za_placanje ?? '0', 'ukupno') > 0)) {
    if (c.y < 150) c.novaStranica();
    tekst(c, 'Podaci za plaćanje', MARGINA, 9, { bold: true, boja: NAVY });
    c.y -= 13;
    tekst(c, `IBAN: ${t.iban}`, MARGINA, 9);
    c.y -= 12;
    tekst(c, `Model i poziv na broj: ${r.model_placanja ?? 'HR00'} ${r.poziv_na_broj ?? ''}`, MARGINA, 9);
    c.y -= 12;
    tekst(c, `Opis plaćanja: ${naslov} ${r.broj_racuna_full}`, MARGINA, 9);

    try {
      const barkod = hub3Barkod({
        iznosCenti: uCente(r.dospijeva_za_placanje ?? '0', 'ukupno'),
        primateljNaziv: t.naziv,
        primateljAdresa: adresaIzdavatelja,
        primateljMjesto: [t.adr_postanski_broj, t.adr_mjesto].filter(Boolean).join(' '),
        iban: t.iban,
        model: r.model_placanja ?? 'HR00',
        pozivNaBroj: r.poziv_na_broj ?? '',
        opisPlacanja: `${naslov} ${r.broj_racuna_full}`,
        platiteljIme: k.kupac?.naziv,
      });
      // ~62×17 mm na desnoj strani bloka plaćanja
      const ciljnaSirina = 176;
      const mjerilo = ciljnaSirina / barkod.sirina;
      c.page.drawSvgPath(barkod.putanja, {
        x: MARGINA + SIRINA - ciljnaSirina,
        y: c.y + 34,
        scale: mjerilo,
        color: CRNA,
        borderWidth: 0,
      });
      tekst(c, 'HUB3 2D barkod — skeniraj u mobilnom bankarstvu', 0, 6.5, { boja: MUTED, desno: MARGINA + SIRINA });
    } catch {
      // Barkod je "nice to have" — dokument ostaje valjan i bez njega.
    }
    c.y -= 20;
  }

  // ── Uvjeti + footer ──
  if (r.uvjeti) {
    if (c.y < 110) c.novaStranica();
    c.y -= 6;
    for (const red of prelomi(font, r.uvjeti, 8, SIRINA)) {
      tekst(c, red, MARGINA, 8, { boja: MUTED });
      c.y -= 10;
    }
  }

  const stranice = doc.getPages();
  stranice.forEach((page, i) => {
    page.drawText(`${t.naziv} · OIB ${t.oib} · ${naslov} ${r.broj_racuna_full ?? '(skica)'} · stranica ${i + 1}/${stranice.length}`, {
      x: MARGINA, y: 24, size: 7, font, color: MUTED,
    });
  });

  return doc.save();
}
