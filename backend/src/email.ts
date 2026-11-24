// Slanje dokumenta (PDF privitak) e-mailom — dva kanala:
//   1. Cloudflare Email Service `send_email` binding (preferiran kad je Email
//      Sending aktiviran za domovina.ai — Workers Paid + beta aktivacija),
//   2. Resend REST API (RESEND_API_KEY secret) — aktivni kanal dok CF nije
//      aktiviran; domena domovina.ai je već verificirana na Resendu.
// Redoslijed: pokušaj binding → na grešku/nedostupnost padni na Resend.
// Tenant može imati VLASTITI Resend ključ i pošiljatelja (src/email-tenant.ts):
// tada se prvo šalje njime, a na grešku zadanim kanalima platforme.
// Bez ijednog kanala endpoint vraća 503 s jasnom porukom (safe default).

import type { RacunKontekst } from './db';
import { iznosHr, stornoOpis, trebaNalogZaPlacanje } from './pdf/racun-pdf';
import { escapeHtml, fetchSTimeoutom, TIMEOUT_MS } from './util';

// Privitci ≤ 4 MB: Cloudflare Email Sending limitira CIJELU poruku na 5 MB za
// proizvoljne primatelje (25 MB samo za verificirane adrese) — ostavljamo
// prostor za MIME overhead i tijelo. (Fira dopušta 6 MB, mi smo konzervativniji.)
export const MAX_PRIVITAK_BAJTOVA = 4 * 1024 * 1024;

export const EMAIL_POSILJATELJ = { email: 'racuni@domovina.ai', name: 'Domovina Fiskal' };

const NASLOVI: Record<string, string> = {
  ponuda: 'Ponuda',
  predracun: 'Predračun',
  racun: 'Račun',
  fiskalni_b2c: 'Račun',
  eracun_b2b: 'Račun',
  eracun_b2g: 'Račun',
};

export interface SendEmailBinding {
  send(poruka: {
    to: string;
    from: { email: string; name: string };
    replyTo?: string;
    subject: string;
    html: string;
    text: string;
    attachments?: { content: ArrayBuffer; filename: string; type: string; disposition: 'attachment' }[];
  }): Promise<{ messageId?: string }>;
}

export interface EmailKanali {
  EMAIL?: SendEmailBinding;
  RESEND_API_KEY?: string;
}

// Vlastiti kanal tenanta: njegov Resend ključ i adresa na njegovoj domeni.
export interface TenantKanal {
  apiKey: string;
  from: { email: string; name: string };
  replyTo?: string | null; // izričit Reply-To tenanta (ima prednost pred tenant.email)
}

export type Kanal = 'cloudflare' | 'resend' | 'resend-tenant';

export interface RezultatSlanja {
  kanal: Kanal;
  // Poruka greške tenantovog kanala kad se palo na zadani (null = nije ni pokušan ili je uspio).
  tenantGreska: string | null;
}

export function emailKonfiguriran(env: EmailKanali): boolean {
  return !!env.EMAIL || !!env.RESEND_API_KEY;
}

// Fiskalni račun bez JIR-a (CIS nije odgovorio ili je javio grešku) ne šalje se
// kupcu bez izričitog izbora: zakon dopušta uručenje sa ZKI-jem kad CIS ne radi,
// ali mail ne smije otići usput, prije nego što fiskalizacija uspije (incident
// 23. 11. 2026., TEST račun 33 poslan dok je imao grešku s013).
// Vraća poruku greške ili null kad se smije slati.
export function blokadaSlanjaBezJir(k: RacunKontekst, bezJir: boolean): string | null {
  if (k.racun.tip_dokumenta !== 'fiskalni_b2c' || k.racun.jir || bezJir) return null;
  const greska = k.racun.fiskal_greska ? ` (zadnja greška CIS-a: ${k.racun.fiskal_greska})` : '';
  return `Fiskalni račun još nema JIR${greska} — pričekaj fiskalizaciju ili pošalji { "bezJir": true } ako ga svjesno uručuješ samo sa ZKI-jem`;
}

