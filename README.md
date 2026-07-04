# domovina-fiskal

Open-source SaaS za **izdavanje hrvatskih fiskaliziranih računa**. Multi-tenant
backend kojem se struktuiranim JSON payloadom preda račun; servis ga upiše u bazu,
**fiskalizira** (ZKI/JIR), generira PDF i (opcionalno) pošalje e-mailom.

**Cilj:** open-source alternativa closed-source [fira.finance](https://fira.finance).

## Opseg (u dva vala)

1. **Fiskalizacija 1.0 (maloprodaja)** — CIS Porezne uprave, ZKI + JIR, XML-DSIG,
   FINA/AKD aplikacijski certifikati, QR kod na računu.
2. **Fiskalizacija 2.0 (eRačun)** — obvezno e-fakturiranje/e-izvještavanje (2026),
   EN 16931 / UBL / Peppol, prijava eRačuna Poreznoj.

## Ključna arhitektonska načela

- **Multi-tenant:** svaki `apiKey` = tenant (SME). SVI podaci izdavatelja (OIB, PDV
  status, poslovni prostori, naplatni uređaji, operateri, certifikat, zadani uvjeti)
  žive u bazi vezani na tenanta — payload nosi samo *kupca + stavke + tip računa*.
- **Dizajn API-ja** modeliran po Fira Custom Webshop API-ju (dokazano dobar), ali
  strože i čišće (vidi `docs/reference/fira-custom-webshop-api.md`).
- **Stack** kao `pipeline.domovina.ai`: Cloudflare Worker + Hono + D1, server-rendered
  admin, Bearer API, hrvatski jezik svugdje. (Runtime za potpisivanje: vidi doc 11.)

## Status: RESEARCH / PLANNING

Trenutno gradimo **single point of truth** — činjenično stanje fiskalizacije u HR.
Implementacija slijedi u zasebnom, pedantnom prolazu.

## Gdje je znanje

- [`docs/knowledge/00-INDEX.md`](./docs/knowledge/00-INDEX.md) — glavni indeks (SPOT).
- `docs/knowledge/*` — činjenične teme (pravo, tehnika 1.0, eRačun 2.0, certifikati,
  podatkovni model, šifrarnici, PDF/QR, edge-caseovi).
- `docs/reference/*` — reference iz prve ruke (Fira API, lokalni artefakti).
- [`PLAN.md`](./PLAN.md) — plan implementacije (nastaje usporedno).
