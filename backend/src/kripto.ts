// Envelope enkripcija certifikata at-rest (docs/knowledge/04-* §7, 11-* §4):
//   * per-certifikat DEK (AES-256-GCM) enkriptira P12 sadržaj,
//   * DEK je omotan (wrapped) KEK-om iz `ENC_MASTER_KEY` Worker Secreta,
//   * u bazu idu: šifrirani blob + IV, omotani DEK + IV, id KEK-a. Nikad plaintext.

import { hex, izHexa } from './util';

export const ENC_KEY_ID = 'ENC_MASTER_KEY:v1';

async function uvoziKek(masterHex: string): Promise<CryptoKey> {
  if (!/^[0-9a-fA-F]{64}$/.test(masterHex)) {
    throw new Error('ENC_MASTER_KEY mora biti točno 64 hex znaka (32 bajta) — generiraj s `openssl rand -hex 32`');
  }
  return crypto.subtle.importKey('raw', izHexa(masterHex), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export interface EnkriptiraniCertifikat {
  pkcs12Encrypted: ArrayBuffer;
  encIv: string;      // hex
  dekWrapped: string; // hex
  dekIv: string;      // hex
  // Faza 2: privatni ključ (PKCS8 PEM) izvučen iz P12, enkriptiran ISTIM DEK-om
  // uz ZASEBAN IV — potpisivanje ne mora ponovno parsirati P12.
  kljucPemEncrypted: ArrayBuffer;
  kljucIv: string;    // hex
}

export async function enkriptirajCertifikat(
  masterHex: string,
  p12: ArrayBuffer,
  kljucPem: string,
): Promise<EnkriptiraniCertifikat> {
  const kek = await uvoziKek(masterHex);
  const dek = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])) as CryptoKey;

  const encIv = crypto.getRandomValues(new Uint8Array(12));
  const pkcs12Encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: encIv }, dek, p12);

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
    pkcs12Encrypted,
    encIv: hex(encIv),
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
  masterHex: string,
  e: { tokenEncrypted: string; encIv: string; dekWrapped: string; dekIv: string },
): Promise<string> {
  const kek = await uvoziKek(masterHex);
  const dekRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: izHexa(e.dekIv) }, kek, izHexa(e.dekWrapped));
  const dek = await crypto.subtle.importKey('raw', dekRaw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: izHexa(e.encIv) }, dek, izHexa(e.tokenEncrypted));
  return new TextDecoder().decode(pt);
}

// Dekripcija privatnog ključa (PKCS8 PEM) u trenutku potpisivanja — DEK i
// plaintext žive isključivo u memoriji poziva, nikad se ne perzistiraju/logiraju.
export async function dekriptirajKljucPem(
  masterHex: string,
  enkriptirano: { kljucPemEncrypted: ArrayBuffer | ArrayLike<number>; kljucIv: string; dekWrapped: string; dekIv: string },
): Promise<string> {
  const kek = await uvoziKek(masterHex);
  const dekRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: izHexa(enkriptirano.dekIv) },
    kek,
    izHexa(enkriptirano.dekWrapped),
  );
  const dek = await crypto.subtle.importKey('raw', dekRaw, 'AES-GCM', false, ['decrypt']);
  const pem = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: izHexa(enkriptirano.kljucIv) },
    dek,
    uBafer(enkriptirano.kljucPemEncrypted),
  );
  return new TextDecoder().decode(pem);
}
