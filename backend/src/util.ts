// Pomoćne funkcije: OIB, novac (integer aritmetika u centima), API ključevi, tekst.

// OIB kontrolna znamenka — ISO 7064, MOD 11,10.
export function validanOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  let kontrolna = 11 - a;
  if (kontrolna === 10) kontrolna = 0;
  return kontrolna === Number(oib[10]);
}

// ── Novac: svi izračuni u centima (integer) da se izbjegnu float greške. ──
// Iznosi u bazi i API-ju su decimalni STRINGOVI s točkom ('1250.00'), po 05-* §6.

// '500.00' | 500 | '-12.5' → centi (integer). Baca Error za >2 decimale / ne-broj.
export function uCente(iznos: string | number, naziv: string): number {
  const s = String(iznos).trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error(`${naziv}: '${s}' nije valjan decimalni iznos (max 2 decimale, točka kao separator)`);
  const predznak = m[1] === '-' ? -1 : 1;
  const cijeli = Number(m[2]);
  const dec = (m[3] ?? '').padEnd(2, '0');
  return predznak * (cijeli * 100 + Number(dec));
}

export function izCenti(centi: number): string {
  const predznak = centi < 0 ? '-' : '';
  const abs = Math.abs(centi);
  return `${predznak}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Količina: do 3 decimale, interno u tisućinkama (integer).
export function uTisucinke(kolicina: string | number, naziv: string): number {
  const s = String(kolicina).trim();
  const m = s.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!m) throw new Error(`${naziv}: '${s}' nije valjana količina (pozitivna, max 3 decimale)`);
  const vrijednost = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
  if (vrijednost <= 0) throw new Error(`${naziv}: količina mora biti veća od 0`);
  return vrijednost;
}

// centi × tisućinke → centi, zaokruženo half-up (komercijalno zaokruživanje).
export function pomnoziCijenuKolicinu(cijenaCenti: number, kolicinaTisucinke: number): number {
  const produkt = cijenaCenti * kolicinaTisucinke; // centi·tisućinke
  return Math.sign(produkt) * Math.round(Math.abs(produkt) / 1000);
}

// PDV iznos: osnovica (centi) × stopa (posto) → centi, half-up.
export function pdvIznos(osnovicaCenti: number, stopaPosto: number): number {
  const produkt = osnovicaCenti * stopaPosto;
  return Math.sign(produkt) * Math.round(Math.abs(produkt) / 100);
}

// ── API ključevi ──
// Sirovi ključ 'dfk_' (domovina fiskal key) + 32 random bajta hex. Pohranjuje se
// SAMO SHA-256 hash; sirovi ključ se prikazuje jednom, pri kreiranju.
export function genApiKljuc(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'dfk_' + hex(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return hex(new Uint8Array(digest));
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function izHexa(s: string): Uint8Array {
  const m = s.match(/.{2}/g) ?? [];
  return new Uint8Array(m.map((h) => parseInt(h, 16)));
}

// ── Tekst ──
// Pun Unicode je podržan (SQLite je UTF-8 nativno; lekcija iz FIRA emoji buga je
// da ulaz NE smije rušiti backend) — samo normaliziramo i mičemo kontrolne znakove.
export function normalizirajTekst(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Godina po hrvatskom (Europe/Zagreb) kalendaru — bitno za godišnji reset numeracije.
export function godinaZagreb(d: Date): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Zagreb', year: 'numeric' }).format(d));
}
