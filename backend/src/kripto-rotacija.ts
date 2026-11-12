// Rotacija KEK-a (ENC_MASTER_KEY) bez ponovnog uploada certifikata.
//
// Envelope enkripcija (kripto.ts): podaci su šifrirani DEK-om po retku, a KEK
// samo omata DEK. Rotacija zato NE dešifrira podatke: za svaki redak odmota DEK
// tekućim KEK-om i omota ga novim. Šifrirani ključ/token ostaju bajt-isti.
//
// Novi KEK dolazi kao ENC_MASTER_KEY_NOVI, pa tekući nikad ne mora izaći iz
// Cloudflarea (2026-11-12: PROD KEK nije postojao nigdje drugdje, a prijašnji
// postupak s ENC_MASTER_KEY_STARI tražio je da ga operater upiše).
//
// Postupak (scripts/rotiraj-kek.sh, docs/knowledge/21-pohrana-certifikata.md §6):
//   1. ENC_MASTER_KEY_NOVI ← novi (Worker čita s oba, šifrira novim);
//   2. POST /admin/kripto/rotacija → DEK-ovi s tekućeg na novi (jedna transakcija);
//   3. ENC_MASTER_KEY ← novi; 4. brisanje ENC_MASTER_KEY_NOVI.
// Suha provjera (?suho=1) vraća oznake oba KEK-a: skripta po njima vidi koju
// verziju secreta Worker stvarno ima (propagacija traje 5–20 s).

import { kekOtvara, oznakaKek, premotajDek } from './kripto';
import type { Env } from './types';

export interface RotacijaIzvjestaj {
  suho: boolean;
  oznakaTekuci: string; // oznakaKek(ENC_MASTER_KEY)
  oznakaNovi: string | null; // oznakaKek(ENC_MASTER_KEY_NOVI), null ako ga nema
  ukupno: number;
  tekuci: number; // otvara ih ENC_MASTER_KEY
  naNovom: number; // otvara ih ENC_MASTER_KEY_NOVI (već premotani ili upisani u prijelazu)
  zaPremotati: number; // nisu na novom, a tekući ih otvara (0 kad nema novog)
  nijedan: number; // ne otvara ih ni jedan KEK — rotacija se tada NE izvodi
  premotano: number;
  nijedanRedovi: string[]; // npr. 'certifikat:3' — za dijagnozu
}

const TABLICE = ['certifikat', 'doku_konfig'] as const;

export async function rotirajKek(env: Env, suho: boolean): Promise<RotacijaIzvjestaj> {
  const tekuciKek = env.ENC_MASTER_KEY;
  if (!tekuciKek) throw new Error('ENC_MASTER_KEY nije postavljen');
  const noviKek = env.ENC_MASTER_KEY_NOVI || null;

  const iz: RotacijaIzvjestaj = {
    suho,
    oznakaTekuci: await oznakaKek(tekuciKek),
    oznakaNovi: noviKek ? await oznakaKek(noviKek) : null,
    ukupno: 0, tekuci: 0, naNovom: 0, zaPremotati: 0, nijedan: 0, premotano: 0, nijedanRedovi: [],
  };
  const zaPremotati: { tablica: (typeof TABLICE)[number]; id: number; dekWrapped: string; dekIv: string }[] = [];

  for (const tablica of TABLICE) {
    const r = await env.DB.prepare(`SELECT id, dek_wrapped, dek_iv FROM ${tablica} ORDER BY id`).all<{ id: number; dek_wrapped: string; dek_iv: string }>();
    for (const red of r.results) {
      iz.ukupno++;
      const tekuciOk = await kekOtvara(tekuciKek, red.dek_wrapped, red.dek_iv);
      const noviOk = !!noviKek && (await kekOtvara(noviKek, red.dek_wrapped, red.dek_iv));
      if (tekuciOk) iz.tekuci++;
      if (noviOk) iz.naNovom++;
      if (!tekuciOk && !noviOk) {
        iz.nijedan++;
        iz.nijedanRedovi.push(`${tablica}:${red.id}`);
      } else if (noviKek && !noviOk) {
        zaPremotati.push({ tablica, id: red.id, dekWrapped: red.dek_wrapped, dekIv: red.dek_iv });
      }
    }
  }
  iz.zaPremotati = zaPremotati.length;

  // Sve ili ništa: ako ijedan redak ne otvara ni jedan KEK, nešto ne štima — ne diramo ništa.
  if (suho || iz.nijedan > 0 || !noviKek || zaPremotati.length === 0) return iz;

  const oznaka = iz.oznakaNovi!;
  const upiti: D1PreparedStatement[] = [];
  for (const z of zaPremotati) {
    const p = await premotajDek(tekuciKek, noviKek, z.dekWrapped, z.dekIv);
    // WHERE dek_wrapped = zatečeni: ako je redak u međuvremenu promijenjen, preskoči.
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
