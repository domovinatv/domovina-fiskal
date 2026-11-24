# PDF računa: novi izgled i branding po tenantu (2026-11-23 – 25)

Stanje: **TEST deployan** (zadnja verzija `418b0161`, backend `be61fa1`, app `bf1529c`).
**PROD nije diran** — ni migracija 0017 ni deploy.

## Što je napravljeno

| Commit | Što |
|---|---|
| `6a19884` | Novi layout (`backend/src/pdf/racun-pdf.ts`), Inter umjesto DejaVu, `PdfBranding` parametar |
| `84070ca` | `tenant_branding` (0017), `/api/v1/postavke/branding` + `/pregled`, `pdfRacuna()` svugdje |
| `4db4135` | Admin sekcija „Izgled PDF računa” (`/admin/tenant/:id#izgled`) |
| `be61fa1` | Admin: SVG → PNG u pregledniku |
| app `7a6ea7e`, `bf1529c` | Dashboard Postavke → „Izgled računa”, SVG → PNG (`lib/logo.ts`) |

Uzor je bio Entrio račun (`Entrio_racun_154801-p2-1.pdf` iz Gmaila): jasno odvojen
izdavatelj/kupac, veliki broj, oznaka „PLAĆENO”, tablična rekapitulacija PDV-a.
Eventim šalje samo print@home ulaznicu, a ulaznice.hr samo link (nema privitka) — nisu korisni kao uzor računa.

Nijedan zakonski element (čl. 79 Zakona o PDV-u, ZKI/JIR/QR) nije uklonjen; „Ukupno bez
PDV-a” i „PDV ukupno” ostaju i za ne-PDV obveznike.

## Zamke koje su koštale vremena

1. **Stari DejaVu subset nije imao „ (U+201E).** Hrvatski donji navodnik ispadao je kao rupa
   (`Ulaznica „Tribina”`). Novi subset pokriva Latin-1, Latin Extended-A, U+2010–2027, €, ✓.
2. **pdf-lib krivo mjeri glifove zamijenjene OpenType značajkama.** S `embedFont(…, { features: { tnum: true } })`
   razmaci između znamenki su se razvukli; s Interovim `calt`/`case` pojavljivali su se razmaci iza
   `:`, `(` i `-` (npr. „OIB:   123”, „14:  20”). Rješenje: subset samo s `kern`, a tablične
   znamenke **upisane izravno u cmap** (`backend/scripts/fontovi-tnum.py`). Generatoru se ne
   smiju dodavati `features`.
3. **Test helper `poziv()` sam stavlja `Content-Type: application/json`** — multipart u testu
   mora ručno prenijeti granicu (vidi `forma()` u `backend/test/branding.test.ts`).
4. **Ogledni PDF je namjerno skica** (`status: 'nacrt'`): s pravim IBAN-om tenanta i statusom
   „izdano” imao bi funkcionalne barkodove za plaćanje.

## Odluke i odbačene alternative

- **Logo u D1 kao base64 TEXT, ne R2.** ≤ 200 KB, ulazi u dnevni D1 dump, nema novog bindinga.
  BLOB je odbačen jer D1 vraća BLOB kao `number[]`.
- **SVG se rasterizira u pregledniku** (canvas do 1200×400 px ≈ 500 dpi na ~6 cm loga), ne na serveru.
  Odbačeno: resvg-wasm u Workeru (+~2,5 MB bundlea) i vektorski SVG kroz `drawSvgPath`
  (prima samo jedan `d`; grupe, transformacije, gradijenti i tekst ne bi radili).
- **Presvijetla boja brandinga** se za tekst automatski potamni (relativna svjetlina ≤ 0,18);
  trake i ispune zadrže originalnu boju.
- **Branding je kozmetika:** greška pri čitanju → zadani izgled, račun se uvijek generira.

## Alati

- `backend/scripts/pdf-pregled/generiraj.sh [dir]` — ogledni računi (B2C, R1 s nalogom, ne-PDV
  skica, storno, dva brandinga, 3 stranice) u PDF + PNG bez Workera (esbuild + node + pdftoppm).
- `backend/scripts/fontovi-subset.sh <dir s Inter-*.ttf>` — ponovni subset; izvor Inter 4.001
  (lokalno npr. `~/git/domovinatv/.nightly-domovina/assets/fonts`), licenca `src/pdf/fontovi/OFL-Inter.txt`.

## Otvoreno

- **PROD:** `wrangler d1 migrations apply fiskal_domovina --remote` (primijenit će samo 0017;
  0016 i 0018 već su na PROD-u) pa deploy s HEAD-a. Čeka odobrenje korisnika.
- **SVG upload nije isproban u pregledniku** ni u dashboardu ni u adminu (pokriveno je samo da se
  admin skripta parsira i ima nonce). Provjeriti: SVG bez width/height (samo viewBox), Safari
  (DataTransfer u file inputu), SVG s vanjskim fontom/slikom (canvas ne učita vanjske resurse).
- Dashboard sekcija „Izgled računa” nije klikana u pregledniku; admin sekcija i admin
  pregled jesu (TEST, tenant 1, ništa spremljeno).

## Vezani dokumenti

- [`knowledge/09-pdf-racun-i-qr-kod.md`](knowledge/09-pdf-racun-i-qr-kod.md) — obvezni elementi PDF-a i QR
