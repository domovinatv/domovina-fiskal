// D1 pristupni sloj — Fiskalizacija: ZKI/JIR, greške, lease, naknadna dostava (sweep), BEZ_JIRA upiti, log CIS poruka.
// Svi upiti su scoped na tenant_id gdje ima smisla (multi-tenant izolacija je ovdje).



// ───────────────────────── Fiskalizacija (faza 2) ─────────────────────────

// ZKI + QR (zki varijanta) odmah po izdavanju — račun je pravno izdan sa ZKI-jem.
export async function zapisiZki(db: D1Database, tenantId: number, racunId: number, zki: string, qrPayload: string): Promise<void> {
  await db
    .prepare(`UPDATE racun SET zki = ?, qr_payload = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
    .bind(zki, qrPayload, racunId, tenantId)
    .run();
}

// JIR zaprimljen → status 'fiskaliziran' (storniran ostaje storniran), QR prelazi na jir varijantu.
export async function zapisiJir(db: D1Database, tenantId: number, racunId: number, jir: string, qrPayload: string): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET jir = ?, qr_payload = ?, fiskal_greska = NULL,
              status = CASE WHEN status = 'storniran' THEN status ELSE 'fiskaliziran' END,
              fiskal_pokusaja = fiskal_pokusaja + 1, fiskal_zadnji_pokusaj = datetime('now'),
              updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(jir, qrPayload, racunId, tenantId)
    .run();
}

// Neuspjeh: nakDost=1 → automatski retry (sweep) s NakDost=true i NOVIM IdPoruke;
// nakDost=0 → greška u poruci, čeka ručnu intervenciju (i diže alarm).
// Poziva se za SVAKI neuspjeli pokušaj — i rani izlaz prije slanja (cert,
// mapiranje) — da fiskal_pokusaja/zadnji_pokusaj vode backoff sweepa.
export async function zapisiFiskalGresku(
  db: D1Database,
  tenantId: number,
  racunId: number,
  greska: string,
  nakDost: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE racun SET fiskal_greska = ?, fiskal_nak_dost = ?,
              fiskal_pokusaja = fiskal_pokusaja + 1, fiskal_zadnji_pokusaj = datetime('now'),
              updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(greska.slice(0, 2000), nakDost ? 1 : 0, racunId, tenantId)
    .run();
}

// Lease (claim) prije slanja CIS-u: samo jedan pozivatelj u isto vrijeme
// (sinkroni POST, ručni retry, admin, cron). Lease istječe sam nakon 60 s
// (CIS timeout je 15 s), pa pad Workera ne zaključava račun trajno.
//
// K7: vraća TOKEN leasea = točnu upisanu vrijednost `fiskal_zakljucano_do`
// (milisekunde, da se dva leasea razlikuju i unutar iste sekunde), null ako
// lease nije dobiven. Otpuštanje briše samo lease s tim tokenom: ako je naš
// istekao i netko ga je preuzeo, njegov ostaje. Usporedba s datetime('now')
// (sekunde) radi i za ms oblik i za stare retke: isti prefiks, string compare.
export async function zakljucajZaFiskalizaciju(db: D1Database, tenantId: number, racunId: number): Promise<string | null> {
  const red = await db
    .prepare(
      `UPDATE racun SET fiskal_zakljucano_do = strftime('%Y-%m-%d %H:%M:%f', 'now', '+60 seconds')
       WHERE id = ? AND tenant_id = ? AND jir IS NULL
         AND (fiskal_zakljucano_do IS NULL OR fiskal_zakljucano_do < datetime('now'))
       RETURNING fiskal_zakljucano_do`,
    )
    .bind(racunId, tenantId)
    .first<{ fiskal_zakljucano_do: string }>();
  return red?.fiskal_zakljucano_do ?? null;
}

export async function otkljucajFiskalizaciju(db: D1Database, tenantId: number, racunId: number, token: string): Promise<void> {
  await db
    .prepare(`UPDATE racun SET fiskal_zakljucano_do = NULL WHERE id = ? AND tenant_id = ? AND fiskal_zakljucano_do = ?`)
    .bind(racunId, tenantId, token)
    .run();
}

// Automatika naknadne dostave radi 7 dana od izdavanja; poslije toga račun
// traži ljudsku intervenciju (rok je 2 radna dana — alarm ide već nakon 24 h).
export const SWEEP_MAX_DANA = 7;

// Uvjet „izdani fiskalni B2C bez JIR-a" — zajednički sweepu, alarmima i zdravlju.
// 'storniran' (0009): puni storno ne oslobađa original od fiskalizacije.
const BEZ_JIRA = `tip_dokumenta = 'fiskalni_b2c' AND status IN ('izdano', 'storniran') AND jir IS NULL`;

// Kandidati za naknadnu dostavu (cron sweep):
//   * izdani fiskalni bez JIR-a, nezaključani, mlađi od SWEEP_MAX_DANA;
//   * označeni za naknadnu dostavu ILI nikad pokušani;
//   * eksponencijalni backoff: ne prije min(2^pokušaja, 60) min od zadnjeg;
//   * najstariji pokušaj prvi (NULL = nikad), najviše `poTenantu` po tenantu
//     (jedan tenant s pokvarenim certom ne smije zagušiti ostale).
export async function racuniZaNaknadnuDostavu(
  db: D1Database,
  opcije: { limit?: number; poTenantu?: number } = {},
): Promise<{ id: number; tenant_id: number }[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id FROM (
         SELECT id, tenant_id, fiskal_zadnji_pokusaj,
                ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY fiskal_zadnji_pokusaj, id) AS rb
         FROM racun
         WHERE ${BEZ_JIRA}
           AND (fiskal_nak_dost = 1 OR fiskal_pokusaja = 0)
           AND (fiskal_zakljucano_do IS NULL OR fiskal_zakljucano_do < datetime('now'))
           AND julianday(datum_vrijeme) > julianday('now', '-${SWEEP_MAX_DANA} days')
           AND (fiskal_zadnji_pokusaj IS NULL OR fiskal_zadnji_pokusaj <= datetime('now',
                 '-' || (CASE WHEN fiskal_pokusaja >= 6 THEN 60 ELSE (1 << fiskal_pokusaja) END) || ' minutes'))
       )
       WHERE rb <= ?
       ORDER BY fiskal_zadnji_pokusaj, id
       LIMIT ?`,
    )
    .bind(opcije.poTenantu ?? 10, opcije.limit ?? 50)
    .all<{ id: number; tenant_id: number }>();
  return r.results;
}

