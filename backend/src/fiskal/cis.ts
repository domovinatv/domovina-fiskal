// SOAP transport prema CIS-u + parsiranje odgovora.
//
// Endpointi (99-gap-analiza R1 ✅ — port 8449; ':8509' iz 05-* je OBOREN):
//   TEST  https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest
//   PROD  https://cis.porezna-uprava.hr:8449/FiskalizacijaService
//
// Transport (empirijski nalazi, faza 2):
//   * Workers fetch() ne dopušta port 8449 (nije na Cloudflare listi portova).
//   * workerd connect()/node:tls s `secureTransport:'on'` ODBIJA CIS-ov
//     poslužiteljski certifikat — izdaje ga Fina (Demo CA 2020 / RDC 2020),
//     privatni CA koji nije u javnim trust storeovima, bez opcije vlastitog CA.
//   → Rješenje bez sidecara: sirovi TCP (`cloudflare:sockets`, secureTransport
//     'off') + TLS 1.3 u JS-u (subtls) s Fina CA-om kao trust anchorom, pa
//     ručni HTTP/1.1. CIS TEST i PROD podržavaju TLS 1.3 + AES_128_GCM + P-256
//     (provjereno openssl-om 2026-07-05).
//   * Spec. v2.6 opisuje 1-way TLS — autentikacija obveznika je XML-DSIG potpis
//     u poruci (02-* §7.3); klijentski transportni certifikat se NE šalje.

import { connect } from 'cloudflare:sockets';
import { LazyReadFunctionReadQueue, startTls, TrustedCert } from 'subtls';
import finaDemoCa2020 from './ca/fina-demo-ca-2020.pem';
import finaRdcCa2020 from './ca/fina-rdc-ca-2020.pem';

export type Okolina = 'test' | 'prod';
export type CisOperacija = 'racuni' | 'echo' | 'provjera';

// CIS poslužiteljski certifikat potpisuje Fina sub-CA (test: Demo CA 2020,
// prod: RDC 2020) — bundlani PEM-ovi su trust anchori za subtls verifikaciju.
// ⚠️ Kod zamjene CIS certifikata (periodično, v. PU obavijest 8137) provjeriti
// da je izdavatelj i dalje isti sub-CA; inače ažurirati PEM u src/fiskal/ca/.
const ENDPOINTI: Record<Okolina, { host: string; port: number; putanja: string; caPem: string }> = {
  test: { host: 'cistest.apis-it.hr', port: 8449, putanja: '/FiskalizacijaServiceTest', caPem: finaDemoCa2020 },
  prod: { host: 'cis.porezna-uprava.hr', port: 8449, putanja: '/FiskalizacijaService', caPem: finaRdcCa2020 },
};

const SOAP_ACTION_BAZA = 'http://e-porezna.porezna-uprava.hr/fiskalizacija/2012/services/FiskalizacijaService/';

const TIMEOUT_MS = 15_000; // CIS cilja odgovor < 2 s; velikodušna margina za TEST okolinu

export interface CisHttpOdgovor {
  status: number;
  tijelo: string;
}

// Ručni HTTPS POST: TCP socket + subtls (TLS 1.3, Fina CA anchor) + HTTP/1.1.
export async function soapPoziv(okolina: Okolina, operacija: CisOperacija, envelopa: string): Promise<CisHttpOdgovor> {
  const e = ENDPOINTI[okolina];
  const tijelo = new TextEncoder().encode(envelopa);
  const zahtjev =
    `POST ${e.putanja} HTTP/1.1\r\n` +
    `Host: ${e.host}:${e.port}\r\n` +
    `Content-Type: text/xml; charset=UTF-8\r\n` +
    `SOAPAction: "${SOAP_ACTION_BAZA}${operacija}"\r\n` +
    `Content-Length: ${tijelo.byteLength}\r\n` +
    `Connection: close\r\n\r\n`;

  const socket = connect({ hostname: e.host, port: e.port }, { secureTransport: 'off', allowHalfOpen: false });
  const timer = setTimeout(() => {
    socket.close().catch(() => {});
  }, TIMEOUT_MS);

  try {
    const pisac = socket.writable.getWriter();
    const citac = socket.readable.getReader();

    // TCP bajtovi → red za subtls. VAŽNO: proslijedi i readMode (PEEK) —
    // gutanje drugog argumenta pomiče stream za bajt i ruši handshake.
    const red = new LazyReadFunctionReadQueue(async () => {
      const { done, value } = await citac.read();
      return done ? undefined : value;
    });
    const trustStore = await TrustedCert.databaseFromPEM(e.caPem);
    const tls = await startTls(
      e.host,
      trustStore,
      red.read.bind(red) as (bytes: number) => Promise<Uint8Array | undefined>,
      (podaci) => {
        void pisac.write(podaci);
      },
      { useSNI: true },
    );

    await tls.write(new TextEncoder().encode(zahtjev));
    await tls.write(tijelo);

    // Čitaj do kraja TLS streama (Connection: close).
    const komadi: Uint8Array[] = [];
    let ukupno = 0;
    for (;;) {
      const dio = await tls.read();
      if (!dio) break;
      komadi.push(dio);
      ukupno += dio.byteLength;
      if (ukupno > 4 * 1024 * 1024) throw new Error('CIS odgovor prevelik (>4 MB)');
    }
    const sirovo = new Uint8Array(ukupno);
    let pomak = 0;
    for (const k of komadi) {
      sirovo.set(k, pomak);
      pomak += k.byteLength;
    }
    return parsirajHttp(sirovo);
  } finally {
    clearTimeout(timer);
    socket.close().catch(() => {});
  }
}

