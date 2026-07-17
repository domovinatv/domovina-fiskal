# Handoff: skripta za dodavanje tenanta "Lion Base" na TEST okruženje

> **Prompt za novu sesiju u repou `/Users/ms/git/domovinatv/domovina-fiskal`.**
> Cilj: `backend/scripts/dodaj-tenant-test.sh` — idempotentna skripta koja na
> **ISKLJUČIVO TEST** okruženju (`https://fiskal-test.domovina.ai`) kreira
> kompletnog tenanta kroz admin sučelje. Prvi (i zadani) tenant: **Lion Base**.

## Podaci tenanta (izvor: companywall.hr, pristup 2026-07-17 — provjereno)

| Polje | Vrijednost |
|---|---|
| Naziv | `Lion Base, obrt za računalno programiranje, vl. Ivan Stepanić` (za `naziv` može kraće: `Lion Base obrt`) |
| OIB | `44417010014` (mod-11 valjan ✓) |
| Adresa | `Školska 5`, `Donja Lomnica`, `10412` (Velika Gorica) |
| U sustavu PDV-a | ⚠️ NEPOZNATO (nije javno na companywall) — pretpostavi **NE** (`u_sustavu_pdv=0`, tipično paušalni obrt), potvrditi s vlasnikom |
| IBAN | nema javno — ostavi prazno |
| Operater | `Ivan Stepanić`, OIB operatera = `44417010014` (kod obrta OIB obrta = osobni OIB vlasnika) |

Kontekst: obrt brata vlasnika platforme; ista adresa (Školska 5, Donja Lomnica)
je i ITalk-ov drugi poslovni prostor — vidi `backend/.tajne/INFO.local.md`.

## Kako skripta radi (admin sučelje, Basic Auth)

Nema javnog API-ja za kreiranje tenanata — ide kroz `/admin` form POST-ove
(vidi `backend/src/admin/app.ts`):

1. `POST /admin/tenanti` — polja: `naziv`, `oib`, `ulica`, `mjesto`,
   `postanski_broj`, `iban`, `u_sustavu_pdv` (`1`/`0`), `oznaka_slijednosti`
   (`P`) → 303 redirect na `/admin/tenant/:id` (iz `Location` headera izvuci ID).
   Ako OIB već postoji → 400 s "već postoji" (idempotentnost: tad samo ispiši
   postojeće stanje i stani, exit 0).
2. `POST /admin/tenant/:id/prostori` — oznaka `PP1` + adresa (ista kao tenant).
3. `POST /admin/tenant/:id/uredjaji` — oznaka `1`, `poslovni_prostor_id` iz
   prethodnog koraka (dohvati iz selecta na stranici ili iz redirecta).
4. `POST /admin/tenant/:id/operateri` — ime + OIB operatera.
5. `POST /admin/tenant/:id/kljucevi` — API ključ; **sirovi `dfk_…` je u HTML
   flashu SAMO JEDNOM** (`grep -o 'dfk_[0-9a-f]*'`) → spremi u
   `secrets/lion-base-test-api-kljuc.txt` (gitignored) i ispiši na kraju.
6. (Opcionalno, flag `--email <adresa>`) `POST /admin/tenant/:id/korisnici` —
   email + `uloga=vlasnik` za SSO pristup dashboardu (fiskal-app-test.domovina.ai).

## Tvrdi zahtjevi

- **Guard na TEST**: base URL hardkodiran na `https://fiskal-test.domovina.ai`;
  ako itko proslijedi drugi base (posebno `fiskal.domovina.ai`), skripta ODBIJA.
- Kredencijali: `ADMIN_USER`/`ADMIN_PASS` iz `backend/.dev.vars` (isti su na
  test workeru) — `source`-aj, ne hardkodiraj.
- Idempotentna: ponovljeno pokretanje ne duplicira ništa (tenant po OIB-u,
  prostor/uređaj/operater po oznaci — provjeri postojeće stanje prije POST-a;
  stanje možeš čitati i direktno: `wrangler d1 execute fiskal_domovina_test
  --remote --env test --command "..."` iz `backend/`, uz
  `CLOUDFLARE_ACCOUNT_ID=7dc7167b7e2e00923bfa7cd697df14e4`).
- Jezik: hrvatski (komentari, poruke), `set -euo pipefail`, bez tajni u repou.
- Na kraju ispiši sažetak: tenant ID, prostor/uređaj/operater, maskirani ključ,
  i podsjetnik što tenant NEMA (cert za B2C, doku token za eRačun — to su
  zasebni onboarding koraci kroz admin).

## Verifikacija (obavezno izvesti)

```
curl -s https://fiskal-test.domovina.ai/ | python3 -c "..."   # brojaci.tenanti +1
POST /api/v1/racun s novim dfk_ ključem (tip PONUDA, 1 stavka) → 201
GET  /api/v1/racun/:id → isti dokument (tenant-scoped)
```

eRačun/B2C NE testirati za Lion Base (nema cert ni doku token) — samo PONUDA.
