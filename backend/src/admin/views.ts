/**
 * Branded HTML za fiskal.domovina.ai admin (/admin).
 *
 * DOMOVINA brand (isti shell kao pipeline.domovina.ai / pay.domovina.ai):
 *   navy #002F6C — primarna boja, red #FF0000 — naglasak, muted #5A6570 — body.
 * Sve server-rendered, bez client JS-a (skela; auto-refresh dolazi kasnije po potrebi).
 */

import type {
  ApiKljucRow,
  CertifikatRow,
  DokuKonfigRow,
  KorisnikTenantRow,
  NaplatniUredajRow,
  OperaterRow,
  PoslovniProstorRow,
  RacunRow,
  TenantRow,
} from '../types';
import type { ProizvodRow, RacunKontekst } from '../db';
import { iznosHr } from '../pdf/racun-pdf';
import { escapeHtml } from '../util';

// Verzija aplikacije — BUMPAJ prije svakog redeploya; podudaraj s package.json.
export const APP_VERSION = 'v0.4.0';

const HEADER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="36" height="36" aria-hidden="true">
<defs>
<linearGradient id="hdrFlag" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#FF0000"/><stop offset="33.3%" stop-color="#FF0000"/>
<stop offset="33.3%" stop-color="#FFFFFF"/><stop offset="66.6%" stop-color="#FFFFFF"/>
<stop offset="66.6%" stop-color="#002F6C"/><stop offset="100%" stop-color="#002F6C"/>
</linearGradient>
</defs>
<rect width="512" height="512" rx="32" fill="white"/>
<path d="M72 64H248C354.071 64 440 149.929 440 256C440 362.071 354.071 448 248 448H72V64Z" fill="url(#hdrFlag)"/>
<path d="M168 160H248C301.019 160 344 202.981 344 256C344 309.019 301.019 352 248 352H168V160Z" fill="white"/>
</svg>`;

const BASE_STYLE = `<style>
:root {
  --navy: #002F6C; --red: #FF0000; --muted: #5A6570;
  --border: #E1E5EA; --surface: #F5F7F9; --bg: #FFFFFF;
  --success: #2E8540; --warning: #B45309; --danger: #B42318;
  font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--navy); }
