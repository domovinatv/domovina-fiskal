// Slanje dokumenta (PDF privitak) e-mailom — Cloudflare Email Service binding.
// Preduvjeti: domena onboardana (`wrangler email sending enable domovina.ai`,
// SPF/DKIM/DMARC postavlja Cloudflare) i `send_email` binding u wrangler.toml.
// Bez bindinga endpoint vraća 503 s jasnom porukom (safe default).

import type { RacunKontekst } from './db';
import { iznosHr } from './pdf/racun-pdf';
import { escapeHtml } from './util';

// Privitci ≤ 6 MB (Fira paritet; CF limit je 25 MiB — držimo se konzervativnijeg).
export const MAX_PRIVITAK_BAJTOVA = 6 * 1024 * 1024;

export const EMAIL_POSILJATELJ = { email: 'racuni@domovina.ai', name: 'Domovina Fiskal' };

const NASLOVI: Record<string, string> = {
  ponuda: 'Ponuda',
  predracun: 'Predračun',
  racun: 'Račun',
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

export async function posaljiRacunEmailom(
  email: SendEmailBinding,
  k: RacunKontekst,
  pdf: Uint8Array,
  na: string,
  replyTo?: string | null,
): Promise<void> {
  if (pdf.byteLength > MAX_PRIVITAK_BAJTOVA) {
    throw new Error(`PDF privitak je prevelik (${Math.round(pdf.byteLength / 1024)} KB > 6 MB)`);
  }
  const naslov = NASLOVI[k.racun.tip_dokumenta] ?? 'Dokument';
  const broj = k.racun.broj_racuna_full ?? '(skica)';
  const iznos = `${iznosHr(k.racun.dospijeva_za_placanje)} ${k.racun.valuta}`;
  const subject = `${naslov} ${broj} — ${k.tenant.naziv}`;

  const text = [
    `Poštovani,`,
    ``,
    `u privitku se nalazi ${naslov.toLowerCase()} ${broj} na iznos ${iznos}.`,
    ...(k.tenant.iban ? [``, `Podaci za plaćanje: IBAN ${k.tenant.iban}, model i poziv na broj ${k.racun.model_placanja ?? 'HR00'} ${k.racun.poziv_na_broj ?? ''}.`] : []),
    ``,
    `S poštovanjem,`,
    `${k.tenant.naziv}`,
    `OIB: ${k.tenant.oib}`,
  ].join('\n');

  const html = `<p>Poštovani,</p>
<p>u privitku se nalazi <strong>${escapeHtml(naslov.toLowerCase())} ${escapeHtml(broj)}</strong> na iznos <strong>${escapeHtml(iznos)}</strong>.</p>
${k.tenant.iban ? `<p>Podaci za plaćanje: IBAN <code>${escapeHtml(k.tenant.iban)}</code>, model i poziv na broj <code>${escapeHtml(k.racun.model_placanja ?? 'HR00')} ${escapeHtml(k.racun.poziv_na_broj ?? '')}</code>.</p>` : ''}
<p>S poštovanjem,<br>${escapeHtml(k.tenant.naziv)}<br>OIB: ${escapeHtml(k.tenant.oib)}</p>`;

  // Kopija bajtova u samostalni ArrayBuffer (binding ne prima SharedArrayBuffer/view offset).
  const privitak = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

  await email.send({
    to: na,
    from: EMAIL_POSILJATELJ,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html,
    text,
    attachments: [
      {
        content: privitak,
        filename: `${naslov.toLowerCase()}-${(k.racun.broj_racuna_full ?? 'skica').replace(/\//g, '-')}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ],
  });
}
