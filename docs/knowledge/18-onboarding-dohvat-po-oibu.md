# 18 — Onboarding tenanta: dohvat podataka po OIB-u

> **Status: IMPLEMENTIRANO** (admin `/admin`, deployano TEST+PROD 2026-07-17…20).
> Kod: `backend/src/registri.ts`, ruta `GET /admin/api/oib-info`, UI u
> `backend/src/admin/views.ts` (forma tenanta).

Cilj: superadmin upiše **samo OIB** u admin formu tenanta i klikne
„🔎 Dohvati po OIB-u"; backend paralelno spoji više javnih izvora i
predpopuni naziv, adresu, poštanski broj, IBAN, e-mail. Sve se događa
server-side (frontend šalje samo OIB).

## Izvori i što svaki daje (provjereno 2026-07-17)

| Podatak | sudreg | VIES | CompanyWall (firecrawl) |
|---|---|---|---|
| Naziv | ✓ (službeni, d.o.o.) | ✓ (i obrti; često ime vlasnika) | ✓ |
| Adresa (ulica, mjesto) | ✓ (strukturirano) | ✓ | ✓ |
| **Poštanski broj** | ✗ (nema ga!) | ✓ | ✓ |
| **IBAN** | ✗ | ✗ | ✓ (jedini izvor) |
| E-mail | ✓ (iz registra) | ✗ | ✓ |
| MBS, pravni oblik | ✓ | ✗ | ✓ (MBS) |
| Status (aktivan/blokiran) | (postupak) | ✗ | ✓ |
| **U sustavu PDV-a** | ✗ | ⚠️ vidi dolje | ✗ (ne prikazuje javno) |

Redoslijed spajanja (autoritativnost): **sudreg → VIES → CompanyWall**
(popuni polje samo ako je prazno). Svaki izvor smije pasti neovisno
(`Promise.allSettled`) — dohvat vraća što je uspjelo.

## Ključne netrivijalne činjenice

- ⚠️ **VIES `valid=true` NIJE „u sustavu PDV-a".** VIES potvrđuje da OIB ima
  aktivan PDV ID, ali i paušalni obrt izvan sustava PDV-a dobiva PDV ID čim
  prima usluge iz EU (Google, AWS…). Empirijski dokaz: OIB `44417010014`
  (Lion Base, pretpostavljeni paušalac) → VIES `valid=true`, ime „IVAN
  STEPANIĆ". Dakle PDV status se **ne smije** izvoditi iz VIES-a.
- **PDV status nema javni strojni izvor.** Jedini autoritativni izvor je PU
  aplikacija „Provjera obveznika u sustavu PDV-a" (OIB + datum → je/nije),
  ali ima **reCAPTCHA** (interni endpoint `/api/akcije/provjeri-jednog-obveznika`
  vraća P011 bez captcha tokena) → praktički ručni klik (~10 s). Admin panel
  zato uvijek prikaže upozorenje + link.
  <https://provjeri-rpo-pdv.porezna-uprava.hr/> (pristup 2026-07-17)
- **IBAN nema javni izvor** osim agregatora — FINA Jedinstveni registar računa
  nije javno strojno dostupan. CompanyWall ga ima, ali samo preko firecrawla.
- **sudreg nema poštanski broj** (ima šifre naselja/ulice, ne PBR) → PBR se
  dopunjava iz VIES-a ili CompanyWalla.
- Za **obrte/OPG-ove sudreg vraća 404** (nisu trgovačka društva) → fallback na
  VIES + CompanyWall; naziv iz VIES-a je tad često ime vlasnika, ne obrta.

## Izvori podataka (tehnički)

- **Sudski registar (sudreg) open-data API** — `https://sudreg-data.gov.hr/api`.
  OAuth2 `client_credentials` (`POST /oauth/token`, token 6 h), zatim
  `GET /javni/detalji_subjekta?expand_relations=true&tip_identifikatora=oib&identifikator=<OIB>`.
  `expand_relations=true` je nužan za pravni oblik. Kredencijali
  (`SUDREG_CLIENT_ID`/`SECRET`) su wrangler secreti; registracija na
  sudreg-data.gov.hr (dokumentacija: <https://sudreg-data.gov.hr/>, pristup 2026-07-17).
- **VIES REST** — `POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`
  body `{"countryCode":"HR","vatNumber":"<OIB>"}`. Bez registracije. Adresa je
  jedan string („ULICA KBR, NASELJE, PBR MJESTO") → parsira se.
- **CompanyWall** — nema javnog API-ja (Web API je plaćeni proizvod
  <https://www.companywall.hr/web-api>). Dohvat preko **firecrawl v2**:
  1. `POST api.firecrawl.dev/v2/scrape` na `companywall.hr/pretraga?n=<OIB>`,
     format `links` (deterministički, bez LLM-a) → filter `/tvrtka/`|`/obrt/`
     link profila;
  2. `POST /v2/scrape` na profil s `formats:[{type:'json', schema}]` (LLM
     ekstrakcija na firecrawl strani) → strukturirani podaci.
  `FIRECRAWL_API_KEY` je wrangler secret (test i prod ključ su različiti).

## Zaštite

- Ruta prima samo `?oib=` (mod-11 provjera) ili `?url=` (samo hostovi
  `*.companywall.hr`, https). LLM ekstrakciji se ne vjeruje slijepo: izvučeni
  OIB se provjerava mod-11, IBAN na `^HR\d{19}$` — nevaljano se odbacuje uz
  upozorenje, ne ulazi u formu. Status ≠ „aktivan" diže upozorenje.
- CompanyWall dohvat = 2 firecrawl poziva (~30–60 s); UI to najavi. Firecrawl
  je LLM ekstrakcija s agregatora → podaci mogu biti zastarjeli, panel traži
  ručni pregled prije spremanja.

## Otvoreno / buduće

- PDV status ostaje jedini ručni korak. Automatizacija bi tražila rješavanje
  reCAPTCHA-e na PU aplikaciji (nije predviđeno).
- Kredencijali sudreg-a trenutačno se dijele s repoom `klubovi.domovina.ai`
  (ondje prvo registrirani); u fiskalu su zasebni wrangler secreti.
