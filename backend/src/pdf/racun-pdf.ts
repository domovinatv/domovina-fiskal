// PDF vizualizacija dokumenta (pdf-lib, čisti JS — radi na Workers bez
// Browser Renderinga; preporuka "fallback" iz docs/knowledge/09-* §5.2).
// Sadrži sve obvezne elemente čl. 79. Zakona o PDV-u (09-* §1), fiskalne
// elemente (ZKI/JIR/QR, 02-* §10) i barkodove za plaćanje (HUB3 + EPC QR).
//
// Izgled: kartice i trake umjesto golih linija, Inter s tabličnim znamenkama,
// akcentna boja i logo po tenantu (PdfBranding). Bez brandinga koristi se
// zadana Domovina tema. Vizualni pregled bez Workera:
//   backend/scripts/pdf-pregled/generiraj.sh

import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { RacunKontekst } from '../db';
import { iznosRetka, uCente } from '../util';
import { epcQrBarkod, fiskalniQrBarkod, hub3Barkod } from './hub3';
import fontRegularData from './fontovi/Inter-Regular.subset.ttf';
import fontBoldData from './fontovi/Inter-Bold.subset.ttf';

type Boja = ReturnType<typeof rgb>;

const CRNA = rgb(0.09, 0.11, 0.15); // #171C26
const MUTED = rgb(0.38, 0.42, 0.47); // #616B78
const LINIJA = rgb(0.886, 0.906, 0.929); // #E2E7ED
const POZADINA = rgb(0.965, 0.973, 0.98); // #F6F8FA
const ZELENA = rgb(0.098, 0.49, 0.29); // #197D4A
const CRVENA = rgb(0.74, 0.16, 0.16); // #BD2929

const ZADANA_BOJA = '#002F6C'; // Domovina navy

const A4 = { w: 595.28, h: 841.89 };
const MARGINA = 40;
const SIRINA = A4.w - 2 * MARGINA;
const DESNO = MARGINA + SIRINA;
const DNO = 64; // ispod ovoga je podnožje

const NASLOVI: Record<string, string> = {
  ponuda: 'PONUDA',
  predracun: 'PREDRAČUN',
  racun: 'RAČUN',
  fiskalni_b2c: 'RAČUN',
};

// Vizualni identitet tenanta na PDF-u. Sve je opcionalno.
export interface PdfBranding {
  boja?: string | null; // akcent, '#RRGGBB'
  logo?: Uint8Array | null; // PNG ili JPEG (prepoznaje se po magic bajtovima)
  podnozje?: string | null; // npr. 'www.primjer.hr · +385 1 234 5678'
}

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

// Nalog za plaćanje (barkodovi u PDF-u, IBAN u e-mailu) samo za izdane
// dokumente s IBAN-om i pozitivnim iznosom — i NIKAD za fiskalni B2C, koji se
// izdaje u trenutku naplate (kupac je već platio; nalog bi ga samo zbunio).
export function trebaNalogZaPlacanje(k: Pick<RacunKontekst, 'racun' | 'tenant'>): boolean {
  return (
    !!k.tenant.iban &&
    k.racun.status !== 'nacrt' &&
    k.racun.tip_dokumenta !== 'fiskalni_b2c' &&
    uCente(k.racun.dospijeva_za_placanje ?? '0', 'ukupno') > 0
  );
}

// „Storno računa br. 12/WEB/1 od 15.07.2026." — PDF i e-mail storna (Faza 4.3).
export function stornoOpis(o: { broj: string | null; datumVrijeme: string }): string {
  const datum = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(o.datumVrijeme))
    .replace(/\s/g, '');
  return `Storno računa br. ${o.broj ?? '—'} od ${datum.endsWith('.') ? datum : `${datum}.`}`;
}

