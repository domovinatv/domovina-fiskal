// HUB3 2D barkod (PDF417) za plaćanje — standard Hrvatske udruge banaka
// ("2D barkod na nalogu za plaćanje", HUB3/HUB3A). Ovo je barkod ZA PLAĆANJE
// (skeniraju ga m-banking aplikacije), NE fiskalni QR (taj dolazi u fazi 2).
//
// Format (polja odvojena LF, zaglavlje HRVHUB30, iznos 15 znamenki u centima):
//   HRVHUB30 / valuta / iznos / platitelj (ime, adresa, mjesto) /
//   primatelj (naziv, adresa, mjesto) / IBAN / model / poziv na broj /
//   šifra namjene / opis plaćanja

import bwip from 'bwip-js/generic';

export interface Hub3Podaci {
  iznosCenti: number;
  primateljNaziv: string;
  primateljAdresa: string;
  primateljMjesto: string;
  iban: string;
  model: string; // npr. 'HR00'
  pozivNaBroj: string;
  opisPlacanja: string;
  platiteljIme?: string;
  platiteljAdresa?: string;
  platiteljMjesto?: string;
}

// Barkod payload mora ostati u sigurnom ASCII podskupu (banke različito čitaju
// dijakritike u byte-kompakciji) — transliteriramo hrvatske znakove.
function ascii(s: string, max: number): string {
  const mapa: Record<string, string> = {
    č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd',
    Č: 'C', Ć: 'C', Ž: 'Z', Š: 'S', Đ: 'D',
  };
  return s
    .replace(/[čćžšđČĆŽŠĐ]/g, (z) => mapa[z] ?? z)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // skini combining dijakritike nakon NFKD
    .replace(/[^\x20-\x7E]/g, '') // ostale ne-ASCII znakove (emoji itd.) ukloni
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

export function hub3Payload(p: Hub3Podaci): string {
  if (p.iznosCenti < 0) throw new Error('HUB3: iznos ne smije biti negativan');
  const polja = [
    'HRVHUB30',
    'EUR',
    String(p.iznosCenti).padStart(15, '0'),
    ascii(p.platiteljIme ?? '', 30),
    ascii(p.platiteljAdresa ?? '', 27),
    ascii(p.platiteljMjesto ?? '', 27),
    ascii(p.primateljNaziv, 25),
    ascii(p.primateljAdresa, 25),
    ascii(p.primateljMjesto, 27),
    p.iban.replace(/\s/g, ''),
    p.model,
    p.pozivNaBroj.slice(0, 22),
    'COST', // šifra namjene (troškovi) — generička za račune
    ascii(p.opisPlacanja, 35),
  ];
  return polja.join('\n') + '\n';
}

// EPC QR (EPC069-12, "SEPA Credit Transfer QR" / GiroCode). Isti podaci kao
// HUB3, ali europski standard — čitaju ga Keks Pay, Revolut, Wise i sve više
// m-banking aplikacija, dok domaće banke (PBZ, Zaba) čitaju PDF417. Zato oba
// barkoda idu jedan pored drugog: koji god skener kupac ima, radi.
//
// Polja (LF-odvojena, redoslijed je fiksan, prazna repna polja se izostavljaju):
//   BCD / 002 / 1 (UTF-8) / SCT / BIC / naziv primatelja / IBAN /
//   EUR<iznos> / šifra namjene / strukturirani poziv / nestrukturirani opis /
//   info primatelju
export function epcQrPayload(p: Hub3Podaci): string {
  if (p.iznosCenti < 1) throw new Error('EPC QR: iznos mora biti barem 1 cent');
  if (p.iznosCenti > 99_999_999_999) throw new Error('EPC QR: iznos prelazi dopuštenih 999.999.999,99 EUR');

  // Verzija 002 dopušta prazan BIC (domaća SEPA plaćanja).
  // Model+poziv na broj (HR00 12-2026) NIJE ISO 11649 RF referenca, pa ne ide
  // u strukturirano polje (10) nego u nestrukturirani opis (11) — banke ga tamo
  // očekuju za domaće pozive na broj.
  const opis = ascii(`${p.model} ${p.pozivNaBroj} ${p.opisPlacanja}`.replace(/\s+/g, ' ').trim(), 140);
  const polja = [
    'BCD',
    '002',
    '1',
    'SCT',
    '', // BIC — prazan
    ascii(p.primateljNaziv, 70),
    p.iban.replace(/\s/g, ''),
    `EUR${(p.iznosCenti / 100).toFixed(2)}`,
    '', // šifra namjene (AT-44) — namjerno prazna, nije obvezna
    '', // strukturirani poziv (ISO 11649) — vidi gore
    opis,
  ];
  const payload = polja.join('\n');

  // Spec tvrdi limit od 331 bajta; preko toga dio čitača odbija kod.
  if (new TextEncoder().encode(payload).length > 331) {
    throw new Error('EPC QR: payload prelazi 331 bajt');
  }
  return payload;
}

export interface Hub3Barkod {
  putanja: string; // SVG path d-atribut
  sirina: number;  // viewBox širina
  visina: number;  // viewBox visina
}

// PDF417 po HUB3 zahtjevu: razina korekcije 4. Vraća vektorski path (bez
// rasterizacije — čisti JS, radi na Workers) koji PDF sloj crta u mjerilu.
export function hub3Barkod(p: Hub3Podaci): Hub3Barkod {
  // eclevel/columns su BWIPP opcije za pdf417 koje tipovi ne izlažu (prosljeđuju se BWIPP-u).
  return izSvg({ bcid: 'pdf417', text: hub3Payload(p), eclevel: 4, columns: 9 }, 'HUB3');
}

// EPC QR: spec preporučuje razinu korekcije M (kod je gušći od fiskalnog QR-a,
// a mora ostati čitljiv s ekrana i s papira).
export function epcQrBarkod(p: Hub3Podaci): Hub3Barkod {
  return izSvg({ bcid: 'qrcode', text: epcQrPayload(p), eclevel: 'M' }, 'EPC QR');
}

// Fiskalni QR (02-* §10): model 2, korekcija L (minimalna dopuštena), bez loga.
// Payload je URL porezna.gov.hr/rn s jir/zki + datv + izn.
export function fiskalniQrBarkod(payload: string): Hub3Barkod {
  return izSvg({ bcid: 'qrcode', text: payload, eclevel: 'L' }, 'fiskalni QR');
}

function izSvg(opcije: Record<string, unknown>, naziv: string): Hub3Barkod {
  const svg = bwip.toSVG(opcije as unknown as Parameters<typeof bwip.toSVG>[0]);
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const path = svg.match(/<path d="([^"]+)"/);
  if (!viewBox || !path) throw new Error(`${naziv}: bwip-js nije vratio očekivani SVG`);
  return { putanja: path[1], sirina: Number(viewBox[1]), visina: Number(viewBox[2]) };
}
