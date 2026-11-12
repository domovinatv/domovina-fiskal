// Rotacija KEK-a (ENC_MASTER_KEY) bez ponovnog uploada certifikata.
//
// Envelope enkripcija (kripto.ts): podaci su šifrirani DEK-om po retku, a KEK
// samo omata DEK. Rotacija zato NE dešifrira podatke: za svaki redak odmota DEK
// starim KEK-om i omota ga novim. Šifrirani ključ/token ostaju bajt-isti.
//
// Postupak (scripts/rotiraj-kek.sh, docs/knowledge/21-pohrana-certifikata.md §6):
//   1. ENC_MASTER_KEY_STARI = dosadašnji KEK, ENC_MASTER_KEY = novi
//      (Worker čita s oba, šifrira novim — nema prekida rada);
//   0. prije zamjene: postavi samo ENC_MASTER_KEY_STARI i suhom provjerom
//      potvrdi stariOtvara = ukupno (upisani stari KEK je stvarno tekući);
//   2. POST /admin/kripto/rotacija?suho=1 → provjera da stari otvara sve;
//   3. POST /admin/kripto/rotacija → premotavanje;
//   4. suha provjera bez starog → sve na novom; obrisati ENC_MASTER_KEY_STARI.

import { kekOtvara, oznakaKek, premotajDek } from './kripto';
import type { Env } from './types';

export interface RotacijaIzvjestaj {
  suho: boolean;
  ukupno: number;
  tekuci: number; // otvara ih tekući ENC_MASTER_KEY (već rotirani ili nikad stari)
  stari: number; // otvara ih samo ENC_MASTER_KEY_STARI (treba premotati)
  nijedan: number; // ne otvara ih ni jedan KEK — rotacija se tada NE izvodi
  stariOtvara: number; // koliko redaka otvara ENC_MASTER_KEY_STARI (neovisno o tekućem)
  premotano: number;
  nijedanRedovi: string[]; // npr. 'certifikat:3' — za dijagnozu
}

const TABLICE = ['certifikat', 'doku_konfig'] as const;

export async function rotirajKek(env: Env, suho: boolean): Promise<RotacijaIzvjestaj> {
  const novi = env.ENC_MASTER_KEY;
  if (!novi) throw new Error('ENC_MASTER_KEY nije postavljen');
  const stariKek = env.ENC_MASTER_KEY_STARI;

  const iz: RotacijaIzvjestaj = { suho, ukupno: 0, tekuci: 0, stari: 0, nijedan: 0, stariOtvara: 0, premotano: 0, nijedanRedovi: [] };
  const zaPremotati: { tablica: (typeof TABLICE)[number]; id: number; dekWrapped: string; dekIv: string }[] = [];

  for (const tablica of TABLICE) {
    const r = await env.DB.prepare(`SELECT id, dek_wrapped, dek_iv FROM ${tablica} ORDER BY id`).all<{ id: number; dek_wrapped: string; dek_iv: string }>();
    for (const red of r.results) {
      iz.ukupno++;
      const stariOk = !!stariKek && (await kekOtvara(stariKek, red.dek_wrapped, red.dek_iv));
      if (stariOk) iz.stariOtvara++;
      if (await kekOtvara(novi, red.dek_wrapped, red.dek_iv)) {
        iz.tekuci++;
      } else if (stariOk) {
        iz.stari++;
        zaPremotati.push({ tablica, id: red.id, dekWrapped: red.dek_wrapped, dekIv: red.dek_iv });
      } else {
        iz.nijedan++;
        iz.nijedanRedovi.push(`${tablica}:${red.id}`);
      }
    }
  }

  // Sve ili ništa: ako ijedan redak ne otvara ni jedan KEK, nešto ne štima
  // (krivi stari KEK, redak treće okoline) — ne diramo ništa.
  if (suho || iz.nijedan > 0 || !stariKek || zaPremotati.length === 0) return iz;

  const oznaka = await oznakaKek(novi);
  const upiti: D1PreparedStatement[] = [];
  for (const z of zaPremotati) {
    const p = await premotajDek(stariKek, novi, z.dekWrapped, z.dekIv);
    // WHERE dek_wrapped = stari: ako je redak u međuvremenu promijenjen, preskoči.
    upiti.push(
      env.DB.prepare(`UPDATE ${z.tablica} SET dek_wrapped = ?, dek_iv = ?, enc_key_id = ? WHERE id = ? AND dek_wrapped = ?`).bind(
        p.dekWrapped,
        p.dekIv,
        oznaka,
        z.id,
        z.dekWrapped,
      ),
    );
  }
  const rez = await env.DB.batch(upiti); // jedna transakcija
  iz.premotano = rez.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  return iz;
}
