# 23 — Backup i vraćanje

Stanje: 2026-11-23. Sve podatke platforme drži JEDNA D1 baza (`fiskal_domovina`, TEST
`fiskal_domovina_test`). R2 za račune ne postoji: PDF se generira iz D1 na zahtjev. Supabase
(api.domovina.ai) drži samo GoTrue identitete za dashboard, nikakve fiskalne podatke.

## Zašto

- Fiskalizacijske evidencije: 6 godina od isteka godine izdavanja (`01-pravni-okvir.md` §2.8).
- Izlazni računi kao knjigovodstvene isprave: ⚠️ vjerojatno 11 godina (Zakon o računovodstvu,
  čl. 10.), nije provjereno u tekstu NN; zato je lock 11 godina (4018 dana).
- D1 Time Travel (30 dana, point-in-time) štiti od krive migracije, ali ne od brisanja baze,
  gubitka Cloudflare računa ni roka dužeg od 30 dana.

## Razina 1 — platformski dnevni snapshot (od 2026-11-23)

| | PROD | TEST |
|---|---|---|
| R2 bucket (account D.O.M., jurisdikcija **EU**, privatan) | `fiskal-backup-secured` | `fiskal-backup-secured-test` |
| Zaštita | Bucket Lock `cuvanje-11-godina`: 4018 dana, svi prefiksi | lifecycle `brisi-30-dana` |
| Ključ objekta | `d1/prod/YYYY/MM/YYYY-MM-DDTHH-MM-SSZ.sql.gz` | `d1/test/…` |

- Cron `30 1 * * *` (src/backup/index.ts → platforma.ts); ručno: `POST /admin/backup`
  (Bearer `ADMIN_SKRIPTA_TOKEN`) vraća JSON s ključem.
- Sadržaj: SQL dump (shema + svi podaci osim `admin_sessions`/`admin_challenges`), gzip.
  Redoslijed: tablice → INSERT-i → indeksi/okidači (okidači prije podataka bi odbili
  storno par: „STORNO: original je već storniran”). Uključuje `d1_migrations`.
- Snimka je konzistentna: svi SELECT-i u jednom `db.batch()` (jedna transakcija).
- customMetadata: `sha256_sql` (nekomprimiranog SQL-a), `redaka`, `zadnja_migracija`, `tablice`.
- `sustav_stanje.backup_zadnji` (JSON) / `backup_zadnja_greska`; dnevni alarm (06:00) ako
  zadnji uspješni nije mlađi od 30 h.
- Ograničenje: dump se gradi u memoriji Workera. Dobro do ~50 MB baze; iznad toga prijeći na
  D1 export REST API ili izvoz po dijelovima.
- Dump sadrži `certifikat.kljuc_pem_encrypted` šifriran KEK-om (`ENC_MASTER_KEY`). KEK nije
  u backupu i ne smije biti; bez njega se certifikati moraju ponovno uploadati (ostalo radi).

### Vraćanje (provjereno 2026-11-23 na TEST snimci: 4132 naredbe, isti brojevi redaka)

```bash
cd backend
npx wrangler r2 object get "fiskal-backup-secured/d1/prod/2026/11/<datoteka>.sql.gz" \
  --file dump.sql.gz -J eu --remote
gunzip dump.sql.gz
shasum -a 256 dump.sql          # mora biti jednak customMetadata.sha256_sql
# NOVA prazna baza (nikad preko postojeće!):
npx wrangler d1 create fiskal_domovina_restore --location eeur
npx wrangler d1 execute fiskal_domovina_restore --remote --file dump.sql
# pa zamijeniti database_id u wrangler.toml i deployati, ili samo čitati podatke.
```

Za vraćanje na trenutak unutar zadnjih 30 dana prvo razmotri D1 Time Travel
(`wrangler d1 time-travel restore`), on ne treba dump.

## Razina 2 — BYO backup u tenantov Cloudflare R2 (od 2026-11-23, migracija 0013)

Opcionalno, po tenantu. Obavezan je **samo API token** (Account API Token, dozvola
`Account · Workers R2 Storage · Edit`). Account ID se otkriva iz tokena (`GET /accounts`; ako ih
token vidi više, traži se upis), a bucket `domovina-fiskal-<OIB>` se kreira u **EU** jurisdikciji
ako ne postoji. Token ograničen na jedan bucket ne može kreirati novi: tada se upisuje naziv
postojećeg. Unos:
- admin: `/admin/tenant/:id` → „Backup u tenantov Cloudflare R2”;
- API/dashboard: `GET|PUT|DELETE /api/v1/postavke/backup`
  (`{token, cfAccountId?, bucket?, jurisdikcija?: 'eu' (zadano)|'default'|'fedramp', prefiks?}`; operater ne smije).

Spremanje odmah probno upisuje `<prefiks>provjera.txt`; ako upis ne uspije, ništa se ne sprema.
Token je šifriran envelopeom (kao doku token) i ide kroz KEK rotaciju; API ga nikad ne vraća.

Što stiže u tenantov bucket (upis kroz `PUT /client/v4/accounts/{acc}/r2/buckets/{b}/objects/{key}`,
isti endpoint kao `wrangler r2 object put`, provjeren 2026-11-23 na stvarnom bucketu s `cf-r2-jurisdiction: eu`):

| Ključ | Kada |
|---|---|
| `<prefiks>racuni/<godina>/<broj>_<id>.json` (račun, stavke, PDV, naplata, CIS XML) | nakon svake promjene računa |
| `<prefiks>racuni/<godina>/<broj>_<id>.pdf` | isto, ako račun ima broj |
| `<prefiks>racuni/skice/<id>.json` | dokument bez broja |
| `<prefiks>snapshots/YYYY/MM/YYYY-MM-DD.json.gz` (sve tablice tenanta, bez certifikata, ključeva, tokena) | dnevno 01:30 UTC |

„Realtime”: `waitUntil` nakon uspješnog ne-GET API zahtjeva i admin POST-a, plus cron `*/15` kao
mreža (JIR iz sweepa naknadne dostave ne prolazi kroz API). Odabir: vodeni žig
`tenant_backup.sinkronizirano_do` nad `racun.updated_at`, preklop 60 s, najviše 100 računa po pozivu.
Greška se pamti u `zadnja_greska`; dnevni alarm (06:00) šalje je tenantu i platformi. Izdavanje i
fiskalizacija nikad ne čekaju backup.

### E2E potvrđeno 2026-11-23 (SUSRET, tenant TEST 6 / PROD 2)

Unesen samo token (Account API Token, R2 Edit). Account ID otkriven iz tokena (`GET /accounts`
vraća račun i za token koji ima samo R2 dozvolu ✅), bucket `domovina-fiskal-91020846402` kreiran
u EU. TEST prefiks `domovina-fiskal-test/`: `provjera.txt`, 7 računa (JSON ~12 KB + PDF ~37 KB),
snapshot. PROD prefiks `domovina-fiskal-prod/`: `provjera.txt` + snapshot (računa još nema).
Isti bucket za obje okoline, razdvojeno prefiksom. Bucket tenanta NEMA Bucket Lock namjerno:
realtime prepisuje isti ključ kad se račun promijeni (lock bi to odbio).
