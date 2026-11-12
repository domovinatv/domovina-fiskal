// Envelope enkripcija certifikata at-rest (docs/knowledge/04-* §7, 11-* §4):
//   * per-certifikat DEK (AES-256-GCM) enkriptira privatni ključ (PKCS8 PEM;
//     cijeli P12 se od 0011 ne sprema — K16),
//   * DEK je omotan (wrapped) KEK-om iz `ENC_MASTER_KEY` Worker Secreta,
//   * u bazu idu: šifrirani blob + IV, omotani DEK + IV, id KEK-a. Nikad plaintext.

import { hex, izHexa } from './util';

// Oznaka KEK-a u stupcu enc_key_id: prvih 12 hex znakova SHA-256 ključa —
// po njoj se vidi kojim je KEK-om redak omotan, a ključ se iz nje ne može
// izvesti. Redovi prije rotacije imaju oznaku 'ENC_MASTER_KEY:v1'.
export async function oznakaKek(masterHex: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', izHexa(masterHex)));
  return `ENC_MASTER_KEY:${hex(h).slice(0, 12)}`;
}

// KEK-ovi kojima se smije ČITATI: tekući, pa (samo tijekom rotacije) stari.
// Šifrira se uvijek samo tekućim.
export function kekoviZaCitanje(env: { ENC_MASTER_KEY?: string; ENC_MASTER_KEY_STARI?: string }): string[] {
  return [env.ENC_MASTER_KEY, env.ENC_MASTER_KEY_STARI].filter((k): k is string => !!k);
}

// Odmota DEK prvim KEK-om koji uspije. AES-GCM autentificira, pa pogrešan KEK
// sigurno baca (nema „krivog, ali uspješnog” odmotavanja).
async function odmotajDek(kekovi: string | string[], dekWrapped: string, dekIv: string): Promise<ArrayBuffer> {
  const lista = typeof kekovi === 'string' ? [kekovi] : kekovi;
  let zadnja: unknown = new Error('Nijedan KEK nije zadan (ENC_MASTER_KEY)');
  for (const k of lista) {
    try {
      return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: izHexa(dekIv) }, await uvoziKek(k), izHexa(dekWrapped));
    } catch (e) {
      zadnja = e;
    }
  }
  throw zadnja;
}

// Otvara li ovaj KEK omotani DEK? (rotacija, provjera)
export async function kekOtvara(kekHex: string, dekWrapped: string, dekIv: string): Promise<boolean> {
  return odmotajDek(kekHex, dekWrapped, dekIv).then(
    () => true,
    () => false,
  );
}

// Rotacija: DEK odmotan starim KEK-om omota se novim (novi IV). Šifrirani
// podaci (ključ, token) se ne diraju — DEK ostaje isti.
export async function premotajDek(
  stariHex: string,
  noviHex: string,
  dekWrapped: string,
  dekIv: string,
): Promise<{ dekWrapped: string; dekIv: string }> {
  const dekRaw = await odmotajDek(stariHex, dekWrapped, dekIv);
  const noviIv = crypto.getRandomValues(new Uint8Array(12));
  const omotan = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: noviIv }, await uvoziKek(noviHex), dekRaw);
  return { dekWrapped: hex(new Uint8Array(omotan)), dekIv: hex(noviIv) };
}