// '23.11.2026. 14:20' (Europe/Zagreb)
function datumVrijemeHr(iso: string): string {
  const dijelovi = new Intl.DateTimeFormat('hr-HR', {
    timeZone: 'Europe/Zagreb',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const d = (tip: string) => dijelovi.find((p) => p.type === tip)?.value ?? '';
  return `${d('day')}.${d('month')}.${d('year')}. ${d('hour')}:${d('minute')}`;
}

// ── Boje brandinga ──

function hexUBoju(hex: string | null | undefined): Boja | null {
  const m = hex?.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function pomijesaj(a: Boja, b: Boja, t: number): Boja {
  return rgb(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
}

function svjetlina(c: Boja): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.red) + 0.7152 * lin(c.green) + 0.0722 * lin(c.blue);
}

interface Tema {
  akcent: Boja; // trake, ispune
  tekst: Boja; // akcent za tekst na bijelom — potamnjen ako je boja presvijetla
  tint: Boja; // vrlo svijetla ispuna (zaglavlje tablice, kartica ukupno)
}

function tema(hex: string | null | undefined): Tema {
  const akcent = hexUBoju(hex) ?? hexUBoju(ZADANA_BOJA)!;
  const bijela = rgb(1, 1, 1);
  const crna = rgb(0, 0, 0);
  // Kontrast prema bijeloj ≥ ~4.5:1 → relativna svjetlina ≤ ~0.18.
  let tekst = akcent;
  for (let i = 0; i < 8 && svjetlina(tekst) > 0.18; i++) tekst = pomijesaj(tekst, crna, 0.2);
  return { akcent, tekst, tint: pomijesaj(akcent, bijela, 0.92) };
}

// ── Crtanje ──

interface Crtac {
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  doc: PDFDocument;
  tema: Tema;
  novaStranica: () => void;
}

interface TekstOpcije {
  bold?: boolean;
  boja?: Boja;
  desno?: number; // desni rub (desno poravnanje)
  sredina?: number; // središte (centrirano)
}

function tekst(c: Crtac, s: string, x: number, size: number, opts?: TekstOpcije) {
  const font = opts?.bold ? c.bold : c.font;
  let px = x;
  if (opts?.desno !== undefined) px = opts.desno - font.widthOfTextAtSize(s, size);
  else if (opts?.sredina !== undefined) px = opts.sredina - font.widthOfTextAtSize(s, size) / 2;
  c.page.drawText(s, { x: px, y: c.y, size, font, color: opts?.boja ?? CRNA });
}

function sirina(c: Crtac, s: string, size: number, bold = false): number {
  return (bold ? c.bold : c.font).widthOfTextAtSize(s, size);
}

function crta(c: Crtac, y: number, x1 = MARGINA, x2 = DESNO, boja = LINIJA, debljina = 0.6) {
  c.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: debljina, color: boja });
}

// Pravokutnik zaobljenih kutova; (x, vrh) = gornji lijevi kut.
function kartica(c: Crtac, x: number, vrh: number, w: number, h: number, o: { ispuna?: Boja; rub?: Boja; r?: number }) {
  const r = Math.min(o.r ?? 6, w / 2, h / 2);
  const put = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  c.page.drawSvgPath(put, {
    x, y: vrh,
    color: o.ispuna,
    borderColor: o.rub,
    borderWidth: o.rub ? 0.7 : 0,
  });
}

// Oznaka statusa (PLAĆENO / STORNO / SKICA) desno poravnata na `desno`.
function znacka(c: Crtac, s: string, desno: number, boja: Boja) {
  const size = 8;
  const w = sirina(c, s, size, true) + 16;
  const h = 17;
  kartica(c, desno - w, c.y + 12, w, h, { ispuna: pomijesaj(boja, rgb(1, 1, 1), 0.88), rub: boja, r: 8.5 });
  tekst(c, s, 0, size, { bold: true, boja, sredina: desno - w / 2 });
}

// Jednostavan word-wrap; predugačke riječi (IBAN, URL) lomi po znakovima.
function prelomi(font: PDFFont, s: string, size: number, maxSirina: number): string[] {
  const redovi: string[] = [];
  for (const odlomak of s.split(/\r?\n/)) {
    let red = '';
    for (let r of odlomak.split(/\s+/).filter(Boolean)) {
      while (font.widthOfTextAtSize(r, size) > maxSirina && r.length > 1) {
        let n = r.length - 1;
        while (n > 1 && font.widthOfTextAtSize(r.slice(0, n), size) > maxSirina) n--;
        if (red) { redovi.push(red); red = ''; }
        redovi.push(r.slice(0, n));
        r = r.slice(n);
      }
      const kandidat = red ? `${red} ${r}` : r;
      if (font.widthOfTextAtSize(kandidat, size) <= maxSirina) red = kandidat;
      else {
        if (red) redovi.push(red);
        red = r;
      }
    }
    redovi.push(red);
  }
  while (redovi.length > 1 && redovi[redovi.length - 1] === '') redovi.pop();
  return redovi.length ? redovi : [''];
}

