// Provjera Cloudflare Access JWT-a. Preneseno iz ~/git/logomedo/logomedo.com
// src/lib/admin/access.ts (tamo iz omm.domovina.ai i pay.domovina.ai) — sigurnosnu
// logiku držati u skladu. Access na rubu štiti samo /admin/sso; Worker svejedno
// provjerava potpis, issuer i AUD (obrana ako se Access aplikacija pogrešno
// konfigurira ili ruta postane dostupna mimo nje, npr. preko workers.dev).
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const remoteKeys = new Map<string, JWTVerifyGetKey>();

function keysFor(teamDomain: string): JWTVerifyGetKey {
  let keys = remoteKeys.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    remoteKeys.set(teamDomain, keys);
  }
  return keys;
}

export async function verifyAccessJwt(
  token: string,
  opts: { teamDomain: string; aud: string; keys?: JWTVerifyGetKey },
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, opts.keys ?? keysFor(opts.teamDomain), {
      issuer: `https://${opts.teamDomain}`,
      audience: opts.aud,
      algorithms: ['RS256'],
    });
    return typeof payload.email === 'string' ? { email: payload.email.toLowerCase() } : null;
  } catch {
    return null;
  }
}