a { color: var(--navy); }
.tricolor { display: flex; height: 6px; }
.tricolor span { flex: 1; }
.tricolor .red { background: var(--red); }
.tricolor .navy { background: var(--navy); }
header { padding: .9rem 1.5rem; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
header .brand { display: flex; align-items: center; gap: .6rem; }
header .brand .word { font-weight: 800; letter-spacing: .04em; font-size: 1.1rem; }
header .brand .accent { color: var(--red); }
header nav { display: flex; gap: .8rem; font-size: .9rem; font-weight: 600; }
main { padding: 1.5rem; max-width: 80rem; margin: 0 auto; }
h1 { font-size: 1.45rem; margin: 0 0 1rem; }
h2 { font-size: 1.1rem; margin: 1.5rem 0 .6rem; }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
th { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .84rem; }
.pill { display: inline-block; padding: .1rem .55rem; border-radius: 1rem; font-size: .74rem; font-weight: 700; }
.p-ok    { background: #E0F1E5; color: var(--success); }
.p-warn  { background: #FDF1E0; color: var(--warning); }
.p-off   { background: #ECEFF2; color: var(--muted); }
.p-info  { background: #E7EEF8; color: #1D4ED8; }
.box { background: var(--surface); border: 1px solid var(--border); border-radius: .6rem;
  padding: 1rem; margin: .75rem 0 1.25rem; }
.box form { display: flex; flex-wrap: wrap; gap: .7rem; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: .25rem; }
.field label { font-size: .72rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.field input, .field select { border: 1px solid var(--border); border-radius: .4rem; padding: .45rem .6rem;
  font-size: .9rem; font-family: inherit; background: var(--bg); color: var(--navy); }
button { border: 0; border-radius: .4rem; padding: .55rem 1.1rem; font-size: .9rem;
  font-weight: 700; cursor: pointer; background: var(--navy); color: #fff; }
button:hover { background: #013a86; }
.flash { background: #E0F1E5; border: 1px solid #BFE3CC; border-radius: .6rem; padding: 1rem; margin-bottom: 1rem; }
.flash .kljuc { font-family: ui-monospace, Menlo, monospace; font-weight: 700; word-break: break-all; }
.greska { background: #F8E2E0; border: 1px solid #F3C9C5; border-radius: .6rem; padding: 1rem; margin-bottom: 1rem; color: var(--danger); }
.prazno { color: var(--muted); font-style: italic; padding: .6rem 0; }
footer { padding: 1rem 1.5rem 2rem; color: var(--muted); font-size: .8rem; text-align: center; }
</style>`;

export function layout(naslov: string, body: string): string {
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(naslov)}</title>
${BASE_STYLE}
</head>
<body>
<div class="tricolor"><span class="red"></span><span></span><span class="navy"></span></div>
<header>
  <div class="brand">${HEADER_LOGO_SVG}<span class="word">DOMOVINA<span class="accent">.FISKAL</span></span></div>
  <nav><a href="/admin">Tenanti</a><a href="/admin/racuni">Računi</a></nav>
</header>
<main>
${body}
</main>
<footer>domovina-fiskal ${APP_VERSION} — open-source servis za HR fiskalizirane račune</footer>
</body>
</html>`;
}

function pillStatus(s: string): string {
  const klasa =
    s === 'active' || s === 'izdano' || s === 'fiskaliziran' || s === 'prijavljen' ? 'p-ok'
    : s === 'nacrt' || s === 'neposlano' ? 'p-info'
    : s === 'greska' || s === 'odbijen' ? 'p-warn'
    : 'p-off';
  return `<span class="pill ${klasa}">${escapeHtml(s)}</span>`;
}

// ───────────────────────── Tenanti (popis + forma) ─────────────────────────

export function renderTenantiPage(tenanti: TenantRow[], greska?: string): string {
  const redovi = tenanti
    .map(
      (t) => `<tr>
  <td><a href="/admin/tenant/${t.id}">${escapeHtml(t.naziv)}</a></td>
  <td class="mono">${escapeHtml(t.oib)}</td>
  <td>${t.u_sustavu_pdv ? 'da (R1)' : 'ne (R2)'}</td>
  <td class="mono">${escapeHtml(t.oznaka_slijednosti_def)}</td>
  <td>${pillStatus(t.status)}</td>
  <td class="mono">${escapeHtml(t.created_at)}</td>
</tr>`,
    )
    .join('');

  return layout(
    'DOMOVINA Fiskal — tenanti',
    `${greska ? `<div class="greska">${escapeHtml(greska)}</div>` : ''}
<h1>Tenanti</h1>
<div class="box">
  <form method="post" action="/admin/tenanti">
    <div class="field"><label>Naziv *</label><input name="naziv" required placeholder="Firma d.o.o."></div>
    <div class="field"><label>OIB *</label><input name="oib" required pattern="\\d{11}" placeholder="12345678903"></div>
    <div class="field"><label>Ulica i kbr</label><input name="ulica" placeholder="Ilica 1"></div>
    <div class="field"><label>Mjesto</label><input name="mjesto" placeholder="Zagreb"></div>
    <div class="field"><label>Pošt. broj</label><input name="postanski_broj" placeholder="10000"></div>
    <div class="field"><label>IBAN</label><input name="iban" placeholder="HR12…"></div>
    <div class="field"><label>U sustavu PDV-a</label>
      <select name="u_sustavu_pdv"><option value="1">da (R1)</option><option value="0">ne (R2)</option></select></div>
    <div class="field"><label>Slijednost</label>
      <select name="oznaka_slijednosti"><option value="P">P — poslovni prostor</option><option value="N">N — naplatni uređaj</option></select></div>
    <button type="submit">Dodaj tenanta</button>
  </form>
</div>
<table>
  <thead><tr><th>Naziv</th><th>OIB</th><th>PDV</th><th>Slijednost</th><th>Status</th><th>Kreiran</th></tr></thead>
  <tbody>${redovi || '<tr><td colspan="6" class="prazno">Nema tenanata — dodaj prvog gore.</td></tr>'}</tbody>
</table>`,
  );
}

// ───────────────────────── Detalj tenanta ─────────────────────────

export interface TenantDetaljData {
  tenant: TenantRow;
  prostori: PoslovniProstorRow[];
  uredjaji: (NaplatniUredajRow & { pp_oznaka: string })[];
  operateri: OperaterRow[];
  kljucevi: ApiKljucRow[];
  certifikati: CertifikatRow[];
  dokuKonfig: DokuKonfigRow[];
  proizvodi: ProizvodRow[];
  racuni: RacunRow[];
  korisnici: KorisnikTenantRow[];
  noviKljuc?: { rawKey: string; opis: string | null };
  greska?: string;
}

export function renderTenantDetaljPage(d: TenantDetaljData): string {
  const t = d.tenant;
  const baza = `/admin/tenant/${t.id}`;

  const prostoriRedovi = d.prostori
    .map(
      (p) => `<tr><td class="mono">${escapeHtml(p.oznaka)}</td><td>${escapeHtml(p.adr_ulica ?? '')} ${escapeHtml(p.adr_naselje ?? '')}</td>
<td class="mono">${escapeHtml(p.datum_pocetka_primjene)}</td><td>${pillStatus(p.cis_status)}</td>
<td><form method="post" action="${baza}/prostori/${p.id}/cis-status" style="display:inline">
  <input type="hidden" name="status" value="${p.cis_status === 'prijavljen' ? 'neposlano' : 'prijavljen'}">
  <button type="submit" style="background:#5A6570">${p.cis_status === 'prijavljen' ? 'Poništi prijavu' : 'Označi prijavljen (ePorezna)'}</button>
</form></td></tr>`,
    )
    .join('');

  const uredjajiRedovi = d.uredjaji
    .map(
      (u) => `<tr><td class="mono">${escapeHtml(u.pp_oznaka)}</td><td class="mono">${escapeHtml(u.oznaka)}</td>
<td>${escapeHtml(u.opis ?? '')}</td><td>${u.aktivan ? pillStatus('aktivan') : pillStatus('deaktiviran')}</td></tr>`,
    )
    .join('');

  const operateriRedovi = d.operateri
    .map(
      (o) => `<tr><td class="mono">${escapeHtml(o.oib_operatera)}</td><td>${escapeHtml(o.ime ?? '')}</td>
<td>${o.aktivan ? pillStatus('aktivan') : pillStatus('deaktiviran')}</td></tr>`,
    )
    .join('');

  const kljuceviRedovi = d.kljucevi
    .map(
      (k) => `<tr><td class="mono">${escapeHtml(k.prefiks)}…</td><td>${escapeHtml(k.opis ?? '')}</td>
<td>${k.aktivan ? pillStatus('aktivan') : pillStatus('deaktiviran')}</td>
<td class="mono">${escapeHtml(k.zadnje_koristen_at ?? '—')}</td>
<td>
  <form method="post" action="${baza}/kljucevi/${k.id}/${k.aktivan ? 'deaktiviraj' : 'aktiviraj'}" style="display:inline">
    <button type="submit">${k.aktivan ? 'Deaktiviraj' : 'Aktiviraj'}</button>
  </form>
</td></tr>`,
    )
    .join('');

  const certifikatiRedovi = d.certifikati
    .map(
      (cert) => `<tr><td>${pillStatus(cert.okolina)}</td><td class="mono">${escapeHtml((cert.fingerprint_sha256 ?? '').slice(0, 16))}…</td>
<td class="mono">${escapeHtml(cert.not_after ?? '—')}</td><td>${cert.aktivan ? pillStatus('aktivan') : pillStatus('zamijenjen')}</td>
<td class="mono">${escapeHtml(cert.created_at)}</td></tr>`,
    )
    .join('');

  const dokuRedovi = d.dokuKonfig
    .map(
      (dk) => `<tr><td>${pillStatus(dk.okolina)}</td><td class="mono">${escapeHtml(dk.token_prefiks ?? '—')}…</td>
<td>${dk.ams_registriran ? '<span class="pill p-ok">za zaprimanje</span>' : '<span class="pill p-info">samo slanje</span>'}</td>
<td>${dk.aktivan ? pillStatus('aktivan') : pillStatus('deaktiviran')}</td>
<td class="mono">${escapeHtml(dk.updated_at)}</td></tr>`,
    )
    .join('');

  const racuniRedovi = d.racuni
    .map(
      (r) => `<tr><td class="mono"><a href="/admin/racun/${r.id}">${escapeHtml(r.broj_racuna_full ?? `#${r.id} (skica)`)}</a></td><td>${escapeHtml(r.tip_dokumenta)}</td>
<td>${pillStatus(r.status)}</td><td class="mono">${iznosHr(r.iznos_s_pdv)} ${escapeHtml(r.valuta)}</td>
<td class="mono">${escapeHtml(r.datum_vrijeme)}</td>
<td><a href="/admin/racun/${r.id}/pdf" target="_blank">PDF</a></td></tr>`,
    )
    .join('');

  const korisniciRedovi = d.korisnici
    .map(
      (k) => `<tr><td>${escapeHtml(k.user_email)}</td><td>${pillStatus(k.uloga)}</td>
<td>${k.user_id ? `<span class="pill p-ok">vezan</span> <span class="mono" style="font-size:.72rem">${escapeHtml(k.user_id.slice(0, 8))}…</span>` : '<span class="pill p-info">čeka prvu prijavu</span>'}</td>
<td>${k.aktivan ? pillStatus('aktivan') : pillStatus('deaktiviran')}</td>
<td class="mono">${escapeHtml(k.created_at)}</td>
<td><form method="post" action="${baza}/korisnici/${k.id}/${k.aktivan ? 'deaktiviraj' : 'aktiviraj'}" style="display:inline">
  <button type="submit">${k.aktivan ? 'Deaktiviraj' : 'Aktiviraj'}</button>
</form></td></tr>`,
    )
    .join('');

  const proizvodiRedovi = d.proizvodi
    .map(
      (p) => `<tr><td>${escapeHtml(p.naziv)}</td><td class="mono">${escapeHtml(p.sifra ?? '')}</td>
<td class="mono">${iznosHr(p.neto_cijena)}</td><td class="mono">${escapeHtml(p.jedinica_mjere)}</td>
<td class="mono">${escapeHtml(p.pdv_stopa)}% (${escapeHtml(p.pdv_kategorija)})</td>
<td class="mono">${escapeHtml(p.kpd)}</td></tr>`,
    )
    .join('');

  return layout(
    `DOMOVINA Fiskal — ${t.naziv}`,
    `${d.greska ? `<div class="greska">${escapeHtml(d.greska)}</div>` : ''}
${d.noviKljuc ? `<div class="flash">Novi API ključ za „${escapeHtml(d.noviKljuc.opis ?? '')}" — <strong>zapiši ga odmah, prikazuje se samo jednom:</strong><br><span class="kljuc">${escapeHtml(d.noviKljuc.rawKey)}</span></div>` : ''}
<h1>${escapeHtml(t.naziv)} <span class="pill p-info mono">OIB ${escapeHtml(t.oib)}</span> ${pillStatus(t.status)}</h1>
<p>${t.u_sustavu_pdv ? 'U sustavu PDV-a (R1)' : 'Nije u sustavu PDV-a (R2)'} · slijednost <strong>${escapeHtml(t.oznaka_slijednosti_def)}</strong>
 · IBAN <span class="mono">${escapeHtml(t.iban ?? '—')}</span> · <a href="/admin">← svi tenanti</a></p>

<h2>Poslovni prostori</h2>
<div class="box"><form method="post" action="${baza}/prostori">
  <div class="field"><label>Oznaka (oznPP) *</label><input name="oznaka" required placeholder="POSL1"></div>
  <div class="field"><label>Ulica i kbr</label><input name="ulica"></div>
  <div class="field"><label>Naselje</label><input name="naselje"></div>
  <div class="field"><label>Primjena od *</label><input name="datum_pocetka" type="date" required></div>
  <button type="submit">Dodaj prostor</button>
</form></div>
<table><thead><tr><th>Oznaka</th><th>Adresa</th><th>Primjena od</th><th>CIS status</th><th></th></tr></thead>
<tbody>${prostoriRedovi || '<tr><td colspan="5" class="prazno">Nema prostora.</td></tr>'}</tbody></table>
<p style="font-size:.8rem;color:var(--muted)">Prijava/odjava poslovnog prostora od 2017. ide isključivo kroz <strong>ePoreznu</strong> (SOAP metoda je ukinuta) — ovdje se samo evidentira da je obavljena; fiskalni računi traže status „prijavljen".</p>

<h2>Naplatni uređaji</h2>
<div class="box"><form method="post" action="${baza}/uredjaji">
  <div class="field"><label>Poslovni prostor *</label>
    <select name="poslovni_prostor_id" required>${d.prostori.map((p) => `<option value="${p.id}">${escapeHtml(p.oznaka)}</option>`).join('')}</select></div>
  <div class="field"><label>Oznaka (oznNU) *</label><input name="oznaka" required placeholder="1"></div>
  <div class="field"><label>Opis</label><input name="opis" placeholder="Webshop"></div>
  <button type="submit">Dodaj uređaj</button>
</form></div>
<table><thead><tr><th>Prostor</th><th>Oznaka</th><th>Opis</th><th>Status</th></tr></thead>
<tbody>${uredjajiRedovi || '<tr><td colspan="4" class="prazno">Nema uređaja.</td></tr>'}</tbody></table>

<h2>Operateri</h2>
<div class="box"><form method="post" action="${baza}/operateri">
  <div class="field"><label>OIB operatera *</label><input name="oib" required pattern="\\d{11}"></div>
  <div class="field"><label>Ime</label><input name="ime"></div>
  <button type="submit">Dodaj operatera</button>
</form></div>
<table><thead><tr><th>OIB</th><th>Ime</th><th>Status</th></tr></thead>
<tbody>${operateriRedovi || '<tr><td colspan="3" class="prazno">Nema operatera.</td></tr>'}</tbody></table>

<h2>API ključevi</h2>
<div class="box"><form method="post" action="${baza}/kljucevi">
  <div class="field"><label>Opis</label><input name="opis" placeholder="webshop produkcija"></div>
  <button type="submit">Kreiraj ključ</button>
</form></div>
<table><thead><tr><th>Prefiks</th><th>Opis</th><th>Status</th><th>Zadnje korišten</th><th></th></tr></thead>
<tbody>${kljuceviRedovi || '<tr><td colspan="5" class="prazno">Nema ključeva.</td></tr>'}</tbody></table>

<h2>Dashboard pristup (SSO korisnici)</h2>
<div class="box"><form method="post" action="${baza}/korisnici">
  <div class="field"><label>E-mail *</label><input name="email" type="email" required placeholder="korisnik@primjer.hr"></div>
  <div class="field"><label>Uloga</label>
    <select name="uloga"><option value="vlasnik">vlasnik</option><option value="knjigovodja">knjigovođa</option><option value="operater">operater (bez postavki)</option></select></div>
  <button type="submit">Dodaj pristup</button>
</form>
<p style="margin:.6rem 0 0;font-size:.8rem;color:var(--muted)">Korisnik se prijavljuje na customer dashboard dijeljenim Domovina računom (GoTrue SSO, api.domovina.ai). Identitet (user_id) se veže automatski na prvoj prijavi s ovim e-mailom.</p></div>
<table><thead><tr><th>E-mail</th><th>Uloga</th><th>Identitet</th><th>Status</th><th>Dodan</th><th></th></tr></thead>
<tbody>${korisniciRedovi || '<tr><td colspan="6" class="prazno">Nema dashboard korisnika.</td></tr>'}</tbody></table>

<h2>Certifikati (fiskalizacija)</h2>
<div class="box"><form method="post" action="${baza}/certifikati" enctype="multipart/form-data">
  <div class="field"><label>P12/PFX datoteka *</label><input name="p12" type="file" required accept=".p12,.pfx"></div>
  <div class="field"><label>Lozinka P12 *</label><input name="lozinka" type="password" required autocomplete="off"></div>
  <div class="field"><label>Okolina</label>
    <select name="okolina"><option value="test">test</option><option value="prod">prod</option></select></div>
  <button type="submit">Učitaj (enkriptira se at-rest)</button>
</form>
<p style="margin:.6rem 0 0;font-size:.8rem;color:var(--muted)">P12 se parsira u memoriji (lozinka se NE sprema); privatni ključ ide AES-256-GCM enkriptiran (envelope: per-cert DEK + KEK iz Worker Secreta). ZKI i XML-DSIG potpis se rade ovim ključem.</p></div>
<table><thead><tr><th>Okolina</th><th>Otisak (SHA-256)</th><th>Vrijedi do</th><th>Status</th><th>Učitan</th></tr></thead>
<tbody>${certifikatiRedovi || '<tr><td colspan="5" class="prazno">Nema certifikata.</td></tr>'}</tbody></table>

<h2>eRačun 2.0 — doku posrednik (BYO-key)</h2>
<div class="box"><form method="post" action="${baza}/doku">
  <div class="field"><label>doku API-TOKEN *</label><input name="token" required autocomplete="off" placeholder="token iz doku portala"></div>
  <div class="field"><label>Okolina</label>
    <select name="okolina"><option value="test">test</option><option value="prod">prod</option></select></div>
  <button type="submit">Spremi token (enkriptira se at-rest)</button>
</form>
<p style="margin:.6rem 0 0;font-size:.8rem;color:var(--muted)">Svaki tenant unosi <strong>svoj</strong> doku token (doku naplaćuje njemu direktno). Token se sprema AES-256-GCM enkriptiran (envelope, KEK iz Worker Secreta); doku svojim certom potpisuje i šalje UBL. Pristupne podatke tenant dobiva od doku-a (<span class="mono">hello@doku.hr</span>). Slanje: <span class="mono">POST /api/v1/racun/:id/posalji-eracun</span>.</p></div>
<table><thead><tr><th>Okolina</th><th>Token</th><th>AMS</th><th>Status</th><th>Ažuriran</th></tr></thead>
<tbody>${dokuRedovi || '<tr><td colspan="5" class="prazno">Nema doku tokena — tenant ne može slati eRačun dok se ne unese.</td></tr>'}</tbody></table>

<h2>Proizvodi (katalog s KPD 2025)</h2>
<div class="box"><form method="post" action="${baza}/proizvodi">
  <div class="field"><label>Naziv *</label><input name="naziv" required placeholder="Konzultacije"></div>
  <div class="field"><label>Šifra</label><input name="sifra" placeholder="KONZ-1"></div>
  <div class="field"><label>Neto cijena *</label><input name="cijena" required placeholder="500.00" pattern="-?\\d+(\\.\\d{1,2})?"></div>
  <div class="field"><label>Jedinica</label>
    <select name="jedinica"><option value="H87">kom (H87)</option><option value="HUR">sat (HUR)</option><option value="DAY">dan (DAY)</option><option value="MON">mjesec (MON)</option><option value="KGM">kg (KGM)</option><option value="LTR">l (LTR)</option><option value="MTR">m (MTR)</option><option value="MTK">m² (MTK)</option></select></div>
  <div class="field"><label>PDV stopa</label>
    <select name="stopa"><option value="25">25 %</option><option value="13">13 %</option><option value="5">5 %</option><option value="0">0 %</option></select></div>
  <div class="field" style="min-width:22rem"><label>KPD 2025 * (pretraži šifru ili naziv)</label>
    <input name="kpd" id="kpd-input" required placeholder="npr. 62.02 ili 'savjetovanje'" list="kpd-lista" autocomplete="off">
    <datalist id="kpd-lista"></datalist></div>
  <button type="submit">Dodaj proizvod</button>
</form></div>
<table><thead><tr><th>Naziv</th><th>Šifra</th><th>Cijena</th><th>JM</th><th>PDV</th><th>KPD</th></tr></thead>
<tbody>${proizvodiRedovi || '<tr><td colspan="6" class="prazno">Nema proizvoda.</td></tr>'}</tbody></table>
<script>
// KPD picker: pretraga službenog šifrarnika (DZS KPD 2025) uz tipkanje.
const kpdInput = document.getElementById('kpd-input');
const kpdLista = document.getElementById('kpd-lista');
let kpdTimer;
kpdInput?.addEventListener('input', () => {
  clearTimeout(kpdTimer);
  const q = kpdInput.value.trim();
  if (q.length < 2) return;
  kpdTimer = setTimeout(async () => {
    const r = await fetch('/admin/api/kpd?q=' + encodeURIComponent(q));
    if (!r.ok) return;
    const { rezultati } = await r.json();
    kpdLista.innerHTML = rezultati.map(k =>
      '<option value="' + k.sifra + '">' + k.sifra + ' — ' + k.naziv.replaceAll('<','&lt;') + '</option>').join('');
  }, 200);
});
</script>

<h2>Dokumenti <a href="${baza}/dokument/novi" style="font-size:.85rem;margin-left:.6rem">➕ novi dokument</a></h2>
<table><thead><tr><th>Broj</th><th>Tip</th><th>Status</th><th>Iznos</th><th>Izdan</th><th></th></tr></thead>
<tbody>${racuniRedovi || '<tr><td colspan="6" class="prazno">Nema dokumenata.</td></tr>'}</tbody></table>`,
  );
}

// ───────────────────────── Novi dokument (forma) ─────────────────────────

export function renderNoviDokumentPage(
  tenant: TenantRow,
  uredjaji: (NaplatniUredajRow & { pp_oznaka: string })[],
  operateri: OperaterRow[],
  proizvodi: ProizvodRow[],
  greska?: string,
): string {
  const baza = `/admin/tenant/${tenant.id}`;
  const uredjajOpcije = uredjaji
    .filter((u) => u.aktivan)
    .map((u) => `<option value="${escapeHtml(u.pp_oznaka)}|${escapeHtml(u.oznaka)}">${escapeHtml(u.pp_oznaka)} / ${escapeHtml(u.oznaka)}${u.opis ? ` — ${escapeHtml(u.opis)}` : ''}</option>`)
    .join('');
  const operaterOpcije = ['<option value="">—</option>']
    .concat(operateri.filter((o) => o.aktivan).map((o) => `<option value="${escapeHtml(o.oib_operatera)}">${escapeHtml(o.ime ?? o.oib_operatera)}</option>`))
    .join('');
  const proizvodOpcije = ['<option value="">— slobodna stavka —</option>']
    .concat(proizvodi.filter((p) => p.aktivan).map((p) =>
      `<option value="${p.id}" data-naziv="${escapeHtml(p.naziv)}" data-cijena="${escapeHtml(p.neto_cijena)}" data-jm="${escapeHtml(p.jedinica_mjere)}" data-stopa="${escapeHtml(p.pdv_stopa)}" data-kpd="${escapeHtml(p.kpd)}">${escapeHtml(p.naziv)}</option>`))
    .join('');

  return layout(
    `Novi dokument — ${tenant.naziv}`,
    `${greska ? `<div class="greska">${escapeHtml(greska)}</div>` : ''}
<h1>Novi dokument <span class="pill p-info">${escapeHtml(tenant.naziv)}</span></h1>
<p><a href="${baza}">← natrag na tenanta</a></p>
<form method="post" action="${baza}/dokument/novi">
<div class="box" style="display:flex;flex-wrap:wrap;gap:.7rem;align-items:flex-end">
  <div class="field"><label>Vrsta *</label>
    <select name="tip"><option value="RACUN">Račun</option><option value="PONUDA">Ponuda</option><option value="PREDRACUN">Predračun</option><option value="FISKALNI_B2C">Fiskalni B2C (ZKI/JIR)</option></select></div>
  <div class="field"><label>Prostor / uređaj *</label><select name="pp_nu" required>${uredjajOpcije}</select></div>
  <div class="field"><label>Operater</label><select name="operater">${operaterOpcije}</select></div>
  <div class="field"><label>Način plaćanja</label>
    <select name="nacin"><option value="TRANSAKCIJSKI">transakcijski</option><option value="KARTICA">kartica</option><option value="GOTOVINA">gotovina</option><option value="OSTALO">ostalo</option></select></div>
  <div class="field"><label>Dospijeće</label><input name="dospijece" type="date"></div>
  <div class="field"><label>Vrijedi do (ponuda)</label><input name="vrijedi_do" type="date"></div>
</div>
<div class="box" style="display:flex;flex-wrap:wrap;gap:.7rem;align-items:flex-end">
  <div class="field"><label>Kupac (naziv)</label><input name="kupac_naziv" placeholder="prazno = krajnji kupac"></div>
  <div class="field"><label>OIB kupca</label><input name="kupac_oib" pattern="\\d{11}"></div>
  <div class="field"><label>Email kupca</label><input name="kupac_email" type="email"></div>
  <div class="field"><label>Ulica</label><input name="kupac_ulica"></div>
  <div class="field"><label>Grad</label><input name="kupac_grad"></div>
  <div class="field"><label>Pošt. broj</label><input name="kupac_pbr"></div>
</div>
<div class="box">
  <table id="stavke"><thead><tr><th>Proizvod</th><th>Naziv *</th><th>Kol.</th><th>JM</th><th>Cijena *</th><th>Popust %</th><th>PDV %</th><th>KPD</th></tr></thead>
  <tbody></tbody></table>
  <button type="button" onclick="dodajRed()" style="margin-top:.6rem;background:#5A6570">+ stavka</button>
</div>
<div class="box" style="display:flex;flex-direction:column;gap:.7rem">
  <div class="field"><label>Napomena (na PDF-u)</label><input name="napomena"></div>
  <div class="field"><label>Uvjeti (footer PDF-a)</label><input name="uvjeti" placeholder="npr. Plaćanje u roku 15 dana od izdavanja."></div>
</div>
<div style="display:flex;gap:.7rem">
  <button type="submit" name="akcija" value="izdaj">Izdaj dokument</button>
  <button type="submit" name="akcija" value="skica" style="background:#5A6570">Spremi kao skicu</button>
</div>
</form>
<template id="red-stavke"><tr>
  <td><select name="st_proizvod[]" onchange="popuniIzKataloga(this)">${proizvodOpcije}</select></td>
  <td><input name="st_naziv[]" style="width:11rem"></td>
  <td><input name="st_kolicina[]" value="1" style="width:3.5rem"></td>
  <td><input name="st_jm[]" value="H87" style="width:3.2rem"></td>
  <td><input name="st_cijena[]" style="width:5rem" placeholder="0.00"></td>
  <td><input name="st_popust[]" value="0" style="width:3.5rem"></td>
  <td><select name="st_stopa[]">${tenant.u_sustavu_pdv ? '<option>25</option><option>13</option><option>5</option><option>0</option>' : '<option>0</option>'}</select></td>
  <td><input name="st_kpd[]" style="width:5.5rem" placeholder="NN.NN.NN"></td>
</tr></template>
<script>
const PDV_OBVEZNIK = ${tenant.u_sustavu_pdv ? 'true' : 'false'};
function dodajRed() {
  const tpl = document.getElementById('red-stavke');
  document.querySelector('#stavke tbody').appendChild(tpl.content.cloneNode(true));
}
function popuniIzKataloga(sel) {
  const o = sel.selectedOptions[0];
  const tr = sel.closest('tr');
  if (!o || !o.value) return;
  tr.querySelector('[name="st_naziv[]"]').value = o.dataset.naziv;
  tr.querySelector('[name="st_cijena[]"]').value = o.dataset.cijena;
  tr.querySelector('[name="st_jm[]"]').value = o.dataset.jm;
  tr.querySelector('[name="st_stopa[]"]').value = PDV_OBVEZNIK ? o.dataset.stopa : '0';
  tr.querySelector('[name="st_kpd[]"]').value = o.dataset.kpd;
}
dodajRed();
</script>`,
  );
}

// ───────────────────────── Detalj dokumenta ─────────────────────────

export function renderRacunDetaljPage(k: RacunKontekst, poruka?: { ok?: string; greska?: string }): string {
  const r = k.racun;
  const jeSkica = r.status === 'nacrt';
  const stavkeRedovi = k.stavke
    .map(
      (s) => `<tr><td>${s.redni_broj}</td><td>${escapeHtml(s.naziv)}${s.kpd ? `<br><span class="mono" style="font-size:.72rem;color:var(--muted)">KPD ${escapeHtml(s.kpd)}</span>` : ''}</td>
<td class="mono">${escapeHtml(s.kolicina)} ${escapeHtml(s.jedinica_mjere)}</td>
<td class="mono">${iznosHr(s.neto_cijena)}</td><td class="mono">${escapeHtml(s.popust_posto)}%</td>
<td class="mono">${escapeHtml(s.pdv_stopa)}% (${escapeHtml(s.pdv_kategorija)})</td></tr>`,
    )
    .join('');
  const raspodjelaRedovi = k.raspodjela
    .map(
      (p) => `<tr><td class="mono">${escapeHtml(p.stopa)}% (${escapeHtml(p.kategorija_pdv)})</td>
<td class="mono">${iznosHr(p.oporezivi_iznos)}</td><td class="mono">${iznosHr(p.iznos_poreza)}</td></tr>`,
    )
    .join('');

  return layout(
    `Dokument ${r.broj_racuna_full ?? `#${r.id}`}`,
    `${poruka?.greska ? `<div class="greska">${escapeHtml(poruka.greska)}</div>` : ''}
${poruka?.ok ? `<div class="flash">${escapeHtml(poruka.ok)}</div>` : ''}
<h1>${escapeHtml(r.tip_dokumenta)} <span class="mono">${escapeHtml(r.broj_racuna_full ?? `#${r.id} (skica)`)}</span> ${pillStatus(r.status)}</h1>
<p><a href="/admin/tenant/${r.tenant_id}">← ${escapeHtml(k.tenant.naziv)}</a> ·
   <a href="/admin/racun/${r.id}/pdf" target="_blank"><strong>📄 PDF</strong></a></p>
<div style="display:flex;gap:.7rem;margin:.8rem 0">
  ${jeSkica ? `<form method="post" action="/admin/racun/${r.id}/izdaj"><button type="submit">Izdaj (dodijeli broj)</button></form>` : ''}
  ${!jeSkica ? `<form method="post" action="/admin/racun/${r.id}/posalji" style="display:flex;gap:.5rem">
    <input name="na" type="email" placeholder="${escapeHtml(k.kupac?.email ?? 'email primatelja')}" style="border:1px solid var(--border);border-radius:.4rem;padding:.45rem .6rem">
    <button type="submit">✉️ Pošalji e-mailom</button></form>` : ''}
  ${r.tip_dokumenta === 'fiskalni_b2c' && !r.jir ? `<form method="post" action="/admin/racun/${r.id}/fiskaliziraj"><button type="submit" style="background:var(--red)">⚡ Fiskaliziraj (CIS)</button></form>` : ''}
</div>
${r.tip_dokumenta === 'fiskalni_b2c' ? `<div class="box" style="display:block">
  <strong>Fiskalizacija</strong><br>
  ZKI: <span class="mono">${escapeHtml(r.zki ?? '— (još nije izračunat)')}</span><br>
  JIR: ${r.jir ? `<span class="mono">${escapeHtml(r.jir)}</span> ${pillStatus('fiskaliziran')}` : `<em>čeka JIR (naknadna dostava: rok 2 radna dana, čl. 21. st. 2.)</em>`}<br>
  ${r.qr_payload ? `QR: <span class="mono" style="font-size:.75rem">${escapeHtml(r.qr_payload)}</span><br>` : ''}
  ${r.fiskal_greska ? `<span style="color:var(--danger)">Zadnja greška (pokušaj ${r.fiskal_pokusaja}): ${escapeHtml(r.fiskal_greska)}</span>` : ''}
</div>` : ''}
<p>Kupac: <strong>${escapeHtml(k.kupac?.naziv ?? 'krajnji kupac')}</strong>${k.kupac?.oib ? ` (OIB ${escapeHtml(k.kupac.oib)})` : ''}
 · datum: <span class="mono">${escapeHtml(r.datum_vrijeme)}</span>
 · plaćanje: ${escapeHtml(r.nacin_placanja ?? '—')}
 ${r.poziv_na_broj ? `· poziv na broj: <span class="mono">${escapeHtml(r.model_placanja ?? '')} ${escapeHtml(r.poziv_na_broj)}</span>` : ''}
 ${r.poslano_email_ts ? `· ✉️ poslano ${escapeHtml(r.poslano_email_ts)} na ${escapeHtml(r.poslano_email_na ?? '')}` : ''}</p>
${r.klauzula_pdv ? `<p><em>${escapeHtml(r.klauzula_pdv)}</em></p>` : ''}
<h2>Stavke</h2>
<table><thead><tr><th>#</th><th>Naziv</th><th>Količina</th><th>Cijena</th><th>Popust</th><th>PDV</th></tr></thead>
<tbody>${stavkeRedovi}</tbody></table>
<h2>PDV raščlamba</h2>
<table style="max-width:30rem"><thead><tr><th>Stopa</th><th>Osnovica</th><th>PDV</th></tr></thead>
<tbody>${raspodjelaRedovi || '<tr><td colspan="3" class="prazno">Bez PDV-a.</td></tr>'}</tbody></table>
<p style="font-size:1.05rem"><strong>Ukupno: ${iznosHr(r.iznos_s_pdv)} ${escapeHtml(r.valuta)}</strong>
 (bez PDV-a ${iznosHr(r.iznos_bez_pdv)}, PDV ${iznosHr(r.pdv)})</p>`,
  );
}

// ───────────────────────── Računi (globalni popis) ─────────────────────────

export function renderRacuniPage(racuni: (RacunRow & { tenant_naziv?: string })[]): string {
  const redovi = racuni
    .map(
      (r) => `<tr><td>${escapeHtml(r.tenant_naziv ?? r.tenant_id)}</td><td class="mono"><a href="/admin/racun/${r.id}">${escapeHtml(r.broj_racuna_full ?? `#${r.id} (skica)`)}</a></td>
<td>${escapeHtml(r.tip_dokumenta)}</td><td>${pillStatus(r.status)}</td>
<td class="mono">${iznosHr(r.iznos_s_pdv)} ${escapeHtml(r.valuta)}</td>
<td class="mono">${escapeHtml(r.datum_vrijeme)}</td>
<td><a href="/admin/racun/${r.id}/pdf" target="_blank">PDF</a></td></tr>`,
    )
    .join('');
  return layout(
    'DOMOVINA Fiskal — računi',
    `<h1>Dokumenti</h1>
<table><thead><tr><th>Tenant</th><th>Broj</th><th>Tip</th><th>Status</th><th>Iznos</th><th>Izdan</th><th></th></tr></thead>
<tbody>${redovi || '<tr><td colspan="7" class="prazno">Još nema dokumenata.</td></tr>'}</tbody></table>`,
  );
}
