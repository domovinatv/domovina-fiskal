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
  NaplatniUredajRow,
  OperaterRow,
  PoslovniProstorRow,
  RacunRow,
  TenantRow,
} from '../types';
import { escapeHtml } from '../util';

// Verzija aplikacije — BUMPAJ prije svakog redeploya; podudaraj s package.json.
export const APP_VERSION = 'v0.1.0';

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
  racuni: RacunRow[];
  noviKljuc?: { rawKey: string; opis: string | null };
  greska?: string;
}

export function renderTenantDetaljPage(d: TenantDetaljData): string {
  const t = d.tenant;
  const baza = `/admin/tenant/${t.id}`;

  const prostoriRedovi = d.prostori
    .map(
      (p) => `<tr><td class="mono">${escapeHtml(p.oznaka)}</td><td>${escapeHtml(p.adr_ulica ?? '')} ${escapeHtml(p.adr_naselje ?? '')}</td>
<td class="mono">${escapeHtml(p.datum_pocetka_primjene)}</td><td>${pillStatus(p.cis_status)}</td></tr>`,
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
<td class="mono">${escapeHtml(cert.enc_alg)}</td><td>${cert.aktivan ? pillStatus('aktivan') : pillStatus('zamijenjen')}</td>
<td class="mono">${escapeHtml(cert.created_at)}</td></tr>`,
    )
    .join('');

  const racuniRedovi = d.racuni
    .map(
      (r) => `<tr><td class="mono">${escapeHtml(r.broj_racuna_full)}</td><td>${escapeHtml(r.tip_dokumenta)}</td>
<td>${pillStatus(r.status)}</td><td class="mono">${escapeHtml(r.iznos_s_pdv ?? '')} ${escapeHtml(r.valuta)}</td>
<td class="mono">${escapeHtml(r.datum_vrijeme)}</td></tr>`,
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
<table><thead><tr><th>Oznaka</th><th>Adresa</th><th>Primjena od</th><th>CIS status</th></tr></thead>
<tbody>${prostoriRedovi || '<tr><td colspan="4" class="prazno">Nema prostora.</td></tr>'}</tbody></table>

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

<h2>Certifikati (fiskalizacija)</h2>
<div class="box"><form method="post" action="${baza}/certifikati" enctype="multipart/form-data">
  <div class="field"><label>P12/PFX datoteka *</label><input name="p12" type="file" required accept=".p12,.pfx"></div>
  <div class="field"><label>Okolina</label>
    <select name="okolina"><option value="test">test</option><option value="prod">prod</option></select></div>
  <button type="submit">Učitaj (enkriptira se at-rest)</button>
</form>
<p style="margin:.6rem 0 0;font-size:.8rem;color:var(--muted)">Sprema se AES-256-GCM enkriptirano (envelope: per-cert DEK + KEK iz Worker Secreta). Koristi se tek od faze 2 (ZKI/CIS).</p></div>
<table><thead><tr><th>Okolina</th><th>Otisak (SHA-256)</th><th>Enkripcija</th><th>Status</th><th>Učitan</th></tr></thead>
<tbody>${certifikatiRedovi || '<tr><td colspan="5" class="prazno">Nema certifikata.</td></tr>'}</tbody></table>

<h2>Zadnji računi</h2>
<table><thead><tr><th>Broj</th><th>Tip</th><th>Status</th><th>Iznos</th><th>Izdan</th></tr></thead>
<tbody>${racuniRedovi || '<tr><td colspan="5" class="prazno">Nema računa.</td></tr>'}</tbody></table>`,
  );
}

// ───────────────────────── Računi (globalni popis) ─────────────────────────

export function renderRacuniPage(racuni: (RacunRow & { tenant_naziv?: string })[]): string {
  const redovi = racuni
    .map(
      (r) => `<tr><td>${escapeHtml(r.tenant_naziv ?? r.tenant_id)}</td><td class="mono">${escapeHtml(r.broj_racuna_full)}</td>
<td>${escapeHtml(r.tip_dokumenta)}</td><td>${pillStatus(r.status)}</td>
<td class="mono">${escapeHtml(r.iznos_s_pdv ?? '')} ${escapeHtml(r.valuta)}</td>
<td class="mono">${escapeHtml(r.datum_vrijeme)}</td></tr>`,
    )
    .join('');
  return layout(
    'DOMOVINA Fiskal — računi',
    `<h1>Računi</h1>
<table><thead><tr><th>Tenant</th><th>Broj</th><th>Tip</th><th>Status</th><th>Iznos</th><th>Izdan</th></tr></thead>
<tbody>${redovi || '<tr><td colspan="6" class="prazno">Još nema računa.</td></tr>'}</tbody></table>`,
  );
}
