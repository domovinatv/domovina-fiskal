# Lokalni artefakti — što već postoji (firsthand)

Pregled postojećeg koda/znanja u autorovim repoima koji hranimo u ovaj projekt.

## 1. `/Users/ms/git/stepanic/fira-forms-connector` (radi u produkciji)

Open-source konektor **Google Forms/Sheets → FIRA.finance**. Google Apps Script
(`Code.gs`/`Config.gs`) doda "FIRA Actions" izbornik u Sheet, mapira stupce i šalje
`POST /api/v1/webshop/order/custom`. Ima i TypeScript CLI za validaciju/test payloada.

- **Vrijednost za nas:** dokazani, čist API dizajn (vidi
  [`fira-custom-webshop-api.md`](./fira-custom-webshop-api.md)). Payload = kupac+stavke+tip;
  sve o izdavatelju je server-side vezano na API ključ (tenant). Ovaj model kopiramo.
- Autor: Matija Stepanić, MIT licenca. Stack: axios, joi (validacija), commander, chalk.

## 2. `/Users/ms/git/stepanic/fiksal-hr-nodejs` (rani skeleton, nepotpun)

Rani pokušaj **direktne fiskalizacije 1.0** preko SOAP-a (`FiskalizacijaService.wsdl`),
Node.js, `soap` + `xml-crypto`.

- Datoteke: `fiskalClient.js` (SOAP klijent: `Echo`, `CheckInvoice`, `SubmitInvoice`),
  `signer.js` (XML-DSIG potpis preko `xml-crypto`), `verifier.js` (provjera potpisa
  odgovora), `invoice.js` (trivijalni XML), `index.js` (demo), `certs/` (gitignored).
- **Status:** samo skica — XML nije po stvarnoj CIS shemi, ZKI/JIR algoritam nije
  implementiran, WSDL nije uključen. Služi kao podsjetnik na tehnički smjer, ne kao baza.
- **Lekcija:** potpisivanje je XML-DSIG (`xml-crypto`), ali stvarni ZKI je zaseban
  RSA-SHA1 potpis konkateniranih polja + MD5 hex (vidi `docs/knowledge/02-*`).

## 3. `/Users/ms/git/domovinatv/pipeline.domovina.ai` (uzor za stack i UI)

Referentni **stack i stil** koji repliciramo:

- **Backend:** Cloudflare Worker + **Hono** + **D1** (SQLite), cron sweep.
- **Admin UI:** server-rendered HTML u Workeru (`src/admin/views.ts`), **Basic Auth**,
  bez zasebnog frontend builda ("NEMA zasebnog frontend builda").
- **API:** Bearer token (`INGEST_KEY`) na `/api/*`.
- **Migracije:** D1 SQL migracije (`backend/migrations/000X_*.sql`).
- **Konvencije:** SVI komentari/logovi/UI tekst na **hrvatskom**. Secrets samo preko
  `wrangler secret put` (repo je javan), lokalno `.dev.vars`.
- **Deploy:** `wrangler.toml` s `[[routes]] custom_domain=true` → deploy sam stvara DNS+cert.

> ⚠️ Otvoreno arhitektonsko pitanje za fiskalizaciju: potpisivanje 1.0 zahtijeva
> **mTLS + XML-DSIG s privatnim ključem certifikata**. Node `crypto`/`xml-crypto` to rade,
> ali na Cloudflare Workers (WebCrypto, bez Node `crypto`, bez izravnog mTLS klijenta)
> je to netrivijalno. Vidi `docs/knowledge/11-arhitektura-runtime.md` (odluka: gdje
> živi potpisni/SOAP dio — Worker vs. mali Node "signing sidecar").
