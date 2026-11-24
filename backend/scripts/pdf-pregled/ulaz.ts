// Node ulaz: generira ogledne PDF-ove u direktorij iz argv[2].
import { readFileSync, writeFileSync } from 'node:fs';
import { generirajRacunPdf } from '../../src/pdf/racun-pdf';
import { branding, primjeri } from './primjeri';

const izlaz = process.argv[2] ?? '.';
const logo = new Uint8Array(readFileSync(process.argv[3])); // primjer-logo.png
for (const [ime, k] of Object.entries(primjeri)) {
  const b = branding[ime] ? { ...branding[ime], logo: ime === 'b2c-brand' ? logo : null } : null;
  writeFileSync(`${izlaz}/${ime}.pdf`, await generirajRacunPdf(k, { branding: b }));
}
console.log(Object.keys(primjeri).join(' '));