export async function posaljiRacunEmailom(
  env: EmailKanali,
  k: RacunKontekst,
  pdf: Uint8Array,
  na: string,
  replyTo?: string | null,
  tenantKanal?: TenantKanal | null,
): Promise<RezultatSlanja> {
  if (pdf.byteLength > MAX_PRIVITAK_BAJTOVA) {
    throw new Error(`PDF privitak je prevelik (${Math.round(pdf.byteLength / 1024)} KB > 4 MB)`);
  }
  const naslov = NASLOVI[k.racun.tip_dokumenta] ?? 'Dokument';
  const broj = k.racun.broj_racuna_full ?? '(skica)';
  const iznos = `${iznosHr(k.racun.dospijeva_za_placanje)} ${k.racun.valuta}`;
  const subject = `${naslov} ${broj} — ${k.tenant.naziv}`;
  const nalog = trebaNalogZaPlacanje(k); // isto pravilo kao barkodovi na PDF-u
  // Odgovor kupca ide tenantu (izdavatelju), ne na racuni@domovina.ai.
  // Redoslijed: izričit argument → Reply-To iz postavke pošiljatelja → kontakt
  // e-mail tenanta → adresa vlastitog pošiljatelja (važno i kad slanje padne na
  // racuni@domovina.ai). Odgovore ne obrađujemo — idu ravno tenantu.
  replyTo = replyTo ?? tenantKanal?.replyTo ?? k.tenant.email ?? tenantKanal?.from.email ?? null;

  const text = [
    `Poštovani,`,
    ``,
    `u privitku se nalazi ${naslov.toLowerCase()} ${broj} na iznos ${iznos}.`,
    ...(k.stornoOriginal ? [``, `${stornoOpis(k.stornoOriginal)}`] : []),
    ...(nalog ? [``, `Podaci za plaćanje: IBAN ${k.tenant.iban}, model i poziv na broj ${k.racun.model_placanja ?? 'HR00'} ${k.racun.poziv_na_broj ?? ''}.`] : []),
    ``,
    `S poštovanjem,`,
    `${k.tenant.naziv}`,
    `OIB: ${k.tenant.oib}`,
  ].join('\n');

  const html = `<p>Poštovani,</p>
<p>u privitku se nalazi <strong>${escapeHtml(naslov.toLowerCase())} ${escapeHtml(broj)}</strong> na iznos <strong>${escapeHtml(iznos)}</strong>.</p>
${k.stornoOriginal ? `<p><strong>${escapeHtml(stornoOpis(k.stornoOriginal))}</strong></p>` : ''}
${nalog ? `<p>Podaci za plaćanje: IBAN <code>${escapeHtml(k.tenant.iban)}</code>, model i poziv na broj <code>${escapeHtml(k.racun.model_placanja ?? 'HR00')} ${escapeHtml(k.racun.poziv_na_broj ?? '')}</code>.</p>` : ''}
<p>S poštovanjem,<br>${escapeHtml(k.tenant.naziv)}<br>OIB: ${escapeHtml(k.tenant.oib)}</p>`;

  const imeDatoteke = `${naslov.toLowerCase()}-${(k.racun.broj_racuna_full ?? 'skica').replace(/\//g, '-')}.pdf`;
  const poruka = { na, replyTo, subject, html, text, privitak: { pdf, imeDatoteke } };

  return posaljiSKanalima(env, poruka, tenantKanal, `tenanta ${k.tenant.id}`);
}

// Slanje vlastitim Resendom tenanta (ako ga ima), a na bilo koju grešku zadanim
// kanalima platforme. Zajedničko za račune i pozivnice u dashboard.
export async function posaljiSKanalima(
  env: EmailKanali,
  poruka: Poruka,
  tenantKanal?: TenantKanal | null,
  oznaka = 'tenanta',
): Promise<RezultatSlanja> {
  if (tenantKanal) {
    try {
      await posaljiResendom(tenantKanal.apiKey, tenantKanal.from, poruka);
      return { kanal: 'resend-tenant', tenantGreska: null };
    } catch (e) {
      const greska = (e as Error).message;
      console.log(`Resend ${oznaka} nije uspio (${greska}) — fallback na zadani kanal`);
      try {
        const r = await posaljiPoruku(env, poruka);
        return { kanal: r.kanal, tenantGreska: greska };
      } catch (e2) {
        throw new Error(`vlastiti Resend: ${greska}; zadani kanal: ${(e2 as Error).message}`);
      }
    }
  }
  const r = await posaljiPoruku(env, poruka);
  return { kanal: r.kanal, tenantGreska: null };
}

