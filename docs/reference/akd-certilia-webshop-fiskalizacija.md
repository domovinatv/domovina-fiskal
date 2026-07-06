# AKD/Certilia webshop — fiskalizacija 1.0 kartične prodaje B2B kupcu (primjer iz prve ruke)

> Izvor: stvarni račun AKD d.o.o. iz Certilia webshopa (reg.certilia.com/register),
> kupnja fiskalizacijskog certifikata 5. 7. 2026. (20 € + 25 % PDV = 25 €, kartica).
> PDF računa lokalno (nije u repou — sadrži podatke kupca). Zapaženo 2026-07-06.

## Što račun dokazuje

1. **Kartična naplata u webshopu → fiskalni račun (1.0) s JIR + ZKI**, čak i kad je
   kupac **pravna osoba** (B2B). Okidač fiskalizacije računa je NAČIN NAPLATE
   (gotovina/kartica/digitalni servisi), ne status kupca — konzistentno s
   `01-pravni-okvir.md` §2 (od 1. 1. 2026. i kartice/Stripe su „gotovina").
2. Račun nosi napomenu: **„U skladu s člankom 39. Zakona o fiskalizaciji, ovaj
   račun nije izdan kao eRačun."** — čl. 39 iznimka: račun fiskaliziran u režimu
   krajnje potrošnje ne mora (ponovno) ići kao B2B eRačun. AKD dakle B2B kartičnu
   webshop prodaju rješava BEZ Fiskalizacije 2.0 / eRačuna.
3. Elementi računa: broj `3185-7-1` (brojčana oznaka/PP/NU), datum+vrijeme, OIB
   izdavatelja i kupca, način plaćanja „Kartica", JIR (uuid), ZKI (32 hex), QR kod,
   PDV raščlamba — sve što naš `FISKALNI_B2C` tip već generira.

## Zašto je relevantno (dogfooding obrazac)

AKD **prodaje fiskalizacijske certifikate i tu prodaju fiskalizira vlastitim
certifikatom** — kupnja proizvoda je ujedno živi demo proizvoda.

Isti obrazac za domovina-fiskal: **prodaja licence/pristupa dashboardu naplaćena
karticom fiskalizira se KROZ domovina-fiskal sam** (tenant vlasnika platforme).
Kupac (i kad je firma) dobije fiskalni B2C račun s JIR/ZKI + čl. 39 napomenu —
bez potrebe za eRačunom/posrednikom u v1. Uz to: od 1. 1. 2026. fiskalizacija
kartičnih/digitalnih naplata je i ZAKONSKA OBVEZA, ne samo demo.

Implementacijska posljedica: napomena po čl. 39 ide u `napomena` polje računa
(ispisuje se na PDF-u); ništa novo u backendu nije potrebno za sam račun.
