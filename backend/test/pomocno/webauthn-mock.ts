// Lažni WebAuthn za testove prijave dashboarda (odluka 9). Zamjenjuje provjere u objektu
// `webauthn` iz src/app-auth/passkey.ts (vi.mock modula tu ne djeluje, vidi komentar ondje).
// Lažni odgovor nosi `izazov`; mock zove `expectedChallenge`, pa se izazovi stvarno troše i
// vežu. `ok: false` u odgovoru registracije glumi neuspjelu provjeru.
import { vi } from 'vitest';
import { webauthn } from '../../src/app-auth/passkey';

type Provjera = { response: { id: string; izazov: string; ok?: boolean }; expectedChallenge: (c: string) => Promise<boolean> };

export function lazniWebauthn(noviCounter = 7) {
  const registracija = vi.spyOn(webauthn, 'verifyRegistrationResponse').mockImplementation((async (o: Provjera) => {
    if (!(await o.expectedChallenge(o.response.izazov)) || o.response.ok === false) return { verified: false };
    return {
      verified: true,
      registrationInfo: { credential: { id: o.response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] } },
    };
  }) as never);
  const prijava = vi.spyOn(webauthn, 'verifyAuthenticationResponse').mockImplementation((async (o: Provjera) => {
    if (!(await o.expectedChallenge(o.response.izazov))) return { verified: false };
    return { verified: true, authenticationInfo: { newCounter: noviCounter } };
  }) as never);
  return { registracija, prijava };
}
