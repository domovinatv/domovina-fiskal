# Handoffi — dashboard: passkey i pozivnice

## Lanac

- Sesija N počinje iz `SN.md` (gotov prompt). Na kraju: označi svoj red u „Stanje lanca” i stavke
  u [../TODO.md](../TODO.md); ako je naučila nešto što mijenja kasnije pakete, uredi `S(N+1).md`
  (nedovršeno ide na **vrh**); upiše polazni commit i brojke testova u `S(N+1).md`; `/wrap-up`
  uzima **sadržaj `S(N+1).md`** kao handoff prompt.
- Ponestane li konteksta usred paketa, nastavak je opet `SN` (broj se ne povećava), a stanje ide na vrh `SN.md`.
- **Vrata**: kad paket završi nepovratnom ili vanjskom radnjom ili korisnikovom odlukom, sesija pripremi
  sve, upiše pitanje na vrh `S(N+1).md` i lanac staje dok korisnik ne odluči.
- Handoff se mijenja samo prema naprijed: gotov `SN.md` se ne prepravlja.

## Stanje lanca

| Sesija | Paket | Stanje | Commit | Testovi | Napomena |
|---|---|---|---|---|---|
| S0 | Plan | gotovo | 075c3ce | — | plan bez koda |
| S1 | Migracija + app-auth moduli | gotovo | a5aad75 | 235 → 255, skipped 0 | 0014; odluke 100–107 |
| S2 | API rute, grana za kolačić, članovi | gotovo | fec47e2 | 255 → 277, skipped 0 | odluke 200–207 |
| S3 | `/admin` pozivnice i korisnici | gotovo | d0d0323 | 277 → 284, skipped 0 | 0015; odluke 300–304 |
| S4 | App na `/app`, passkey UI | otvoreno | | | |
| S5 | GoTrue van, SPOT, TEST | otvoreno | | | vrata: korisnik testira na TEST-u |
| S6 | PROD | otvoreno | | | vrata prije: termin |
| S7 | Mirovina Pagesa i domene | otvoreno | | | vrata: brisanje |

## Zajednička pravila

- **Polazak**: `cd backend && npm run typecheck && npm test` mora biti zelen. Ako nije, prvo popravi
  ili utvrdi da je crveno od tuđeg rada u radnom stablu (`git status`) i to zapiši. Tuđe necommitane
  datoteke ne commitaj i ne briši; `git add` uvijek s imenima datoteka.
- **Repoi**: backend `~/git/domovinatv/domovina-fiskal` (javan, `main`); app
  `/Volumes/DOMOVINA2TB/git/domovinatv/domovina-fiskal-app` (`main`). Izvor kopije:
  `~/git/logomedo/logomedo.com` (`src/lib/admin/*`, `docs/admin.md`), samo čitanje.
- **Opseg**: diraj samo ono što paket kaže. `src/admin/auth/*` i `admin_*` tablice ostaju kako jesu.
- **Orkestracija**: orkestrator čita malo i delegira; subagenti Opus 5.5 s eksplicitnim `effort`
  (`high` za kod, `medium` za čitanje), najviše 2–3 paralelno. Fable samo uz korisnikov izričit pristanak.
  Subagenti ne diraju TODO, plan ni handoffe; to radi orkestrator.
- **Testovi**: bez mreže, `skipped 0`; brojke u stanju lanca iz stvarnog izlaza naredbe.
- **Autonomno**: odluči i zapiši u [../decisions.md](../decisions.md) (svoj blok), commitaj svaki zeleni
  korak (poruka na hrvatskom, trailer po sistemskim uputama). Nepovratno (PROD, brisanje Cloudflare
  resursa, Access objekti, slanje linkova) ostavi korisniku.
- **Deploy**: migracija prije deploya, izlaz se čita cijeli. TEST: `npx wrangler d1 migrations apply fiskal_domovina --remote --env test`
  pa `npm run deploy:test`. PROD samo u S6, nakon vrata.
- **Javni repo**: bez e-mailova stvarnih ljudi, tokena, linkova pozivnica. Sigurnosne slabosti smiju
  biti opisane.
- **Token budget**: bez Monitora za napredak; oko 150k konteksta zatvori sesiju po lancu.
- **Istraživanja**: `../research/YYYY-MM-DD-*.md`.
- **Jezik**: hrvatski u kodu, UI-ju, logovima i docs (pravilo repoa).
