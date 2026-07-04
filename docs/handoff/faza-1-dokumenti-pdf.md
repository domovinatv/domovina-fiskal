# PROMPT — Faza 1: Nefiskalni dokumenti + PDF + QR + email

> Preduvjet: Faza 0 gotova. Pročitaj `docs/knowledge/09-pdf-racun-i-qr-kod.md`,
> `06-sifrarnici-pdv-kpd-jedinice.md`, `10-edge-cases-validacije.md`,
> `docs/reference/fira-ui-walkthrough.md` (§4 forma računa, §8 proizvodi/KPD).

## Cilj
Izdavanje **nefiskalnih** dokumenata (PONUDA, PREDRAČUN, RAČUN) s ispravnim obveznim elementima,
PDF-om, QR-om za plaćanje i slanjem e-maila. Vrijednost bez ijednog certifikata (kao Firin `PONUDA` tok).

## Zadaci
1. **Tipovi dokumenata + numeriranje** po `sekvenca` (odvojeni slijedovi po tipu: računi /
   ponude / fiskalni). Broj `{redniBroj}-{oznPP}-{oznNU}`.
2. **PDV obračun** (`06-*`): stope 25/13/5/0, zaokruživanje po `10-*` (formula, ±0,01),
   `pdv_raspodjela` po stopi. Ne-PDV obveznik → napomena „PDV nije obračunat" (čl. 90 — provjeri stavak u `99`/`15`).
3. **Proizvodi + KPD**: katalog s obaveznom **KPD 2025** šifrom po stavci + jedinica (UN/ECE Rec 20).
   Dodaj KPD pretragu (kao Firin picker). (`06-*`, `fira-ui-walkthrough.md` §8)
4. **PDF** (`pdf-lib` na Workers): obvezni elementi čl. 79 Zakona o PDV-u (`09-*`), izdavatelj +
   kupac + stavke + PDV rekapitulacija + uvjeti (višejezično) + IBAN + model/poziv na broj.
5. **QR za plaćanje** (HUB3/PDF417 ili EPC — provjeri `09-*`; ovo je QR *za plaćanje*, NE fiskalni QR).
6. **Email**: slanje PDF-a (Cloudflare Email / provider), SPF/DKIM/DMARC. Privitci ≤ 6 MB (kao Fira).
7. **Admin/API**: kreiranje, pregled, download PDF-a, „pošalji e-mailom", „spremi kao skicu".

## Definicija gotovog (verify)
Kreiraj PONUDU i RAČUN preko API-ja i admina → generiran ispravan PDF (svi obvezni elementi),
QR za plaćanje radi, email s privitkom poslan. `/verify` + commit + push.

## Ne raditi
Fiskalizaciju (JIR/ZKI) — to je faza 2. eRačun UBL/AS4 — faza 3.
