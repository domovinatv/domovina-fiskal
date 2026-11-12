# 22 — Astro ili Hono na Cloudflare Workers

Stanje: 2026-11-12. Usporedba napravljena na stvarnom kodu: fiskal `backend/`
(Hono 4.12.27, ~8.500 linija TS) i `~/git/logomedo/logomedo.com` (Astro 7.4,
`@astrojs/cloudflare` 14.4). Vanjski izvori na dnu, pristupljeno 2026-11-12.

## 1. Kratki odgovor

Obje opcije su danas dobre i **ne natječu se**. Obje rade na istom runtimeu
(workerd), s istim D1/R2/KV/Queues/DO bindingima i istim `wrangler deploy`.
Razlika je samo u sloju iznad toga: **Hono je router za API, Astro je
framework za stranice.**

**Fiskal ostaje na Honu.** Jedan stvaran dobitak koji bi Astro donio
(automatski escape HTML-a u adminu) dobiva se i u Honu, kroz `hono/jsx` ili
`hono/html` (§4).

## 2. Usporedba

| | **Hono** (fiskal, pipeline, pay) | **Astro** (logomedo, babysigns, crosulja, biblija, e-satnica) |
|---|---|---|
| Što je | Mali router, `app.fetch` | Framework: stranice, layouti, komponente, build korak |
| Primarni oblik | JSON API, webhookovi, Bearer auth | HTML stranice, SSR/SSG po ruti, malo JS-a na klijentu |
| HTML | Template stringovi ili `hono/jsx` | `.astro` komponente, automatski escape |
| Build | Nema ga, wrangler bundla `src/index.ts` | `astro build`, a tek onda wrangler |
| Cron, Queue, DO | Prirodno: `export default { fetch, scheduled, queue }` (fiskal `backend/src/index.ts`) | Kroz vlastiti `src/worker.ts` koji omota `handle()` iz `@astrojs/cloudflare/handler` (logomedo `src/worker.ts`) |
| Env i bindingi | `c.env` iz Hono konteksta | `import { env } from "cloudflare:workers"` |
| Middleware | Bogat i eksplicitan (CSP, CORS, auth, validatori) | Jedan `src/middleware.ts`, ostalo ručno |
| Testovi | `@cloudflare/vitest-pool-workers` + `app.request()` bez servera | Teže; u logomedu se testira `lib/` (`node --test`), ne stranice |
| Stranice, SEO, sitemap, slike | Ručno | Ugrađeno; tu je Astro najjači |
| Rizik nadogradnje | Mala površina API-ja | Major verzije Astra i adaptera otprilike godišnje (logomedo je na 7 / 14) |
| Vlasništvo | Yusuke Wada i zajednica; Cloudflare ga koristi i piše o njemu [3] | Cloudflare je 16.1.2026. preuzeo tim Astra; ostaje open source (MIT) [1][2] |

## 3. Zašto fiskal ostaje na Honu

Fiskal je u srži **API i pozadinski proces**: SOAP prema CIS-u, potpisivanje
(`node-forge`, `subtls`), PDF (`pdf-lib`, `bwip-js`), eRačun preko doku-a, dva
crona (`*/15 * * * *` i `0 6 * * *` u `backend/wrangler.toml`) i Bearer API za
webshopove. Admin (`src/admin/app.ts` i `views.ts`) ima ~1.400 od ~8.500 linija.

Prelaskom na Astro dobili bismo build korak i omotač za `scheduled`, a izgubili
jednostavno testiranje kroz `app.request()`. Ništa od toga ne vrijedi za
servis kojem su glavni korisnici drugi programi.

## 4. Što iz ove usporedbe vrijedi napraviti

`src/admin/views.ts` slaže HTML template stringovima i ručnim `escapeHtml`
(`src/util.ts`). Tu XSS najčešće nastaje: dovoljno je jednom zaboraviti
escape. Prijedlog: prebaciti admin views na `hono/jsx` (ili `html` tagged
template iz `hono/html`), koji escapea interpolirane vrijednosti. Zapisano
kao kandidat za refactor plan.

⚠️ Escape u `hono/jsx` nije savršen. U 2026. objavljena su dva savjeta:
injekcija preko imena JSX atributa (GHSA-458j-xx4x-4375 / CVE-2026-56761) i
`cx()` iz `hono/css` koji ne escapea ulaz (CVE-2026-59895, ispravljeno u
4.12.27) [4][5]. Fiskal je na 4.12.27 i trenutno ne koristi `hono/jsx` ni
`hono/css`. Pri prelasku na JSX imena atributa ne smiju dolaziti iz korisničkih
podataka, a Hono treba držati na zadnjoj verziji.

## 5. Pravilo za ekosustav

- **Hono**: servis kojem su glavni korisnici drugi programi (API, webhookovi,
  cron, integracije). Admin je sporedan i ide kroz `hono/jsx`.
- **Astro**: proizvod kojem su glavni korisnici ljudi u pregledniku (puno
  stranica, sadržaj, SEO, javni dio + admin). API je sporedan i ide kroz
  `src/pages/api/*`.
- **Hibrid**, kad treba oboje: Astro za stranice i Hono montiran unutra
  (`src/pages/api/[...path].ts` → `app.fetch(request)`), ili vlastiti
  `worker.ts` koji `/api/*` šalje u Hono, a ostalo u Astro `handle()`.
  Logomedo već radi takvo grananje za `/api/runner/zvono`.

## Izvori

1. Cloudflare Acquires Astro (press release, 2026-01):
   https://www.nasdaq.com/press-release/cloudflare-acquires-astro-accelerate-future-high-performance-web-development-2026-01
   — pristupljeno 2026-11-12
2. Cloudflare acquires high-speed framework Astro (Gigazine, 2026-01-19):
   https://gigazine.net/gsc_news/en/20260119-cloudflare-acquires-astro
   — pristupljeno 2026-11-12
3. The story of web framework Hono (Cloudflare blog):
   https://blog.cloudflare.com/the-story-of-web-framework-hono-from-the-creator-of-hono
   — pristupljeno 2026-11-12
4. GHSA-458j-xx4x-4375 / CVE-2026-56761:
   https://corgea.com/advisories/vulnerabilities/GHSA-458j-xx4x-4375
   — pristupljeno 2026-11-12
5. CVE-2026-59895 (`cx()` u `hono/css`):
   https://mondoo.com/vulnerability-intelligence/vulnerability/CVE-2026-59895
   — pristupljeno 2026-11-12
