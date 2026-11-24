// /admin/korisnici — korisnici customer dashboarda, pozivnice i trag radnji (docs/passkey/, S3).
// Izdvojeno iz views.ts; isti layout i stilovi.
import type { AktivnostRow } from '../app-auth/aktivnost';
import type { SlanjePozivnice } from '../app-auth/pozivnica-email';
import type { OtvorenaPozivnica } from '../app-auth/pozivnice';
import type { TenantRow } from '../types';
import { escapeHtml } from '../util';
import { layout } from './views';

export interface KorisnikPrikaz {
  id: number; email: string; ime: string | null; aktivan: boolean; createdAt: string;
  passkeyi: number; zadnjaUpotreba: string | null; sesije: number;
  clanstva: { id: number; tenantId: number; naziv: string; uloga: string; aktivan: boolean }[];
}

export interface NoviLink { url: string; email: string; istjece: string; vrsta: 'tenant' | 'novi_passkey'; slanje: SlanjePozivnice; ponovno?: boolean }

const ULOGE: [string, string][] = [['vlasnik', 'vlasnik'], ['knjigovodja', 'knjigovođa'], ['operater', 'operater (bez postavki)']];
const pill = (ok: boolean, tekst: string) => `<span class="pill ${ok ? 'p-ok' : 'p-off'}">${escapeHtml(tekst)}</span>`;
const vrijeme = (s: string | null) => (s ? escapeHtml(s.slice(0, 16).replace('T', ' ')) : '—');

/** Obrazac nove pozivnice (koristi i detalj tenanta, s unaprijed odabranim tenantom). */
export function obrazacPozivnice(tenanti: Pick<TenantRow, 'id' | 'naziv' | 'oib'>[], tenantId?: number): string {
  const opcije = tenanti
    .map((t) => `<option value="${t.id}"${t.id === tenantId ? ' selected' : ''}>${escapeHtml(t.naziv)} (${escapeHtml(t.oib)})</option>`)
    .join('');
  return `<form method="post" action="/admin/korisnici/pozivnica">
  <div class="field"><label>E-mail *</label><input name="email" type="email" required placeholder="korisnik@primjer.hr"></div>
  <div class="field"><label>Ime</label><input name="ime" maxlength="80"></div>
  <div class="field"><label>Tenant *</label><select name="tenant_id" required>${tenantId == null ? '<option value="">— odaberi —</option>' : ''}${opcije}</select></div>
  <div class="field"><label>Uloga</label><select name="uloga">${ULOGE.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
  <button type="submit">Pošalji pozivnicu</button>
</form>
<p style="margin:.6rem 0 0;font-size:.8rem;color:var(--muted)">Pozivnica odmah ide e-mailom (pošiljateljem tenanta ako ga ima, inače s racuni@domovina.ai). Link vrijedi 72 h i jednom; troši se tek kad pozvani upiše passkey. Nova pozivnica za isti e-mail i tenant poništava staru.</p>`;
}

/** Tablica otvorenih pozivnica; `povratak` je stranica na koju se vraća nakon opoziva. */
export function tablicaPozivnica(pozivnice: OtvorenaPozivnica[], naziv: (tenantId: number | null) => string, povratak?: string): string {
  const redovi = pozivnice
    .map((p) => `<tr><td>${escapeHtml(p.email)}${p.ime ? ` <span style="color:var(--muted)">(${escapeHtml(p.ime)})</span>` : ''}</td>
<td>${p.korisnik_id ? '<span class="pill p-info">novi passkey</span>' : `${escapeHtml(naziv(p.tenant_id))} · ${escapeHtml(p.uloga ?? '')}`}</td>
<td>${escapeHtml(p.stvorio_tip)}: ${escapeHtml(p.stvorio)}</td><td class="mono">${vrijeme(p.istjece)}</td>
<td><form method="post" action="/admin/korisnici/pozivnica/${p.id}/posalji-ponovno" style="display:inline" title="Nova pozivnica istih podataka ide mailom; stari link prestaje vrijediti.">
  <button type="submit" style="background:#5A6570">Pošalji ponovno</button></form>
<form method="post" action="/admin/korisnici/pozivnica/${p.id}/opozovi" style="display:inline">${povratak ? `<input type="hidden" name="povratak" value="${escapeHtml(povratak)}">` : ''}
  <button type="submit">Opozovi</button></form></td></tr>`)
    .join('');
  return `<table><thead><tr><th>E-mail</th><th>Za</th><th>Izdao</th><th>Istječe</th><th></th></tr></thead>
<tbody>${redovi || '<tr><td colspan="5" class="prazno">Nema otvorenih pozivnica.</td></tr>'}</tbody></table>`;
}

const OPIS_RADNJE: Record<string, string> = {
  'poziv.izdan': 'pozivnica izdana', 'poziv.opozvan': 'pozivnica opozvana',
  'korisnik.deaktiviran': 'korisnik deaktiviran', 'korisnik.aktiviran': 'korisnik aktiviran',
  'clanstvo.deaktivirano': 'članstvo deaktivirano', 'clanstvo.aktivirano': 'članstvo aktivirano',
};

