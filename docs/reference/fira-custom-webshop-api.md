# Fira.finance — Custom Webshop API (v1.0.0) — referenca iz prve ruke

> Izvor: firsthand ekstrakcija iz `/Users/ms/git/stepanic/fira-forms-connector`
> (radeći integracija koju je autor izgradio i testirao u produkciji, sij. 2026).
> Službeni OpenAPI: https://app.swaggerhub.com/apis-docs/FIRAFinance/Custom_webshop/v1.0.0
> Ovo je **API dizajn koji želimo dostići/nadmašiti** u našem open-source servisu.

## Endpoint

```
POST https://app.fira.finance/api/v1/webshop/order/custom
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

- API ključ se preuzima u: `https://app.fira.finance/settings/integrations`
- Ključ = tenant (SME) identitet. Svi podaci računa (tvrtka izdavatelj, fiskalne
  postavke, certifikat, poslovni prostor, terms) vežu se na SME iza ključa —
  **ne šalju se u payloadu**. To je ključna arhitektonska lekcija za nas:
  payload opisuje samo *kupca + stavke + tip*, sve o *izdavatelju* je server-side.
- Napomena o dizajnu: u OpenAPI-ju je `webshopModel` deklariran kao `query`
  parametar tipa objekt — u praksi se šalje kao JSON **body** (vidi radne payloade).
  Ovo je jedan od "moglo bi biti bolje" detalja koje mi ispravljamo.

## Tipovi računa (`invoiceType`)

| Vrijednost | Značenje | Napomena |
|---|---|---|
| `PONUDA` | Ponuda (offer) | Najbolje za testiranje/setup — ne fiskalizira se |
| `RAČUN` | Račun (invoice) | Obični račun (npr. transakcijski/virman), nije fiskalni |
| `FISKALNI_RAČUN` | Fiskalizirani račun | Samo za HR SME; zahtijeva postavljene fiskalne postavke u FIRA-i |

## Enumeracije

- `webshopType`: `WOO_COMMERCE` | `SHOPIFY` | `CUSTOM`
- `paymentType`: `GOTOVINA` | `TRANSAKCIJSKI` | `KARTICA`
- `currency`: `EUR`, `USD`, `AUD`, `BAM`, … (od 2023. HR je u EUR)

## `WebshopOrderModel` (glavni objekt)

| Polje | Tip | Napomena |
|---|---|---|
| `webshopOrderId` | int64 | ID narudžbe kod izvora |
| `webshopType` | enum | `CUSTOM` za naš slučaj |
| `webshopEvent` | string | npr. `order_created` (slobodan opis eventa) |
| `webshopOrderNumber` | string | broj narudžbe (izvorni) |
| `invoiceType` | enum | vidi gore |
| `paymentGatewayCode` / `paymentGatewayName` | string | izvor plaćanja |
| `createdAt` | date-time | `YYYY-MM-DDTHH:mm:ssZ` (npr. `2025-11-08T16:43:41Z`) |
| `dueDate` | date | `YYYY-MM-DD` — datum dospijeća |
| `validTo` | date | `YYYY-MM-DD` — vrijedi do (za ponude) |
| `currency` | string | valuta |
| `taxesIncluded` | bool | jesu li cijene s uključenim PDV-om |
| `billingAddress` | objekt | podaci kupca / naplate |
| `shippingAddress` | objekt | dostava (bitno za "mjesto isporuke" u PDF-u) |
| `taxValue` | double | ukupni PDV |
| `brutto` | double | ukupno s PDV-om |
| `netto` | double | ukupno bez PDV-a |
| `lineItems[]` | array | stavke |
| `discounts[]` | array | popusti (kao stavke s negativnom cijenom) |
| `totalShipping` | objekt | trošak dostave (kao stavka) |
| `customerLocale` | string | jezik kupca |
| `internalNote` | string | interna bilješka (vidi samo SME, NIJE u PDF-u) |
| `note` | string | **deprecated** — koristi `internalNote`/`terms*` |
| `taxRate` | double | **deprecated** na razini narudžbe — koristi po stavci |
| `paymentType` | enum | način plaćanja |
| `termsHR` / `termsEN` / `termsDE` | string(HTML) | uvjeti na računu po jeziku (HR / ne-HR-DE-AT / DE-AT) |

## `WebshopCustomerAddressModel` (billing/shipping)

`name, address1, address2, city, country (HR/AT/DE…), phone, zipCode, email,
vatNumber, oib, company`

- Ako je u FIRA postavkama uključeno "pošalji račun e-mailom", čita se `email` iz
  `billingAddress`.

## `WebshopLineItemModel` (stavke)

`name, description, lineItemId, price (double), quantity (double), unit,
taxRate (decimal 0.25 = 25%), kpdCode, productCode`

- `taxRate` je **decimalni** (0.25, 0.13, 0.05, 0).
- `kpdCode` — KPD šifra proizvoda/usluge (nacionalna klasifikacija; bitno za
  fiskalizaciju 2.0 / eRačun). Vidi `docs/knowledge/06-*`.
- `productCode` — poveznica na proizvod u FIRA bazi (nasljeđuje njegov KPD itd.).

## Odgovori / greške

`ErrorDetails { timestamp, message, details, validationErrors[] }`
`ViolationError { fieldName, message, rejectedValue }`
HTTP: 200 OK, 400/401/402/403/404/500.

## Naučene lekcije iz produkcijskog testiranja (payload-comparison.md)

- **Emoji u `internalNote`** su srušili backend (`org.hibernate.exception.DataException`)
  — vrlo vjerojatno kolacija/`utf8` (ne `utf8mb4`) u njihovoj bazi. → **Mi moramo
  koristiti `utf8mb4`/pun Unicode svugdje i sanitizirati/validirati ulaz.**
- Nekonzistentnosti oko obaveznosti `shippingAddress`, `validTo`, `termsHR` —
  API tolerancija je nejasna. → **Mi radimo strogu, dokumentiranu shemu (zod/valibot)
  s jasnim obveznim/opcionalnim poljima i dobrim porukama grešaka.**

## Defaults koje FIRA konektor koristi (za paritet funkcionalnosti)

- Invoice Type: `PONUDA` (za setup), Currency: `EUR`, PaymentType: `TRANSAKCIJSKI`,
  Tax Rate: `0.25`, Country: `HR`.

## Poveznice

- Dashboard: https://app.fira.finance
- API postavke: https://app.fira.finance/settings/integrations
- Support: https://fira.finance/support
