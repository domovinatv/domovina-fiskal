# PROMPT — Faza 2: B2C fiskalizacija 1.0 (ZKI/JIR, CIS)

> Preduvjet: Faze 0–1 gotove. Pročitaj `docs/knowledge/02-fiskalizacija-1.0-tehnicki.md`
> (KLJUČNO — ZKI algoritam, XML sheme, XML-DSIG, endpointi, greške, QR),
> `04-certifikati-fina-akd.md`, `11-arhitektura-runtime.md`, `10-edge-cases-validacije.md`,
> `docs/reference/lokalni-artefakti.md` (stari SOAP skeleton).

## Cilj
Fiskalizirati **B2C** (krajnja potrošnja) račune: izračun **ZKI**, slanje `RacunZahtjev` na
**CIS TEST**, primanje **JIR**, ispis JIR/ZKI + **fiskalni QR** na PDF. Naknadna dostava (offline).

## Zadaci (točni algoritmi u `02-*`)
1. **Certifikat**: onboarding **FINA DEMO** certa (P12 → PEM/PKCS8), enkriptirano at-rest (`04-*`).
2. **ZKI** (`02-*` §2): `md5( RSA-SHA1( OIB + datVrij['dd.MM.yyyy HH:mm:ss'] + brRac + oznPP +
   oznNU + iznos['.'] ) )` → 32 hex lowercase. PAZI: razmak u ZKI datumu, `T` u XML datumu.
   Odluči runtime po `11-*` (edge `node:crypto` vs sidecar; MD5 radi na Workers).
3. **RacunZahtjev** XML (`02-*` §4, namespace `…/types/f73` — provjeri aktualni WSDL) +
   **XML-DSIG** (enveloped, Exclusive C14N, **RSA-SHA1**, SHA1 digest; `Reference` po `Id`).
4. **SOAP transport** na **TEST** `https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest`
   (⚠️ potvrdi endpoint/mTLS iz `99`/`02-*`; mTLS možda traži sidecar — vidi `11-*` §2).
5. **Parsiranje**: `Jir` (uspjeh) ili `Greske/SifraGreske` (`s001`–`s013`). Spremi u `racun`.
6. **Async + naknadna dostava** (`02-*` §8): status `izdano`(ZKI) → `fiskalizirano`(JIR);
   ako CIS padne → `NakDost=true`, retry s **novim `IdPoruke`**.
7. **Fiskalni QR** na PDF (`02-*` §10): `https://porezna.gov.hr/rn?jir=…&datv=GGGGMMDD_HHMM&izn=<centi>`.
8. **Poslovni prostor**: prijava u CIS prije prvog računa (provjeri metodu u aktualnoj shemi).
9. **Edge-caseovi** (`10-*`): OIB MOD 11,10, storno (veza na JIR), zaokruživanje, ne-PDV.

## Definicija gotovog (verify)
`EchoRequest` na CIS TEST prolazi; fiskaliziraj testni B2C račun → dobiven **JIR**;
PDF nosi JIR+ZKI+fiskalni QR; simuliran offline → naknadna dostava dobije JIR. `/verify` + commit + push.
Min. 2 dana stabilnog TEST rada prije razmišljanja o produkciji (`02-*` §7).

## Ne raditi
Produkcijski cert/endpoint dok TEST nije stabilan. eRačun 2.0 — faza 3.
