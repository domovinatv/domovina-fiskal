# Fina CA certifikati (trust anchori za CIS)

CIS poslužitelj (port 8449) šalje samo leaf certifikat, a izdaje ga **privatni
Fina sub-CA** koji nije u javnim trust storeovima. Zato `cis.ts` bundla te
sub-CA certifikate i daje ih `subtls`-u kao trust anchor (pozadina:
`docs/research/faza-2-dnevnik-implementacije.md` §2,
`docs/knowledge/02-fiskalizacija-1.0-tehnicki.md`).

Ovo su **javni** CA certifikati, nisu tajna. `.gitignore` ignorira `*.pem`
(zbog ključeva tenanata), ali za ovaj direktorij ima iznimku
`!backend/src/fiskal/ca/*.pem`. Bez njih se svježi clone ne builda (K1 iz
`docs/handoff/2026-10-02-pregled-koda-i-plan-refactora.md`).

| Datoteka | Okolina | Subject (izdavatelj) | Vrijedi do | Izvor (AIA leaf certifikata CIS-a) | SHA-256 otisak (DER) |
|---|---|---|---|---|---|
| `fina-demo-ca-2020.pem` | TEST `cistest.apis-it.hr` | `CN=Fina Demo CA 2020` (Fina Demo Root CA) | 31. 7. 2030. | <http://demo-pki.fina.hr/certifikati/demo2020_sub_ca.cer> | `97:71:58:6D:69:DC:A7:3D:70:E1:96:B7:AA:05:9D:EF:3D:47:B2:DE:4B:C0:80:E7:38:E5:B1:BC:8A:10:5B:D2` |
| `fina-rdc-ca-2020.pem` | PROD `cis.porezna-uprava.hr` | `CN=Fina RDC 2020` (Fina Root CA) | 25. 11. 2030. | <http://rdc.fina.hr/RDC2020/FinaRDCCA2020.cer> | `41:40:B7:06:29:FD:A4:B8:A3:6F:D5:3F:B0:AA:53:23:71:57:86:99:31:B8:B2:30:8F:D0:5D:F3:FF:7D:78:AB` |

PEM-ovi su preuzeti 5. 7. 2026. Provjereno 12. 11. 2026.: datoteke s gornjih
URL-ova (preuzete na taj dan) imaju isti otisak, a leaf certifikati CIS TEST-a
i PROD-a (`openssl s_client`) i dalje navode te izdavatelje i te AIA URL-ove.

Otiske drži test `backend/test/fina-ca.test.ts`: promjena PEM-a bez promjene
otiska u testu ruši CI.

## Provjera / zamjena

```bash
# izdavatelj i AIA trenutačnog poslužiteljskog certifikata
echo | openssl s_client -connect cis.porezna-uprava.hr:8449 -servername cis.porezna-uprava.hr 2>/dev/null \
  | openssl x509 -noout -issuer -enddate -ext authorityInfoAccess

# otisak bundlanog PEM-a
openssl x509 -in fina-rdc-ca-2020.pem -noout -fingerprint -sha256
```

Kad CIS promijeni poslužiteljski certifikat (PU najavljuje oko mjesec dana
ranije), provjeri je li izdavatelj ostao isti. Ako nije, skini novi sub-CA s
AIA URL-a, pretvori ga u PEM (`openssl x509 -inform DER -in x.cer -out x.pem`),
pa ažuriraj ovu tablicu, import u `cis.ts` i otisak u testu.