async function ugradiLogo(doc: PDFDocument, bajtovi: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bajtovi || bajtovi.length < 8) return null;
  try {
    if (bajtovi[0] === 0x89 && bajtovi[1] === 0x50 && bajtovi[2] === 0x4e && bajtovi[3] === 0x47) return await doc.embedPng(bajtovi);
    if (bajtovi[0] === 0xff && bajtovi[1] === 0xd8) return await doc.embedJpg(bajtovi);
  } catch {
    // Neispravan logo ne smije srušiti račun — ispisuje se naziv umjesto njega.
  }
  return null;
}

export async function generirajRacunPdf(k: RacunKontekst, opcije?: { branding?: PdfBranding | null }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Subset ima tablične znamenke upisane u cmap (scripts/fontovi-tnum.py) —
  // ne uključuj layout značajke ovdje, pdf-lib krivo mjeri zamijenjene glifove.
  const font = await doc.embedFont(fontRegularData);
  const bold = await doc.embedFont(fontBoldData);
  const branding = opcije?.branding ?? null;
  const logo = await ugradiLogo(doc, branding?.logo);
  const T = tema(branding?.boja);

  const r = k.racun;
  const t = k.tenant;
  const naslov = NASLOVI[r.tip_dokumenta] ?? r.tip_dokumenta.toUpperCase();
  const jeSkica = r.status === 'nacrt';
  const jeStorno = !!k.stornoOriginal;
  const zaPlatitiCenti = uCente(r.dospijeva_za_placanje ?? '0', 'ukupno');

  doc.setTitle(`${naslov} ${r.broj_racuna_full ?? '(skica)'} — ${t.naziv}`);
  doc.setAuthor(t.naziv);
  doc.setCreator('Domovina Fiskal');
  doc.setLanguage('hr');

  const c: Crtac = {
    doc, font, bold, tema: T,
    page: doc.addPage([A4.w, A4.h]),
    y: A4.h - MARGINA,
    novaStranica() {
      this.page = doc.addPage([A4.w, A4.h]);
      this.y = A4.h - MARGINA - 10;
    },
  };
  const osiguraj = (visina: number) => {
    if (c.y - visina < DNO) c.novaStranica();
  };

  // ══ Zaglavlje: logo/naziv (lijevo) + vrsta i broj dokumenta (desno) ══
  const vrhZaglavlja = A4.h - MARGINA - 6;
  let dnoLijevo = vrhZaglavlja;
  if (logo) {
    const sk = Math.min(170 / logo.width, 54 / logo.height, 1);
    const w = logo.width * sk;
    const h = logo.height * sk;
    c.page.drawImage(logo, { x: MARGINA, y: vrhZaglavlja - h, width: w, height: h });
    dnoLijevo = vrhZaglavlja - h;
  } else {
    const redovi = prelomi(bold, t.naziv, 17, 290);
    c.y = vrhZaglavlja - 15;
    for (const red of redovi) {
      tekst(c, red, MARGINA, 17, { bold: true, boja: T.tekst });
      c.y -= 20;
    }
    dnoLijevo = c.y + 14;
  }

  c.y = vrhZaglavlja - 20;
  tekst(c, naslov, 0, 24, { bold: true, boja: T.tekst, desno: DESNO });
  c.y -= 18;
  tekst(c, jeSkica ? 'broj se dodjeljuje pri izdavanju' : `br. ${r.broj_racuna_full}`, 0, jeSkica ? 9 : 12, { bold: !jeSkica, boja: jeSkica ? MUTED : CRNA, desno: DESNO });
  c.y -= 22;
  if (jeSkica) znacka(c, 'SKICA', DESNO, MUTED);
  else if (jeStorno) znacka(c, 'STORNO', DESNO, CRVENA);
  else if (r.tip_dokumenta === 'fiskalni_b2c') znacka(c, 'PLAĆENO', DESNO, ZELENA);
  const dnoDesno = c.y - 8;

  c.y = Math.min(dnoLijevo, dnoDesno) - 18;

  // ══ Traka s datumima i načinom plaćanja ══
  const meta: [string, string][] = [
    ['Datum i vrijeme', datumVrijemeHr(r.datum_vrijeme)],
    ...(r.datum_isporuke ? [['Datum isporuke', datumHr(r.datum_isporuke)] as [string, string]] : []),
    ...(r.datum_dospijeca ? [['Dospijeće', datumHr(r.datum_dospijeca)] as [string, string]] : []),
    ...(r.vrijedi_do ? [['Vrijedi do', datumHr(r.vrijedi_do)] as [string, string]] : []),
    ['Način plaćanja', r.nacin_placanja ?? '—'],
    ['Prostor / uređaj', `${k.ppOznaka} / ${k.nuOznaka}`],
    // Samo ime — puni podaci operatera (s OIB-om) su u bloku "Fiskalni podaci".
    ...(k.operaterIme || k.operaterOib ? [['Operater', (k.operaterIme ?? k.operaterOib ?? '').trim()] as [string, string]] : []),
  ];
  {
    const visina = 40;
    const vrh = c.y;
    kartica(c, MARGINA, vrh, SIRINA, visina, { ispuna: POZADINA });
    // Širina stupca razmjerna sadržaju (labela ili vrijednost, što je šire).
    const UNUTRA = SIRINA - 24;
    const RAZMAK = 14;
    const prirodno = meta.map(([l, v]) => Math.max(sirina(c, l.toUpperCase(), 6, true), sirina(c, v, 9, true)));
    const zbroj = prirodno.reduce((a, b) => a + b, 0) + RAZMAK * (meta.length - 1);
    const visak = (UNUTRA - zbroj) / meta.length; // < 0 → stupci se stisnu
    let x = MARGINA + 12;
    meta.forEach(([labela, vrijednost], i) => {
      const max = Math.max(prirodno[i] + visak, 30);
      const stupacX = x;
      x += max + RAZMAK;
      c.y = vrh - 15;
      tekst(c, labela.toUpperCase(), stupacX, 6, { bold: true, boja: MUTED });
      c.y = vrh - 29;
      let v = vrijednost;
      let size = 9;
      while (size > 7 && sirina(c, v, size, true) > max) size -= 0.5;
      while (sirina(c, v, size, true) > max && v.length > 2) v = `${v.slice(0, -2)}…`;
      tekst(c, v, stupacX, size, { bold: true });
    });
    c.y = vrh - visina - 22;
  }

  // ══ Izdavatelj | Kupac ══
  {
    const stupacW = (SIRINA - 24) / 2;
    const kupacX = MARGINA + stupacW + 24;
    const vrh = c.y;

    const blok = (x: number, labela: string, naziv: string | null, redovi: string[], napomena?: string): number => {
      c.y = vrh;
      tekst(c, labela, x, 6.5, { bold: true, boja: T.tekst });
      c.page.drawRectangle({ x, y: vrh - 6, width: 18, height: 1.5, color: T.akcent });
      c.y -= 20;
      if (naziv) {
        for (const red of prelomi(bold, naziv, 10.5, stupacW)) {
          tekst(c, red, x, 10.5, { bold: true });
          c.y -= 13.5;
        }
      }
      for (const red of redovi) {
        for (const dio of prelomi(font, red, 8.5, stupacW)) {
          tekst(c, dio, x, 8.5, { boja: naziv ? CRNA : MUTED });
          c.y -= 11.5;
        }
      }
      if (napomena) {
        c.y -= 2;
        tekst(c, napomena, x, 7.5, { boja: MUTED });
        c.y -= 11;
      }
      return c.y;
    };

    const adresaIzd = [t.adr_ulica, t.adr_kucni_broj].filter(Boolean).join(' ');
    const mjestoIzd = [t.adr_postanski_broj, t.adr_mjesto].filter(Boolean).join(' ');
    const dnoIzd = blok(
      MARGINA,
      'IZDAVATELJ',
      t.naziv,
      [adresaIzd, mjestoIzd, `OIB: ${t.oib}`, ...(t.iban ? [`IBAN: ${t.iban}`] : []), ...(t.email ? [t.email] : [])].filter(Boolean),
      t.u_sustavu_pdv ? undefined : 'Izdavatelj nije u sustavu PDV-a',
    );

    const labelaKupca = r.tip_dokumenta === 'ponuda' || r.tip_dokumenta === 'predracun' ? 'ZA' : 'KUPAC';
    let dnoKup: number;
    if (k.kupac) {
      const grad = [k.kupac.adr_postanski_broj, k.kupac.adr_grad].filter(Boolean).join(' ');
      const drzava = k.kupac.adr_drzava && k.kupac.adr_drzava !== 'HR' ? `, ${k.kupac.adr_drzava}` : '';
      dnoKup = blok(kupacX, labelaKupca, k.kupac.naziv, [
        ...(k.kupac.adr_ulica ? [k.kupac.adr_ulica] : []),
        ...(grad ? [`${grad}${drzava}`] : []),
        ...(k.kupac.oib ? [`OIB: ${k.kupac.oib}`] : []),
        ...(k.kupac.vat_number && k.kupac.vat_number !== k.kupac.oib ? [`PDV ID: ${k.kupac.vat_number}`] : []),
      ]);
    } else {
      dnoKup = blok(kupacX, labelaKupca, null, ['Krajnji kupac']);
    }
    c.y = Math.min(dnoIzd, dnoKup) - 14;
  }

  // ══ Tablica stavki (čl. 79: naziv, količina, jed. cijena bez PDV-a, popust, stopa) ══
  const imaPopust = k.stavke.some((s) => Math.round(Number(s.popust_posto) * 100) !== 0);
  const imaPdv = !!t.u_sustavu_pdv || k.stavke.some((s) => Number(s.pdv_stopa) !== 0);
  // Stupci zdesna nalijevo: [ključ, naslov, širina, poravnanje]
  type Stupac = { kljuc: string; naslov: string; w: number; lijevo?: boolean; x: number; desno: number };
  const definicija: Omit<Stupac, 'x' | 'desno'>[] = [
    { kljuc: 'kol', naslov: 'KOL.', w: 40 },
    { kljuc: 'jm', naslov: 'JM', w: 34, lijevo: true },
    { kljuc: 'cijena', naslov: 'CIJENA', w: 62 },
    ...(imaPopust ? [{ kljuc: 'popust', naslov: 'POPUST', w: 44 }] : []),
    ...(imaPdv ? [{ kljuc: 'pdv', naslov: 'PDV', w: 38 }] : []),
    { kljuc: 'iznos', naslov: `IZNOS (${r.valuta})`, w: 74 },
  ];
  const stupci: Stupac[] = [];
  {
    let desno = DESNO - 8;
    for (let i = definicija.length - 1; i >= 0; i--) {
      const d = definicija[i];
      stupci.unshift({ ...d, x: desno - d.w, desno });
      desno -= d.w;
    }
  }
  const st = Object.fromEntries(stupci.map((s) => [s.kljuc, s])) as Record<string, Stupac>;
  const rbrX = MARGINA + 8;
  const nazivX = MARGINA + 28;
  const nazivMax = stupci[0].x - nazivX - 10;

  const zaglavljeTablice = () => {
    const visina = 22;
    kartica(c, MARGINA, c.y, SIRINA, visina, { ispuna: T.tint, r: 4 });
    const yTeksta = c.y - 14;
    const sacuvaj = c.y;
    c.y = yTeksta;
    tekst(c, '#', rbrX, 6.5, { bold: true, boja: T.tekst });
    tekst(c, 'OPIS', nazivX, 6.5, { bold: true, boja: T.tekst });
    for (const s of stupci) {
      if (s.lijevo) tekst(c, s.naslov, s.x + 6, 6.5, { bold: true, boja: T.tekst });
      else tekst(c, s.naslov, 0, 6.5, { bold: true, boja: T.tekst, desno: s.desno });
    }
    c.y = sacuvaj - visina - 15;
  };
  zaglavljeTablice();

  for (let i = 0; i < k.stavke.length; i++) {
    const s = k.stavke[i];
    const redovaNaziva = prelomi(font, s.naziv, 9, nazivMax);
    const redovaOpisa = s.opis ? prelomi(font, s.opis, 7.5, nazivMax) : [];
    const dodatno = redovaOpisa.length * 10 + (s.kpd ? 10 : 0);
    const visinaRetka = 12.5 * redovaNaziva.length + dodatno + 10;
    if (c.y - visinaRetka < DNO + 10) {
      c.novaStranica();
      zaglavljeTablice();
    }
    const iznosStr = iznosRetka(s); // K15: spremljen pri izdavanju
    const popustBps = Math.round(Number(s.popust_posto) * 100);

    tekst(c, String(i + 1), rbrX, 8.5, { boja: MUTED });
    tekst(c, redovaNaziva[0], nazivX, 9);
    tekst(c, String(s.kolicina).replace('.', ','), 0, 9, { desno: st.kol.desno });
    tekst(c, s.jedinica_mjere, st.jm.x + 6, 9, { boja: MUTED });
    tekst(c, iznosHr(s.neto_cijena), 0, 9, { desno: st.cijena.desno });
    if (st.popust) tekst(c, popustBps ? `${String(s.popust_posto).replace('.', ',')} %` : '—', 0, 9, { desno: st.popust.desno, boja: popustBps ? CRNA : MUTED });
    if (st.pdv) tekst(c, `${String(s.pdv_stopa).replace('.', ',')} %`, 0, 9, { desno: st.pdv.desno });
    tekst(c, iznosHr(iznosStr), 0, 9, { bold: true, desno: st.iznos.desno });
    for (let j = 1; j < redovaNaziva.length; j++) {
      c.y -= 12.5;
      tekst(c, redovaNaziva[j], nazivX, 9);
    }
    for (const red of redovaOpisa) {
      c.y -= 10;
      tekst(c, red, nazivX, 7.5, { boja: MUTED });
    }
    if (s.kpd) {
      c.y -= 10;
      tekst(c, `KPD ${s.kpd}`, nazivX, 7, { boja: MUTED });
    }
    c.y -= 9;
    if (i < k.stavke.length - 1) crta(c, c.y + 1, MARGINA + 8, DESNO - 8);
    c.y -= 14;
  }
  c.y += 6;

  // ══ PDV rekapitulacija (lijevo, čl. 79 t. 8–9) + ukupno (desno) ══
  {
    const redoviRekap = t.u_sustavu_pdv ? k.raspodjela.length : 0;
    const visinaRekap = redoviRekap ? 22 + redoviRekap * 14 + 6 : 0;
    const visinaUkupno = 96;
    osiguraj(Math.max(visinaRekap, visinaUkupno) + 12);
    const vrh = c.y;

    if (redoviRekap) {
      const w = 250;
      const kol = { stopa: MARGINA + 8, osnovica: MARGINA + 160, pdv: MARGINA + w - 8 };
      c.y = vrh - 12;
      tekst(c, 'REKAPITULACIJA PDV-a', kol.stopa, 6.5, { bold: true, boja: MUTED });
      tekst(c, 'OSNOVICA', 0, 6.5, { bold: true, boja: MUTED, desno: kol.osnovica });
      tekst(c, 'PDV', 0, 6.5, { bold: true, boja: MUTED, desno: kol.pdv });
      crta(c, c.y - 5, MARGINA, MARGINA + w);
      c.y -= 18;
      for (const p of k.raspodjela) {
        tekst(c, `${p.stopa.replace('.', ',')} % (${p.kategorija_pdv})`, kol.stopa, 8.5);
        tekst(c, iznosHr(p.oporezivi_iznos), 0, 8.5, { desno: kol.osnovica });
        tekst(c, iznosHr(p.iznos_poreza), 0, 8.5, { desno: kol.pdv });
        c.y -= 14;
      }
    }

    const w = 232;
    const x = DESNO - w;
    kartica(c, x, vrh, w, visinaUkupno, { ispuna: T.tint });
    c.y = vrh - 20;
    tekst(c, 'Ukupno bez PDV-a', x + 14, 8.5, { boja: MUTED });
    tekst(c, `${iznosHr(r.iznos_bez_pdv)} ${r.valuta}`, 0, 8.5, { desno: DESNO - 14 });
    c.y -= 15;
    tekst(c, 'PDV ukupno', x + 14, 8.5, { boja: MUTED });
    tekst(c, `${iznosHr(r.pdv)} ${r.valuta}`, 0, 8.5, { desno: DESNO - 14 });
    c.y -= 12;
    c.page.drawLine({ start: { x: x + 14, y: c.y }, end: { x: DESNO - 14, y: c.y }, thickness: 0.6, color: pomijesaj(T.akcent, rgb(1, 1, 1), 0.7) });
    c.y -= 16;
    // Storno (negativan iznos) se kupcu vraća, ne plaća.
    tekst(c, zaPlatitiCenti < 0 ? 'ZA POVRAT' : r.tip_dokumenta === 'fiskalni_b2c' ? 'UKUPNO PLAĆENO' : 'ZA PLATITI', x + 14, 7, { bold: true, boja: T.tekst });
    c.y -= 22;
    tekst(c, `${iznosHr(r.dospijeva_za_placanje)} ${r.valuta}`, 0, 20, { bold: true, boja: T.tekst, desno: DESNO - 14 });

    c.y = Math.min(vrh - visinaRekap, vrh - visinaUkupno) - 20;
  }

  // ══ Storno, klauzule (čl. 79 st. 1. t. 11–15), napomena ══
  if (k.stornoOriginal) {
    osiguraj(16);
    tekst(c, stornoOpis(k.stornoOriginal), MARGINA, 10, { bold: true, boja: CRVENA });
    c.y -= 16;
  }
  if (r.klauzula_pdv) {
    for (const red of prelomi(bold, r.klauzula_pdv, 8.5, SIRINA)) {
      osiguraj(12);
      tekst(c, red, MARGINA, 8.5, { bold: true });
      c.y -= 12;
    }
    c.y -= 4;
  }
  if (r.napomena) {
    const redovi = prelomi(font, r.napomena, 8.5, SIRINA);
    osiguraj(14 + redovi.length * 11.5);
    tekst(c, 'NAPOMENA', MARGINA, 6.5, { bold: true, boja: MUTED });
    c.y -= 12;
    for (const red of redovi) {
      tekst(c, red, MARGINA, 8.5);
      c.y -= 11.5;
    }
    c.y -= 8;
  }

  // ══ Fiskalni podaci: ZKI + JIR + fiskalni QR (obavezni elementi, 02-* §10) ══
  if (r.tip_dokumenta === 'fiskalni_b2c' && r.zki) {
    const QR = 72; // ~2,5 cm — iznad zakonskog minimuma 2×2 cm
    const visina = QR + 24;
    osiguraj(visina + 12);
    const vrh = c.y;
    kartica(c, MARGINA, vrh, SIRINA, visina, { rub: LINIJA });
    const x = MARGINA + 16;
    c.y = vrh - 22;
    tekst(c, 'FISKALIZACIJA', x, 6.5, { bold: true, boja: T.tekst });
    c.y -= 17;
    tekst(c, 'JIR', x, 7.5, { bold: true, boja: MUTED });
    tekst(c, r.jir ?? '— (račun izdan bez JIR-a; dostavlja se naknadno)', x + 48, 8.5);
    c.y -= 13;
    tekst(c, 'ZKI', x, 7.5, { bold: true, boja: MUTED });
    tekst(c, r.zki, x + 48, 8.5);
    if (k.operaterOib) {
      c.y -= 13;
      tekst(c, 'Operater', x, 7.5, { bold: true, boja: MUTED });
      tekst(c, `${k.operaterIme ?? ''} (OIB ${k.operaterOib})`.trim(), x + 48, 8.5);
    }
    c.y -= 17;
    tekst(c, 'Provjera računa: skenirajte QR kôd ili posjetite porezna.gov.hr/rn', x, 7, { boja: MUTED });
    if (r.qr_payload) {
      try {
        const qr = fiskalniQrBarkod(r.qr_payload);
        c.page.drawSvgPath(qr.putanja, {
          x: DESNO - 12 - QR,
          y: vrh - 12,
          scale: QR / qr.sirina,
          color: CRNA,
          borderWidth: 0,
        });
      } catch {
        // QR se ne smije srušiti render računa — JIR/ZKI tekst je dovoljan za provjeru.
      }
    }
    c.y = vrh - visina - 16;
  }

  // ══ Podaci za plaćanje + barkodovi (samo izdani dokumenti s IBAN-om) ══
  // Dva barkoda s istim podacima jer ih čitaju različite aplikacije: PDF417
  // (HUB3) čitaju domaće banke, EPC QR čitaju Keks Pay, Revolut, Wise i sve
  // više m-bankinga. Kupac skenira onaj koji njegova aplikacija podržava.
  //
  // Fiskalni B2C je izuzet: taj se račun izdaje U TRENUTKU naplate, pa nalog za
  // plaćanje na njemu samo zbunjuje kupca koji je već platio. Zahtjev za uplatu
  // nosi ponuda/predračun.
  if (t.iban && trebaNalogZaPlacanje(k)) {
    const PDF417_SIRINA = 150;
    const EPC = 62; // ~2,2 cm — dovoljno za pouzdano skeniranje s ekrana
    const RAZMAK = 14;
    const visina = EPC + 34;
    osiguraj(visina + 12);

    const vrh = c.y;
    kartica(c, MARGINA, vrh, SIRINA, visina, { rub: LINIJA });
    const x = MARGINA + 16;
    const opis = `${naslov} ${r.broj_racuna_full}`;
    c.y = vrh - 22;
    tekst(c, 'PODACI ZA PLAĆANJE', x, 6.5, { bold: true, boja: T.tekst });
    const redovi: [string, string][] = [
      ['IBAN', t.iban],
      ['Model / poziv', `${r.model_placanja ?? 'HR00'} ${r.poziv_na_broj ?? ''}`.trim()],
      ['Opis', opis],
      ['Iznos', `${iznosHr(r.dospijeva_za_placanje)} ${r.valuta}`],
    ];
    c.y -= 17;
    for (const [l, v] of redovi) {
      tekst(c, l, x, 7.5, { bold: true, boja: MUTED });
      tekst(c, v, x + 66, 8.5, { bold: l === 'IBAN' || l === 'Iznos' });
      c.y -= 13;
    }

    const podaci = {
      iznosCenti: zaPlatitiCenti,
      primateljNaziv: t.naziv,
      primateljAdresa: [t.adr_ulica, t.adr_kucni_broj].filter(Boolean).join(' '),
      primateljMjesto: [t.adr_postanski_broj, t.adr_mjesto].filter(Boolean).join(' '),
      iban: t.iban,
      model: r.model_placanja ?? 'HR00',
      pozivNaBroj: r.poziv_na_broj ?? '',
      opisPlacanja: opis,
      platiteljIme: k.kupac?.naziv,
    };

    // drawSvgPath sidri sliku po GORNJEM rubu (SVG y raste prema dolje).
    const vrhBarkoda = vrh - 14;
    const epcX = DESNO - 14 - EPC;
    const pdf417X = epcX - RAZMAK - PDF417_SIRINA;
    const oznaka = (s: string, xx: number, y: number) =>
      c.page.drawText(s, { x: xx, y, size: 6, font, color: MUTED });

    try {
      const barkod = hub3Barkod(podaci);
      const v = PDF417_SIRINA * (barkod.visina / barkod.sirina);
      c.page.drawSvgPath(barkod.putanja, { x: pdf417X, y: vrhBarkoda, scale: PDF417_SIRINA / barkod.sirina, color: CRNA, borderWidth: 0 });
      oznaka('HUB3 · m-banking', pdf417X, vrhBarkoda - v - 9);
    } catch {
      // Barkod je "nice to have" — dokument ostaje valjan i bez njega.
    }
    try {
      const qr = epcQrBarkod(podaci);
      c.page.drawSvgPath(qr.putanja, { x: epcX, y: vrhBarkoda, scale: EPC / qr.sirina, color: CRNA, borderWidth: 0 });
      oznaka('EPC QR · Revolut, Keks Pay…', epcX - 18, vrhBarkoda - EPC - 9);
    } catch {
      // isto — nedostatak QR-a ne obezvrjeđuje dokument.
    }
    c.y = vrh - visina - 16;
  }

  // ══ Uvjeti ══
  if (r.uvjeti) {
    const redovi = prelomi(font, r.uvjeti, 7.5, SIRINA);
    osiguraj(14 + Math.min(redovi.length, 4) * 10);
    tekst(c, 'UVJETI', MARGINA, 6.5, { bold: true, boja: MUTED });
    c.y -= 12;
    for (const red of redovi) {
      osiguraj(10);
      tekst(c, red, MARGINA, 7.5, { boja: MUTED });
      c.y -= 10;
    }
  }

  // ══ Akcentna traka + podnožje na svakoj stranici ══
  const stranice = doc.getPages();
  const podnozje = [t.naziv, `OIB ${t.oib}`, ...(branding?.podnozje?.trim() ? [branding.podnozje.trim()] : t.email ? [t.email] : [])].join('  ·  ');
  stranice.forEach((page, i) => {
    page.drawRectangle({ x: 0, y: A4.h - 5, width: A4.w, height: 5, color: T.akcent });
    page.drawLine({ start: { x: MARGINA, y: 44 }, end: { x: DESNO, y: 44 }, thickness: 0.6, color: LINIJA });
    let tekstPodnozja = podnozje;
    while (font.widthOfTextAtSize(tekstPodnozja, 7) > SIRINA - 120 && tekstPodnozja.length > 4) tekstPodnozja = `${tekstPodnozja.slice(0, -2)}…`;
    page.drawText(tekstPodnozja, { x: MARGINA, y: 31, size: 7, font, color: MUTED });
    const brojStr = `${naslov} ${r.broj_racuna_full ?? '(skica)'}  ·  ${i + 1}/${stranice.length}`;
    page.drawText(brojStr, { x: DESNO - font.widthOfTextAtSize(brojStr, 7), y: 31, size: 7, font, color: MUTED });
    const izradeno = 'Izrađeno u Domovina Fiskal';
    page.drawText(izradeno, { x: DESNO - font.widthOfTextAtSize(izradeno, 6), y: 21, size: 6, font, color: pomijesaj(MUTED, rgb(1, 1, 1), 0.35) });
  });

  return doc.save();
}