async function uvoziKek(masterHex: string): Promise<CryptoKey> {
  if (!/^[0-9a-fA-F]{64}$/.test(masterHex)) {
    throw new Error('ENC_MASTER_KEY mora biti točno 64 hex znaka (32 bajta) — generiraj s `openssl rand -hex 32`');
  }
  return crypto.subtle.importKey('raw', izHexa(masterHex), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// K16 (0011): cijeli P12 se više ne šifrira ni ne sprema — samo izvučeni ključ.
export interface EnkriptiraniCertifikat {
  dekWrapped: string; // hex
  dekIv: string;      // hex
  // Faza 2: privatni ključ (PKCS8 PEM) izvučen iz P12, enkriptiran ISTIM DEK-om
  // uz ZASEBAN IV — potpisivanje ne mora ponovno parsirati P12.
  kljucPemEncrypted: ArrayBuffer;
  kljucIv: string;    // hex
}

export async function enkriptirajCertifikat(masterHex: string, kljucPem: string): Promise<EnkriptiraniCertifikat> {
  const kek = await uvoziKek(masterHex);
  const dek = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])) as CryptoKey;

  const kljucIv = crypto.getRandomValues(new Uint8Array(12));
  const kljucPemEncrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: kljucIv },
    dek,
    new TextEncoder().encode(kljucPem),
  );

  const dekRaw = (await crypto.subtle.exportKey('raw', dek)) as ArrayBuffer;
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const dekWrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dekIv }, kek, dekRaw);

  return {
    dekWrapped: hex(new Uint8Array(dekWrapped)),
    dekIv: hex(dekIv),
    kljucPemEncrypted,
    kljucIv: hex(kljucIv),
  };
}

// D1 BLOB stupci se u rezultatima znaju vratiti kao Array<number> (ne
// ArrayBuffer) — normaliziraj prije predaje WebCrypto API-ju.
function uBafer(b: ArrayBuffer | ArrayLike<number>): ArrayBuffer {
  if (b instanceof ArrayBuffer) return b;
  return new Uint8Array(b).buffer;
}

// ── Generička tajna (npr. doku API-TOKEN) — isti envelope kao certifikat, ali
//    ulaz/izlaz je string i sve se sprema kao hex (nema BLOB stupca). ──
export interface EnkriptiranaTajna {
  tokenEncrypted: string; // hex
  encIv: string; // hex
  dekWrapped: string; // hex
  dekIv: string; // hex
}

export async function enkriptirajTajnu(masterHex: string, plaintext: string): Promise<EnkriptiranaTajna> {
  const kek = await uvoziKek(masterHex);
  const dek = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])) as CryptoKey;

  const encIv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: encIv }, dek, new TextEncoder().encode(plaintext));

  const dekRaw = (await crypto.subtle.exportKey('raw', dek)) as ArrayBuffer;
  const dekIv = crypto.getRandomValues(new Uint8Array(12));
  const dekWrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dekIv }, kek, dekRaw);

  return {
    tokenEncrypted: hex(new Uint8Array(ct)),
    encIv: hex(encIv),
    dekWrapped: hex(new Uint8Array(dekWrapped)),
    dekIv: hex(dekIv),
  };
}

// Dekripcija tajne u trenutku poziva — plaintext živi samo u memoriji poziva.
export async function dekriptirajTajnu(
  kekovi: string | string[],
  e: { tokenEncrypted: string; encIv: string; dekWrapped: string; dekIv: string },
): Promise<string> {
  const dekRaw = await odmotajDek(kekovi, e.dekWrapped, e.dekIv);
  const dek = await crypto.subtle.importKey('raw', dekRaw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: izHexa(e.encIv) }, dek, izHexa(e.tokenEncrypted));
  return new TextDecoder().decode(pt);
}

// Dekripcija privatnog ključa (PKCS8 PEM) u trenutku potpisivanja — DEK i
// plaintext žive isključivo u memoriji poziva, nikad se ne perzistiraju/logiraju.
export async function dekriptirajKljucPem(
  kekovi: string | string[],
  enkriptirano: { kljucPemEncrypted: ArrayBuffer | ArrayLike<number>; kljucIv: string; dekWrapped: string; dekIv: string },
): Promise<string> {
  const dekRaw = await odmotajDek(kekovi, enkriptirano.dekWrapped, enkriptirano.dekIv);
  const dek = await crypto.subtle.importKey('raw', dekRaw, 'AES-GCM', false, ['decrypt']);
  const pem = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: izHexa(enkriptirano.kljucIv) },
    dek,
    uBafer(enkriptirano.kljucPemEncrypted),
  );
  return new TextDecoder().decode(pem);
}