function parsirajHttp(sirovo: Uint8Array): CisHttpOdgovor {
  // Granica zaglavlja: \r\n\r\n (tražimo u bajtovima da ne kvarimo UTF-8 tijelo).
  let granica = -1;
  for (let i = 0; i + 3 < sirovo.length; i++) {
    if (sirovo[i] === 13 && sirovo[i + 1] === 10 && sirovo[i + 2] === 13 && sirovo[i + 3] === 10) {
      granica = i;
      break;
    }
  }
  if (granica < 0) throw new Error('CIS: neispravan HTTP odgovor (nema kraja zaglavlja)');

  const zaglavljeTekst = new TextDecoder('latin1').decode(sirovo.subarray(0, granica));
  const [statusnaLinija, ...linije] = zaglavljeTekst.split('\r\n');
  const status = Number(statusnaLinija.match(/^HTTP\/1\.\d (\d{3})/)?.[1] ?? 0);
  if (!status) throw new Error(`CIS: neispravna statusna linija '${statusnaLinija.slice(0, 80)}'`);

  const zaglavlja = new Map<string, string>();
  for (const l of linije) {
    const dvotocka = l.indexOf(':');
    if (dvotocka > 0) zaglavlja.set(l.slice(0, dvotocka).trim().toLowerCase(), l.slice(dvotocka + 1).trim());
  }

  let tijeloBajtovi = sirovo.subarray(granica + 4);
  if ((zaglavlja.get('transfer-encoding') ?? '').toLowerCase().includes('chunked')) {
    tijeloBajtovi = dechunk(tijeloBajtovi);
  } else {
    const cl = Number(zaglavlja.get('content-length') ?? NaN);
    if (Number.isFinite(cl)) tijeloBajtovi = tijeloBajtovi.subarray(0, cl);
  }
  return { status, tijelo: new TextDecoder('utf-8').decode(tijeloBajtovi) };
}

function dechunk(b: Uint8Array): Uint8Array {
  const dijelovi: Uint8Array[] = [];
  let i = 0;
  for (;;) {
    // linija s veličinom chunka (hex) do \r\n
    let kraj = i;
    while (kraj + 1 < b.length && !(b[kraj] === 13 && b[kraj + 1] === 10)) kraj++;
    const velicina = parseInt(new TextDecoder('latin1').decode(b.subarray(i, kraj)).split(';')[0].trim(), 16);
    if (!Number.isFinite(velicina)) throw new Error('CIS: neispravan chunked odgovor');
    i = kraj + 2;
    if (velicina === 0) break;
    dijelovi.push(b.subarray(i, i + velicina));
    i += velicina + 2; // + \r\n iza chunka
  }
  const ukupno = dijelovi.reduce((n, d) => n + d.byteLength, 0);
  const spojeno = new Uint8Array(ukupno);
  let pomak = 0;
  for (const d of dijelovi) {
    spojeno.set(d, pomak);
    pomak += d.byteLength;
  }
  return spojeno;
}

// ── Parsiranje CIS XML odgovora (RacunOdgovor / ProvjeraOdgovor / Echo / Fault) ──

export interface CisGreska {
  sifra: string;  // 's001'…'s013', restriktivne 'NNN', provjera 'v1xx', ili 'transport'/'fault'
  poruka: string;
}

export interface ParsiraniOdgovor {
  jir: string | null;
  greske: CisGreska[];
  echoTekst: string | null;
}

export function parsirajOdgovor(xml: string): ParsiraniOdgovor {
  const jir = xml.match(/<(?:[\w.-]+:)?Jir[^>]*>([^<]+)<\//)?.[1]?.trim() ?? null;

  const greske: CisGreska[] = [];
  const greskaRe = /<(?:[\w.-]+:)?Greska>([\s\S]*?)<\/(?:[\w.-]+:)?Greska>/g;
  for (let m = greskaRe.exec(xml); m; m = greskaRe.exec(xml)) {
    const sifra = m[1].match(/<(?:[\w.-]+:)?SifraGreske[^>]*>([^<]*)<\//)?.[1]?.trim() ?? '?';
    const poruka = odXmlEntiteta(m[1].match(/<(?:[\w.-]+:)?PorukaGreske[^>]*>([\s\S]*?)<\//)?.[1]?.trim() ?? '');
    greske.push({ sifra, poruka });
  }

  const fault = xml.match(/<(?:[\w.-]+:)?faultstring[^>]*>([\s\S]*?)<\//i)?.[1]?.trim();
  if (fault && !greske.length && !jir) greske.push({ sifra: 'fault', poruka: odXmlEntiteta(fault) });

  const echoTekst = xml.match(/<(?:[\w.-]+:)?EchoResponse[^>]*>([\s\S]*?)<\//)?.[1] ?? null;

  return { jir, greske, echoTekst: echoTekst != null ? odXmlEntiteta(echoTekst) : null };
}

function odXmlEntiteta(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/gi, '\r')
    .replace(/&amp;/g, '&');
}

// Je li grešku smisleno automatski ponoviti (naknadna dostava)?
// s006 = sistemska pogreška CIS-a; 'transport'/'fault'/HTTP = mrežno-infrastrukturno.
// s001–s005 i s013 su greške u poruci/certifikatu — retry bez izmjene nema smisla.
export function greskaJeRetryable(sifra: string): boolean {
  return sifra === 's006' || sifra === 'transport' || sifra === 'fault' || sifra === 'http';
}
