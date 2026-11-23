// Lokalni e2e dashboarda s virtualnim WebAuthn autentifikatorom (Chrome DevTools Protocol).
// Tok: pozivnica → passkey → popis računa → moji passkeyi → članovi (pozovi + opozovi) →
// odjava → prijava passkeyem → reload → isti link ne vrijedi → link bez tokena.
//
// Preduvjeti (docs/research/2026-11-23-workers-assets-next-basepath.md):
//   npm run dev:app   (wrangler dev --local-upstream localhost:8787, inače je rpID ruta)
//   pozivnica za vlasnika tenanta 1 kroz /admin/korisnici ili POST /admin/korisnici/pozivnica
// Pokretanje (token pozivnice samo kroz env, nikad u repo ni log):
//   PLAYWRIGHT_CORE=<put do node_modules/playwright-core> POZIV_TOKEN=<token> node scripts/e2e-app-lokalno.cjs
// Koristi instalirani Google Chrome (channel 'chrome'), headless.

const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const TOKEN = process.env.POZIV_TOKEN || '';
const BAZA = process.env.FISKAL_URL || 'http://localhost:8787';
if (!TOKEN) { console.error('Nedostaje POZIV_TOKEN'); process.exit(2); }
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const greske = [];
  page.on('console', (m) => { if (m.type() === 'error') greske.push(m.text()); });
  const log = (s) => console.log(s);
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await page.goto(BAZA + '/app/poziv#' + TOKEN);
    await page.getByText('Izradi passkey i uđi').waitFor();
    log('1 poziv: hash obrisan iz adrese = ' + !page.url().includes('#'));
    log('  ' + (await page.locator('p').first().innerText()).replace(/\s+/g, ' ').slice(0, 160));
    await page.getByPlaceholder('npr. Laptop u uredu').fill('E2E virtualni');
    await page.getByText('Izradi passkey i uđi').click();
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });
    await page.getByText('Odjava').waitFor();
    await page.getByRole('table').waitFor({ timeout: 10000 }).catch(() => {});
    log('2 dashboard: ' + (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 220));
    log('  kolačići: ' + (await page.context().cookies()).map((c) => `${c.name} httpOnly=${c.httpOnly} secure=${c.secure} sameSite=${c.sameSite} path=${c.path}`).join(', '));
    log('  passkeyi u autentifikatoru: ' + (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length);
    await page.getByRole('link', { name: 'Moji passkeyi' }).click();
    await page.waitForURL('**/app/dashboard/passkeyi');
    await page.getByText('E2E virtualni').waitFor();
    log('3 passkeyi: ' + (await page.locator('table').innerText()).replace(/\s+/g, ' ').slice(0, 160));
    await page.getByRole('link', { name: 'Članovi' }).click();
    await page.waitForURL('**/app/dashboard/clanovi');
    await page.getByText('(ti)').first().waitFor();
    log('4 članovi: ' + (await page.locator('table').innerText()).replace(/\s+/g, ' ').slice(0, 200));
    await page.getByPlaceholder('e-mail').fill('operater-e2e@primjer.hr');
    await page.getByRole('button', { name: 'Izdaj pozivnicu' }).click();
    const link = await page.locator('input[readonly]').inputValue();
    log('  pozivnica operatera: ' + link.replace(/#.*/, '#…') + ' (token ' + (link.split('#')[1] || '').length + ' zn.)');
    await page.getByText('Opozovi').first().click();
    await page.getByText('Pozivnica je opozvana.').waitFor();
    log('  opozvana');
    await page.getByText('Odjava').click();
    await page.getByText('Prijava passkeyem').waitFor();
    log('5 odjava: kolačića ' + (await page.context().cookies()).length + ', /api/v1/ja = ' + (await page.evaluate(() => fetch('/api/v1/ja').then((r) => r.status))));
    await page.getByText('Prijava passkeyem').click();
    await page.getByText('Odjava').waitFor({ timeout: 15000 });
    await page.reload();
    await page.getByText('Odjava').waitFor({ timeout: 15000 });
    log('6 prijava passkeyem + reload: prijavljen, ' + page.url());
    const poId = await page.evaluate(() => fetch('/api/v1/racun?limit=1', { headers: { 'X-Tenant-Id': '1' } }).then((r) => r.status));
    const bezOrigina = await page.evaluate(() => fetch('/api/v1/ja').then((r) => r.status));
    log('  GET /racun s kolačićem = ' + poId + ', /ja = ' + bezOrigina);
    await page.goto(BAZA + '/app/poziv#' + TOKEN);
    await page.getByText('Pozivnica ne vrijedi').waitFor();
    log('7 isti link ponovno: „Pozivnica ne vrijedi”');
    await page.goto(BAZA + '/app/poziv');
    await page.getByText('Link nije potpun').waitFor();
    log('8 bez tokena: „Link nije potpun”');
  } catch (e) {
    console.log('PAO: ' + e.message.split('\n')[0]); process.exitCode = 1;
    await page.screenshot({ path: (process.env.TMPDIR || '/tmp') + '/e2e-app-pao.png' });
  }
  if (greske.length) log('console greške: ' + greske.slice(0, 5).join(' | '));
  await browser.close();
})();
