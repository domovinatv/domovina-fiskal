// Mirovina starog dashboarda na Cloudflare Pagesu (lanac passkey, S7, odluka 700).
//
// `fiskal-app.domovina.ai` i `fiskal-app-test.domovina.ai` bili su custom domene Pages
// projekata `domovina-fiskal-app(-test)`. Dashboard se od S5/S6 servira s fiskal Workera
// na `/app`, pa stare domene trajno (301) preusmjeravaju na novu adresu. Putanja se
// zadržava ispod `/app` (stari app nije imao basePath), upit također.
//
// Zaseban mali Worker (wrangler.preusmjeravanje.toml) s rutom na zoni, a ne grana u
// glavnom Workeru: glavni Worker ima static assets koji se za /app/* serviraju prije
// koda, pa bi stari host ondje dobio dashboard umjesto preusmjeravanja.

const ODREDISTA: Record<string, string> = {
  'fiskal-app.domovina.ai': 'https://fiskal.domovina.ai',
  'fiskal-app-test.domovina.ai': 'https://fiskal-test.domovina.ai',
};

const ZADANO = 'https://fiskal.domovina.ai';

/** Adresa na koju stara app domena preusmjerava zahtjev. */
export function odredisteStareAppDomene(url: URL): string {
  const baza = ODREDISTA[url.hostname] ?? ZADANO;
  let putanja = url.pathname;
  if (putanja === '/app' || putanja.startsWith('/app/')) putanja = putanja.slice(4);
  if (!putanja.startsWith('/')) putanja = '/' + putanja;
  return `${baza}/app${putanja}${url.search}`;
}

export default {
  fetch(zahtjev: Request): Response {
    const odrediste = odredisteStareAppDomene(new URL(zahtjev.url));
    return new Response(null, {
      status: 301,
      headers: {
        Location: odrediste,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  },
} satisfies ExportedHandler;
