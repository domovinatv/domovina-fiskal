// Slanje pozivnice u dashboard e-mailom (revizija odluke 7, docs/passkey/decisions.md).
// Pozivnica za tenant ide pošiljateljem tenanta ako ga ima (vlastiti Resend, src/email-tenant.ts),
// inače i na grešku s racuni@domovina.ai; „novi passkey” uvijek kanalom platforme.
// Link je goli tekst, bez <a>: Resend s uključenim praćenjem klikova (domena tenanta) prepisuje
// svaki href u svoj redirect, a time bi token iz fragmenta završio u putanji i njihovim logovima
// (viđeno 25. 11. 2026. na links.susret.com.hr). Gmail i ostali klijenti tekst sami pretvore u link.
// Slanje nikad ne ruši izdavanje: na grešku pozivnica ostaje, a link se vraća onome tko je
// izdaje, pa ga može poslati sam.
import { posaljiSKanalima, type Kanal } from '../email';
import { posaljiPorukuTenanta } from '../email-tenant';
import type { Env } from '../types';
import { escapeHtml } from '../util';
import type { StvorioTip, Uloga } from './pozivnice';

export interface SlanjePozivnice {
  poslano: boolean;
  kanal: Kanal | null;
  greska: string | null;
}

const ULOGE: Record<Uloga, string> = { vlasnik: 'vlasnik', knjigovodja: 'knjigovođa', operater: 'operater' };

/** Rok pozivnice za čovjeka: zagrebačko vrijeme. */
export function rokHr(iso: string): string {
  return new Date(iso).toLocaleString('hr-HR', { timeZone: 'Europe/Zagreb', dateStyle: 'long', timeStyle: 'short' });
}

export async function posaljiPozivnicu(
  env: Env,
  p: {
    email: string;
    ime: string | null;
    link: string;
    istjece: string;
    tenantId: number | null;
    uloga: Uloga | null;
    stvorio: { email: string; tip: StvorioTip };
  },
): Promise<SlanjePozivnice> {
  try {
    const tenant = p.tenantId != null
      ? await env.DB.prepare('SELECT id, naziv FROM tenant WHERE id = ?').bind(p.tenantId).first<{ id: number; naziv: string }>()
      : null;
    const rok = rokHr(p.istjece);
    const pozdrav = p.ime ? `Poštovani/a ${p.ime},` : 'Poštovani/a,';
    const zaSto = tenant
      ? `pozvani ste u Domovina Fiskal za ${tenant.naziv}${p.uloga ? ` (uloga: ${ULOGE[p.uloga]})` : ''}.`
      : 'poslan vam je link za dodavanje novog pristupnog ključa (passkey) u Domovina Fiskal.';
    const subject = tenant ? `Pozivnica u Domovina Fiskal — ${tenant.naziv}` : 'Novi pristupni ključ za Domovina Fiskal';
    const text = [
      pozdrav,
      '',
      zaSto,
      '',
      'Otvorite link i upišite pristupni ključ (passkey) na svom uređaju; ako ga za ovaj račun već imate, prijavite se njime:',
      p.link,
      '',
      `Link vrijedi do ${rok} i može se iskoristiti samo jednom. Ne prosljeđujte ga.`,
      'Ako pozivnicu niste očekivali, zanemarite ovu poruku.',
      '',
      tenant ? tenant.naziv : 'Domovina Fiskal',
    ].join('\n');
    const html = `<p>${escapeHtml(pozdrav)}</p>
<p>${escapeHtml(zaSto)}</p>
<p>Otvorite link i upišite pristupni ključ (passkey) na svom uređaju; ako ga za ovaj račun već imate, prijavite se njime:</p>
<p style="font-family:ui-monospace,monospace;word-break:break-all">${escapeHtml(p.link)}</p>
<p style="font-size:13px;color:#555">Link vrijedi do ${escapeHtml(rok)} i može se iskoristiti samo jednom. Ne prosljeđujte ga. Ako pozivnicu niste očekivali, zanemarite ovu poruku.</p>
<p>${escapeHtml(tenant ? tenant.naziv : 'Domovina Fiskal')}</p>`;
    // Odgovor ide vlasniku koji je pozvao; adminov e-mail se ne otkriva (Reply-To tenanta ili ništa).
    const poruka = { na: p.email, replyTo: p.stvorio.tip === 'vlasnik' ? p.stvorio.email : null, subject, html, text };
    const r = tenant ? await posaljiPorukuTenanta(env, tenant, poruka) : await posaljiSKanalima(env, poruka);
    return { poslano: true, kanal: r.kanal, greska: null };
  } catch (e) {
    const greska = (e as Error).message;
    console.log(`Pozivnica (tenant ${p.tenantId ?? "—"}) nije poslana: ${greska}`);
    return { poslano: false, kanal: null, greska };
  }
}
