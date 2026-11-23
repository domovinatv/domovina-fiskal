# Next static export s `basePath: "/app"` u Workers static assets (S4, 23. 11. 2026.)

Pitanje: može li fiskal Worker servirati customer dashboard (Next 14 `output: "export"`) na `/app`
uz postojeće `/api/*`, `/admin/*` i `/`, i kako se ponašaju putanje bez nastavka.

Izvori: shema konfiguracije u `backend/node_modules/wrangler/config-schema.json` (wrangler 4.107.0,
čitano 23. 11. 2026.); https://developers.cloudflare.com/workers/static-assets/ i
https://developers.cloudflare.com/workers/static-assets/routing/ (pristupljeno 23. 11. 2026.);
ostalo izmjereno lokalno (`wrangler dev`, isti asset-worker kao na edgeu) i `wrangler deploy --dry-run --env test`.

## Nalazi

1. **`[assets]` je ključ okoline** (`RawEnvironment.assets` u shemi), pa ga `[env.test]` dobiva
   zasebno (`[env.test.assets]`), kao i ostale ključeve u ovom `wrangler.toml`. Dry run za
   `--env test` čita direktorij (`Read … files from the assets directory …/app-dist`).
2. **`run_worker_first`** prima `boolean` ili niz uzoraka (shema). Postavljeno
   `["/api/*", "/admin/*"]`: te putanje idu Workeru i kad bi u `app-dist` postojala datoteka
   s istom putanjom. Sve ostalo prvo traži asset; ako ga nema (`/`, `/favicon.ico`), ide Workeru.
3. **`basePath` i direktorij.** Next s `basePath: "/app"` u `out/` piše datoteke bez prefiksa
   (`out/index.html`, `out/dashboard.html`, `out/_next/…`), a u HTML-u su linkovi s prefiksom
   (`/app/_next/static/…`). Zato `scripts/build-app.sh` kopira `out/` u `app-dist/app/`.
4. **`html_handling` (zadano `auto-trailing-slash`)** uz `trailingSlash: false` u Nextu, izmjereno:

   | Zahtjev | Odgovor |
   |---|---|
   | `/` | 200 JSON (Worker, info) |
   | `/app` | 307 → `/app/` |
   | `/app/`, `/app/dashboard`, `/app/dashboard/clanovi`, `/app/poziv` | 200 `text/html` |
   | `/app/dashboard/` | 307 → `/app/dashboard` |
   | `/app/nema` | 404 (Worker, Hono) |
   | `/api/v1/ja` bez kolačića | 401 JSON |
   | `/admin` | 302 na `/admin/login` |

   Detalj računa je `?id=`, pa SPA fallback (`not_found_handling`) nije potreban i ostaje `none`.
5. **`_headers`** u korijenu asset direktorija vrijedi za Workers static assets: `/app/*` dobiva
   `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
   `Permissions-Policy` (izmjereno na `/app/dashboard`). CSP nije postavljen: Next export ima
   inline skripte, pa bi trebao hash/nonce (⚠️ otvoreno, nije u opsegu S4).
6. **Testovi ne ovise o buildu appa.** `vitest-pool-workers` čita isti `wrangler.toml`; bez
   `app-dist/` testovi i dalje prolaze (izmjereno s premještenim direktorijem).

## Zamka: `wrangler dev` prepisuje host na rutu

S `custom_domain` rutom `wrangler dev` šalje Workeru `request.url` s hostom rute
(`fiskal.domovina.ai`), ne `localhost:8787`. Posljedice lokalno: link pozivnice iz `/admin` glasi
`http://fiskal.domovina.ai/app/poziv#…`, a passkey pada u pregledniku s
„The RP ID "fiskal.domovina.ai" is invalid for this domain” (rpID se izvodi iz URL-a zahtjeva).
Rješenje: `wrangler dev --local-upstream localhost:8787` (u `npm run dev:app`). Na Cloudflareu se
to ne događa: `request.url` je stvarni host.

## Lokalni e2e (izmjereno)

`scripts/e2e-app-lokalno.cjs`: playwright-core, instalirani Chrome headless, virtualni autentifikator
kroz CDP (`WebAuthn.addVirtualAuthenticator`, ctap2, internal, resident key, UV). Prošlo:
pozivnica (hash obrisan iz adrese) → passkey → popis računa tenanta → kolačić
`__Host-fiskal_app` (HttpOnly, Secure, SameSite=Lax, Path=/; Chrome ga prima na `http://localhost`)
→ moji passkeyi → članovi (pozivnica operatera, opoziv) → odjava (`/ja` 401) → prijava passkeyem →
reload (i dalje prijavljen) → isti link pozivnice „ne vrijedi” → link bez tokena „nije potpun”.
Jedini 404 u konzoli je `/favicon.ico`.
