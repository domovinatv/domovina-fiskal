// Alarmi (Faza 4.2, nalaz N4): nitko ne gleda admin, pa se problemi koji
// ugrožavaju rok fiskalizacije (2 radna dana, čl. 21. st. 2.) javljaju mailom.
// Mail ide platformi (ALARM_EMAIL) i kontaktu tenanta (tenant.email) kad
// alarm pripada tenantu. Deduplikacija preko tablice `alarm`: isti ključ se
// ne šalje češće od svog intervala. Bez kanala/adrese alarm ostaje zapisan u
// tablici i u logu (console.error) — admin ga vidi na naslovnoj stranici.

import type { Env } from './types';
import {
  certifikatiKojiIsticu,
  dohvatiStanje,
  getTenant,
  postaviStanje,
  racuniBezJiraStarijiOd,
  racuniBezRetryja,
} from './db';
import { emailKonfiguriran, posaljiObavijest } from './email';
import { cisEcho, okolinaIzEnv } from './fiskal/fiskalizacija';
import { cisPosluziteljCertIstice } from './fiskal/cis';

const SAT = 3600;
const DAN = 24 * SAT;

export interface Alarm {
  kljuc: string;
  tenantId: number | null;
  naslov: string;
  tekst: string;
  intervalSekundi: number; // najkraći razmak između dva slanja istog ključa
}

// Upiši/obnovi alarm i vrati true ako ga TREBA poslati sada (atomski: dva
// istodobna sweepa ne šalju isti mail dvaput).
async function oznaciZaSlanje(db: D1Database, a: Alarm): Promise<boolean> {
  const red = await db
    .prepare(
      `INSERT INTO alarm (kljuc, tenant_id, poruka) VALUES (?1, ?2, ?3)
       ON CONFLICT (kljuc) DO UPDATE SET
         poruka = excluded.poruka,
         zadnje_slanje = datetime('now'),
         broj_slanja = broj_slanja + 1
       WHERE alarm.zadnje_slanje <= datetime('now', ?4)
       RETURNING kljuc`,
    )
    .bind(a.kljuc, a.tenantId, `${a.naslov}\n\n${a.tekst}`.slice(0, 4000), `-${a.intervalSekundi} seconds`)
    .first<{ kljuc: string }>();
  return !!red;
}

export async function posaljiAlarm(env: Env, a: Alarm): Promise<boolean> {
  if (!(await oznaciZaSlanje(env.DB, a))) return false;
  const okolina = okolinaIzEnv(env);
  const primatelji = new Set<string>();
  if (env.ALARM_EMAIL) primatelji.add(env.ALARM_EMAIL);
  if (a.tenantId) {
    const tenant = await getTenant(env.DB, a.tenantId);
    if (tenant?.email) primatelji.add(tenant.email);
  }
  const subject = `[Domovina Fiskal${okolina === 'test' ? ' TEST' : ''}] ${a.naslov}`;
  const text = `${a.tekst}\n\n—\nOkolina: ${okolina}\nAlarm: ${a.kljuc}\nOvaj alarm se ponavlja dok se uzrok ne ukloni (najviše jednom u ${Math.round(a.intervalSekundi / SAT)} h).`;
  if (!primatelji.size || !emailKonfiguriran(env)) {
    console.error(`ALARM (bez primatelja/kanala): ${subject} — ${a.tekst}`);
    return true;
  }
  for (const na of primatelji) {
    try {
      await posaljiObavijest(env, { na, subject, text });
    } catch (e) {
      console.error(`ALARM slanje na ${na} nije uspjelo: ${(e as Error).message} — ${subject}`);
    }
  }
  return true;
}

