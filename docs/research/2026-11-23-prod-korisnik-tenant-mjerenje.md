# PROD `korisnik_tenant` prije passkey deploya (S6)

Datum: 23. 11. 2026., prije migracija 0014/0015 i deploya na `fiskal.domovina.ai`.
Izvor: `npx wrangler d1 execute fiskal_domovina --remote` (samo čitanje), D.O.M. račun.

| Mjera | Vrijednost |
|---|---|
| Redova u `korisnik_tenant` | **0** |
| Tenanata u `tenant` | 2 |
| Aktivnih redova po tenantu | nema (tablica prazna) |
| Redova s `bound_at` (ikad prijavljen preko GoTrue) | 0 |

Zaključak: stari dashboard na PROD-u nije imao nijednog vezanog korisnika, pa prelazak na passkey
ne odsijeca nikoga. Uvjet revizije odluke 3 („više redova nego što korisnik može obavijestiti isti
dan”) nije ispunjen. Pozivnice za postojeće redove nisu potrebne; prvu PROD pozivnicu (npr. vlasnik
tenanta 2 SUSRET) korisnik izdaje kad želi, u `/admin/korisnici`.

PROD `d1_migrations` prije deploya: nedostajale `0014_dashboard_passkey.sql` i `0015_korisnik_aktivnost.sql`.
