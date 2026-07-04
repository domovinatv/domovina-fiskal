// ZKI (Zaštitni kod izdavatelja) — točan algoritam iz docs/knowledge/02-* §2
// (potvrđen u 99-gap-analiza R2: PU 4616 + spec. v2.6 §12):
//   zki = hex( MD5( RSA-SHA1( oib + datVrij + brRac + oznPP + oznNU + iznos ) ) )
// KRITIČNO: datum u ZKI konkatenaciji je 'dd.MM.yyyy HH:mm:ss' s RAZMAKOM,
// a u XML poruci 'dd.MM.yyyyTHH:mm:ss' s 'T' — dva različita formata!
// MD5 i node:crypto rade na Workers uz nodejs_compat (11-* §1, R11 ✅).

import { createHash, createSign } from 'node:crypto';

// Dijelovi datuma/vremena u Europe/Zagreb zoni iz ISO 8601 (UTC) zapisa.
function zagrebDijelovi(iso: string): { dd: string; MM: string; yyyy: string; HH: string; mm: string; ss: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Neispravan datum za fiskalizaciju: '${iso}'`);
  const dijelovi = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zagreb',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const uzmi = (tip: string) => dijelovi.find((p) => p.type === tip)?.value ?? '';
  // 'en-GB' zna vratiti sat '24' za ponoć — normaliziraj u '00'.
  const HH = uzmi('hour') === '24' ? '00' : uzmi('hour');
  return { dd: uzmi('day'), MM: uzmi('month'), yyyy: uzmi('year'), HH, mm: uzmi('minute'), ss: uzmi('second') };
}

// 'dd.MM.yyyy HH:mm:ss' — SAMO za ZKI konkatenaciju (razmak!).
export function zkiDatum(iso: string): string {
  const p = zagrebDijelovi(iso);
  return `${p.dd}.${p.MM}.${p.yyyy} ${p.HH}:${p.mm}:${p.ss}`;
}

// 'dd.MM.yyyyTHH:mm:ss' — za XML elemente DatVrijeme/DatumVrijeme ('T'!).
export function xmlDatum(iso: string): string {
  const p = zagrebDijelovi(iso);
  return `${p.dd}.${p.MM}.${p.yyyy}T${p.HH}:${p.mm}:${p.ss}`;
}

// 'GGGGMMDD_HHMM' — za fiskalni QR (`datv`, 02-* §10).
export function qrDatum(iso: string): string {
  const p = zagrebDijelovi(iso);
  return `${p.yyyy}${p.MM}${p.dd}_${p.HH}${p.mm}`;
}

export interface ZkiUlaz {
  oib: string;      // OIB obveznika (11 znamenki)
  datVrijIso: string; // ISO 8601 datum izdavanja (interno; formatira se ovdje)
  brOznRac: string; // brojčana oznaka računa, bez vodećih nula (npr. '17')
  oznPosPr: string; // oznaka poslovnog prostora
  oznNapUr: string; // oznaka naplatnog uređaja
  iznosUkupno: string; // decimalna TOČKA, 2 decimale (npr. '30.00'; '-' za storno)
}

export function izracunajZki(privatniKljucPem: string, u: ZkiUlaz): string {
  const medjurezultat = u.oib + zkiDatum(u.datVrijIso) + u.brOznRac + u.oznPosPr + u.oznNapUr + u.iznosUkupno;
  const potpis = createSign('RSA-SHA1').update(medjurezultat, 'utf8').sign(privatniKljucPem);
  return createHash('md5').update(potpis).digest('hex'); // 32 hex, lowercase
}

// Fiskalni QR (02-* §10): porezna.gov.hr/rn + jir ILI zki + datv + izn (centi,
// cijeli broj bez separatora/vodećih nula; '-' za storno). Polje je `izn` (P7).
export function fiskalniQrPayload(p: { jir: string | null; zki: string; datVrijIso: string; iznosCenti: number }): string {
  const ident = p.jir ? `jir=${p.jir}` : `zki=${p.zki}`;
  return `https://porezna.gov.hr/rn?${ident}&datv=${qrDatum(p.datVrijIso)}&izn=${p.iznosCenti}`;
}