// CIS echo (bez certifikata) — bilježi zadnji pokušaj i zadnji uspjeh.
export async function provjeriCisEcho(env: Env): Promise<boolean> {
  const sada = new Date().toISOString();
  await postaviStanje(env.DB, 'cis_echo_zadnji_pokusaj', sada);
  try {
    const r = await cisEcho(env);
    if (r.posluziteljCertNotAfter) await postaviStanje(env.DB, 'cis_posluzitelj_cert_not_after', r.posluziteljCertNotAfter);
    if (r.ok) await postaviStanje(env.DB, 'cis_echo_zadnji_ok', sada);
    else await postaviStanje(env.DB, 'cis_echo_zadnja_greska', `neočekivan echo: ${r.odgovor.slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    await postaviStanje(env.DB, 'cis_echo_zadnja_greska', (e as Error).message.slice(0, 500));
    return false;
  }
}

// Skup alarma koji se izračunavaju iz stanja baze. `dnevno` dodaje provjere
// koje se mijenjaju sporo (istek certifikata) — dnevni cron.
export async function izracunajAlarme(env: Env, opcije: { dnevno?: boolean } = {}): Promise<Alarm[]> {
  const db = env.DB;
  const okolina = okolinaIzEnv(env);
  const alarmi: Alarm[] = [];

  for (const g of await racuniBezJiraStarijiOd(db, 24)) {
    alarmi.push({
      kljuc: `bez-jira-24h:${g.tenant_id}`,
      tenantId: g.tenant_id,
      naslov: `${g.broj} fiskalnih računa bez JIR-a dulje od 24 h`,
      tekst:
        `Tenant ${g.tenant_id}: ${g.broj} izdanih fiskalnih računa još nema JIR (najstariji ${g.najstariji}).\n` +
        `Računi: ${g.primjeri.slice(0, 1000)}\n\n` +
        `Rok za naknadnu dostavu je 2 radna dana (čl. 21. st. 2.). Provjeri fiskal_greska na računima u adminu.`,
      intervalSekundi: 6 * SAT,
    });
  }

  for (const r of await racuniBezRetryja(db)) {
    alarmi.push({
      kljuc: `bez-retryja:${r.id}`,
      tenantId: r.tenant_id,
      naslov: `Račun ${r.broj_racuna_full} — fiskalizacija neće biti ponovljena automatski`,
      tekst:
        `Račun ${r.broj_racuna_full} (id ${r.id}, tenant ${r.tenant_id}) nema JIR, a zadnja greška ne dopušta automatski retry:\n` +
        `${r.fiskal_greska ?? '—'}\n\nNakon ispravka (certifikat, podaci) pokreni ručno: POST /api/v1/racun/${r.id}/fiskaliziraj ili gumb u adminu.`,
      intervalSekundi: DAN,
    });
  }

  // CIS echo: alarm kad zadnji uspjeh nije unutar 1 h, a pokušaja ima.
  const stanje = await dohvatiStanje(db);
  const zadnjiPokusaj = stanje.cis_echo_zadnji_pokusaj?.vrijednost;
  const zadnjiOk = stanje.cis_echo_zadnji_ok?.vrijednost;
  if (zadnjiPokusaj && (!zadnjiOk || Date.parse(zadnjiPokusaj) - Date.parse(zadnjiOk) > SAT * 1000)) {
    alarmi.push({
      kljuc: `cis-echo:${okolina}`,
      tenantId: null,
      naslov: `CIS (${okolina}) ne odgovara na echo dulje od 1 h`,
      tekst: `Zadnji uspješan echo: ${zadnjiOk ?? 'nikad'}; zadnji pokušaj: ${zadnjiPokusaj}.\nZadnja greška: ${stanje.cis_echo_zadnja_greska?.vrijednost ?? '—'}\nRačuni se izdaju sa ZKI-jem i čekaju naknadnu dostavu.`,
      intervalSekundi: 6 * SAT,
    });
  }

  if (opcije.dnevno) {
    // Certifikati tenanata: ≤ 30 dana, pa ponovno ≤ 7 dana. not_after je u
    // ključu — novi (obnovljeni) cert ne nasljeđuje stari alarm.
    const za7 = await certifikatiKojiIsticu(db, 7);
    const kljucevi7 = new Set(za7.map((c) => `${c.tenant_id}:${c.okolina}:${c.not_after}`));
    for (const c of await certifikatiKojiIsticu(db, 30)) {
      const id = `${c.tenant_id}:${c.okolina}:${c.not_after}`;
      const prag = kljucevi7.has(id) ? 7 : 30;
      const istekao = Date.parse(c.not_after) <= Date.now();
      alarmi.push({
        kljuc: `cert-${prag}:${id}`,
        tenantId: c.tenant_id,
        naslov: istekao
          ? `Certifikat za fiskalizaciju (${c.okolina}) JE ISTEKAO ${c.not_after.slice(0, 10)}`
          : `Certifikat za fiskalizaciju (${c.okolina}) ističe ${c.not_after.slice(0, 10)}`,
        tekst:
          `Tenant ${c.tenant_id}: aktivni ${c.okolina} certifikat ${istekao ? 'je istekao' : 'ističe'} ${c.not_after}.\n` +
          `Bez valjanog certifikata API odbija fiskalne račune (409). Obnovi certifikat (FINA/AKD) i uploadaj novi P12 u adminu.`,
        intervalSekundi: istekao ? DAN : 30 * DAN,
      });
    }

    const posluzitelj = cisPosluziteljCertIstice(okolina, 30, stanje.cis_posluzitelj_cert_not_after?.vrijednost);
    if (posluzitelj) {
      alarmi.push({
        kljuc: `cis-posluzitelj-cert:${okolina}:${posluzitelj.notAfter}`,
        tenantId: null,
        naslov: `CIS poslužiteljski certifikat (${okolina}) ističe ${posluzitelj.notAfter.slice(0, 10)}`,
        tekst:
          `Poslužiteljski certifikat CIS-a (${okolina}) ističe ${posluzitelj.notAfter} (zadnji TLS handshake ili konstanta u kodu).\n` +
          `CIS ga obično zamijeni prije isteka; novi cert istog izdavatelja (Fina CA 2020) radi bez izmjene koda.\n` +
          `Provjeri na fina.hr i stranicama Porezne je li najavljen novi cert ili CA; mijenja li se izdavatelj, dodaj novi CA ` +
          `u src/fiskal/ca/ UZ postojeći i ažuriraj CIS_POSLUZITELJ_CERT u src/fiskal/cis.ts — inače TLS prema CIS-u puca.`,
        intervalSekundi: 7 * DAN,
      });
    }
  }
  return alarmi;
}

export async function obradiAlarme(env: Env, opcije: { dnevno?: boolean } = {}): Promise<string[]> {
  const poslani: string[] = [];
  for (const a of await izracunajAlarme(env, opcije)) {
    if (await posaljiAlarm(env, a)) poslani.push(a.kljuc);
  }
  return poslani;
}