export function tablicaAktivnosti(aktivnost: AktivnostRow[], naziv: (tenantId: number | null) => string): string {
  const redovi = aktivnost
    .map((a) => `<tr><td class="mono">${vrijeme(a.at)}</td><td>${escapeHtml(a.tko_tip)}: ${escapeHtml(a.tko)}</td>
<td>${escapeHtml(OPIS_RADNJE[a.radnja] ?? a.radnja)}</td><td>${escapeHtml(a.email ?? '—')}</td>
<td>${a.tenant_id != null ? escapeHtml(naziv(a.tenant_id)) : '—'}</td><td class="mono" style="font-size:.72rem">${escapeHtml(a.detalji ?? '')}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Kada (UTC)</th><th>Tko</th><th>Radnja</th><th>Na koga</th><th>Tenant</th><th>Detalji</th></tr></thead>
<tbody>${redovi || '<tr><td colspan="6" class="prazno">Nema zapisa.</td></tr>'}</tbody></table>`;
}

export function renderKorisniciPage(d: {
  korisnici: KorisnikPrikaz[];
  pozivnice: OtvorenaPozivnica[];
  tenanti: TenantRow[];
  aktivnost: AktivnostRow[];
  link?: NoviLink;
  greska?: string;
  tenantId?: number;
}): string {
  const nazivi = new Map(d.tenanti.map((t) => [t.id, t.naziv]));
  const naziv = (id: number | null) => (id == null ? '—' : nazivi.get(id) ?? `#${id}`);

  const korisniciRedovi = d.korisnici
    .map((k) => {
      const clanstva = k.clanstva
        .map((c) => `<a href="/admin/tenant/${c.tenantId}">${escapeHtml(c.naziv)}</a> · ${escapeHtml(c.uloga)}${c.aktivan ? '' : ' <span class="pill p-off">neaktivno</span>'}`)
        .join('<br>');
      const akcije = `${k.aktivan ? `<form method="post" action="/admin/korisnici/${k.id}/novi-passkey" style="display:inline"><button type="submit">Novi passkey</button></form> ` : ''}
<form method="post" action="/admin/korisnici/${k.id}/${k.aktivan ? 'deaktiviraj' : 'aktiviraj'}" style="display:inline"><button type="submit">${k.aktivan ? 'Deaktiviraj' : 'Aktiviraj'}</button></form>`;
      return `<tr><td>${escapeHtml(k.email)}${k.ime ? `<br><span style="color:var(--muted)">${escapeHtml(k.ime)}</span>` : ''}</td>
<td>${clanstva || '<span class="prazno">nema tenanta</span>'}</td>
<td>${k.passkeyi}</td><td class="mono">${vrijeme(k.zadnjaUpotreba)}</td><td>${k.sesije}</td>
<td>${pill(k.aktivan, k.aktivan ? 'aktivan' : 'deaktiviran')}</td><td>${akcije}</td></tr>`;
    })
    .join('');

  const link = d.link
    ? `<div class="flash">${d.link.vrsta === 'novi_passkey' ? 'Pozivnica za novi passkey' : 'Pozivnica'}${d.link.ponovno ? ' (ponovno, stari link više ne vrijedi)' : ''} za <strong>${escapeHtml(d.link.email)}</strong>
 (vrijedi do ${vrijeme(d.link.istjece)} UTC) — ${d.link.slanje.poslano
    ? `<strong>poslana e-mailom</strong> (${escapeHtml(d.link.slanje.kanal ?? '')}). Link za svaki slučaj, prikazuje se samo jednom:`
    : `<strong style="color:#A32020">e-mail NIJE poslan</strong> (${escapeHtml(d.link.slanje.greska ?? '')}). Kopiraj link i pošalji ga sam, prikazuje se samo jednom:`}<br>
<input class="kljuc mono" readonly value="${escapeHtml(d.link.url)}" style="width:100%"></div>`
    : '';

  return layout(
    'DOMOVINA Fiskal — korisnici dashboarda',
    `${d.greska ? `<div class="greska">${escapeHtml(d.greska)}</div>` : ''}
${link}
<h1>Korisnici dashboarda</h1>
<p style="color:var(--muted)">Ulaz u dashboard je samo pozivnicom (passkey). Deaktivacija odmah briše sesije i opoziva otvorene pozivnice; passkeyi ostaju, pa „Aktiviraj” vraća pristup bez nove pozivnice. „Novi passkey” je pozivnica za isti račun (izgubljen ili novi uređaj); stari ključevi ostaju.</p>

<h2>Nova pozivnica</h2>
<div class="box">${obrazacPozivnice(d.tenanti, d.tenantId)}</div>

<h2>Otvorene pozivnice</h2>
${tablicaPozivnica(d.pozivnice, naziv)}

<h2>Korisnici</h2>
<table><thead><tr><th>E-mail</th><th>Tenanti i uloge</th><th>Passkeyi</th><th>Zadnja prijava</th><th>Sesije</th><th>Status</th><th></th></tr></thead>
<tbody>${korisniciRedovi || '<tr><td colspan="7" class="prazno">Nema korisnika — izdaj prvu pozivnicu.</td></tr>'}</tbody></table>

<h2>Trag radnji (zadnjih 50)</h2>
${tablicaAktivnosti(d.aktivnost, naziv)}`,
  );
}
