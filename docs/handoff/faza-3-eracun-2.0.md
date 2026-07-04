# PROMPT — Faza 3: eRačun 2.0 preko posrednika + eIzvještavanje

> Preduvjet: Faze 0–2 gotove. Pročitaj `docs/knowledge/03-fiskalizacija-2.0-eracun.md`,
> `06-sifrarnici-pdv-kpd-jedinice.md`, `13-provideri-krajolik.md`, `14-postupak-registracije-posrednika.md`,
> `15-ekonomija-i-troskovi.md`, `12-vlastita-pristupna-tocka.md` (za kasniju fazu vlastite PT).

## Cilj
Izdavanje i zaprimanje **eRačuna 2.0 (B2B/B2G)** preko **informacijskog posrednika** (ne vlastita PT),
+ fiskalizacija eRačuna + **eIzvještavanje**. Model = kao Fira (aplikacija nad posrednikom).

## Odluka prije koda (za korisnika)
Izbor posrednika: **doku** (0,10 €/rač, dev-friendly API, `13-*`), **ePoslovanje/Pondi**
(0,08 €/rač, Firin partner), ili **FINA** (+ Peppol). Kriteriji u `15-*` §3 i `13-*` §6.
Faza 1 = ostati aplikacijski sloj; vlastita PT (Domibus) tek kad volumen opravda (`12-*` §9).

## Zadaci
1. **UBL 2.1 generiranje** (HR CIUS 2025 + ext): `CustomizationID` iz `03-*` §4; obvezna polja
   EN 16931; **KPD** po stavci (`ItemClassificationCode listID` — provjeri `06-*`/`99` točan format),
   jedinice UN/ECE Rec 20, PDV kategorije/VATEX. Validiraj **Validatorom eRačuna** (Schematron).
2. **Integracija posrednika**: REST API odabranog posrednika (slanje/zaprimanje eRačuna). Mapiraj
   naš `RacunModel` → UBL → posrednik. Webhookovi za statuse (dostavljeno/odbijeno).
3. **Fiskalizacija eRačuna**: posrednik potpisuje svojim certom preko **punomoći** (tenant u ePorezna
   → FiskAplikacija → Ovlaštenja doda OIB posrednika). Dokumentiraj onboarding tenanta.
4. **Zaprimanje** ulaznih eRačuna → `troškovi` (kao Fira). **eIzvještavanje** o naplati (do 20. u
   mjesecu) i odbijanju (`03-*` §8).
5. **B2C ostaje na fazi 2** (ZKI/JIR/QR) — dvije odvojene staze, ne miješati (`03-*` §9).

## Definicija gotovog (verify)
Generiran UBL prolazi Validator eRačuna; testni eRačun poslan preko posrednika (test okruženje);
status preko webhooka; eIzvještavanje poslano. `/verify` + commit + push.

## Kasnije (opcionalno) — Faza 4: vlastita Pristupna točka
Domibus + DomiSMP + AS4 `eRačun-AS4` + AMS/MPS + Završno testiranje na PTS-u. Puni vodič: `12-*`.
Ući samo kad volumen/strategija to opravdaju (`15-*` break-even).