// Obavijest bez privitka (alarmi platforme/tenanta) — isti kanali kao računi.
export async function posaljiObavijest(
  env: EmailKanali,
  p: { na: string; subject: string; text: string },
): Promise<{ kanal: Kanal }> {
  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(p.text)}</pre>`;
  return posaljiPoruku(env, { ...p, html });
}

export interface Poruka {
  na: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  privitak?: { pdf: Uint8Array; imeDatoteke: string };
}

// Slanje kroz kanale: Cloudflare binding → (greška/nedostupnost) → Resend.
async function posaljiPoruku(env: EmailKanali, p: Poruka): Promise<{ kanal: 'cloudflare' | 'resend' }> {
  const { na, replyTo, subject, html, text, privitak } = p;

  // 1) Cloudflare binding (preferiran čim Email Sending bude aktiviran).
  if (env.EMAIL) {
    try {
      await env.EMAIL.send({
        to: na,
        from: EMAIL_POSILJATELJ,
        ...(replyTo ? { replyTo } : {}),
        subject,
        html,
        text,
        ...(privitak
          ? {
              attachments: [
                {
                  // Kopija u samostalni ArrayBuffer (binding ne prima view s offsetom).
                  content: privitak.pdf.buffer.slice(privitak.pdf.byteOffset, privitak.pdf.byteOffset + privitak.pdf.byteLength) as ArrayBuffer,
                  filename: privitak.imeDatoteke,
                  type: 'application/pdf',
                  disposition: 'attachment' as const,
                },
              ],
            }
          : {}),
      });
      return { kanal: 'cloudflare' };
    } catch (e) {
      // Email Sending još nije aktiviran (ili privremena greška) → probaj Resend.
      if (!env.RESEND_API_KEY) throw e;
      console.log(`EMAIL binding nije uspio (${(e as Error).message}) — fallback na Resend`);
    }
  }

  // 2) Resend REST API.
  if (!env.RESEND_API_KEY) {
    throw new Error('Nijedan email kanal nije konfiguriran (send_email binding ni RESEND_API_KEY)');
  }
  await posaljiResendom(env.RESEND_API_KEY, EMAIL_POSILJATELJ, p);
  return { kanal: 'resend' };
}

// Resend REST API — zajednički za ključ platforme i ključ tenanta.
async function posaljiResendom(apiKey: string, from: { email: string; name: string }, p: Poruka): Promise<void> {
  const { na, replyTo, subject, html, text, privitak } = p;
  const odgovor = await fetchSTimeoutom('Resend', 'https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${imeZaZaglavlje(from.name)} <${from.email}>`,
      to: [na],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
      ...(privitak ? { attachments: [{ filename: privitak.imeDatoteke, content: uBase64(privitak.pdf) }] } : {}),
    }),
  }, TIMEOUT_MS.resend);
  if (!odgovor.ok) {
    const tijelo = await odgovor.text().catch(() => '');
    throw new Error(`Resend ${odgovor.status}: ${tijelo.slice(0, 300)}`);
  }
}

// Ime u From zaglavlju: navodnici ako ima znakova koji bi ga razbili (zarez, točka…).
function imeZaZaglavlje(ime: string): string {
  const cisto = ime.replace(/["\\\r\n<>]/g, '').trim();
  return /^[\p{L}\p{N} ]+$/u.test(cisto) ? cisto : `"${cisto}"`;
}

function uBase64(bytes: Uint8Array): string {
  let bin = '';
  const KORAK = 0x8000; // izbjegni prekoračenje stoga kod String.fromCharCode(...veliki_niz)
  for (let i = 0; i < bytes.length; i += KORAK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + KORAK));
  }
  return btoa(bin);
}