// Računi stariji od SWEEP_MAX_DANA bez JIR-a izlaze iz automatike (nak_dost=0)
// uz jasnu poruku; vraća ih da ih alarmi prijave.
export async function zaustaviStareBezJira(db: D1Database): Promise<{ id: number; tenant_id: number; broj_racuna_full: string }[]> {
  const r = await db
    .prepare(
      `UPDATE racun SET fiskal_nak_dost = 0,
              fiskal_greska = 'Automatska naknadna dostava zaustavljena nakon ${SWEEP_MAX_DANA} dana — potrebna ručna intervencija. Zadnja greška: ' || COALESCE(fiskal_greska, '—'),
              updated_at = datetime('now')
       WHERE ${BEZ_JIRA}
         AND (fiskal_nak_dost = 1 OR fiskal_pokusaja = 0)
         AND julianday(datum_vrijeme) <= julianday('now', '-${SWEEP_MAX_DANA} days')
       RETURNING id, tenant_id, broj_racuna_full`,
    )
    .all<{ id: number; tenant_id: number; broj_racuna_full: string }>();
  return r.results;
}

// Izdani fiskalni računi bez JIR-a stariji od `sati` (po tenantu) — alarm/zdravlje.
export async function racuniBezJiraStarijiOd(
  db: D1Database,
  sati: number,
): Promise<{ tenant_id: number; broj: number; najstariji: string; primjeri: string }[]> {
  const r = await db
    .prepare(
      `SELECT tenant_id, COUNT(*) AS broj, MIN(datum_vrijeme) AS najstariji,
              group_concat(broj_racuna_full, ', ') AS primjeri
       FROM racun
       WHERE ${BEZ_JIRA} AND julianday(datum_vrijeme) <= julianday('now', ?)
       GROUP BY tenant_id`,
    )
    .bind(`-${sati} hours`)
    .all<{ tenant_id: number; broj: number; najstariji: string; primjeri: string }>();
  return r.results;
}

// Računi bez JIR-a s greškom nakon koje se NE radi automatski retry.
export async function racuniBezRetryja(
  db: D1Database,
): Promise<{ id: number; tenant_id: number; broj_racuna_full: string; fiskal_greska: string | null }[]> {
  const r = await db
    .prepare(
      `SELECT id, tenant_id, broj_racuna_full, fiskal_greska FROM racun
       WHERE ${BEZ_JIRA} AND fiskal_nak_dost = 0 AND fiskal_pokusaja > 0
       ORDER BY id LIMIT 100`,
    )
    .all<{ id: number; tenant_id: number; broj_racuna_full: string; fiskal_greska: string | null }>();
  return r.results;
}

// Audit trag CIS razmjene — potpisani zahtjev i sirovi odgovor (tablica iz 0001).
export async function logPoruka(
  db: D1Database,
  p: {
    tenantId: number;
    racunId: number | null;
    vrstaPoruke: 'racun_b2c' | 'poslovni_prostor' | 'eracun' | 'naplata' | 'odbijanje' | 'isporuka_bez_eracuna';
    smjer: 'zahtjev' | 'odgovor';
    messageId: string;
    okolina: 'test' | 'prod';
    requestXml?: string | null;
    responseXml?: string | null;
    jir?: string | null;
    sifraGreske?: string | null;
    porukaGreske?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO poruka_log (tenant_id, racun_id, vrsta_poruke, smjer, message_id, okolina,
                               request_xml, response_xml, jir, sifra_greske, poruka_greske)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      p.tenantId, p.racunId, p.vrstaPoruke, p.smjer, p.messageId, p.okolina,
      p.requestXml ?? null, p.responseXml ?? null, p.jir ?? null,
      p.sifraGreske ?? null, p.porukaGreske ? p.porukaGreske.slice(0, 2000) : null,
    )
    .run();
}
