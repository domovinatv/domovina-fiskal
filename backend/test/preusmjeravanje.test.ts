// 301 sa starih Pages domena dashboarda na /app fiskal Workera (odluka 700).
import { describe, expect, it } from 'vitest';
import worker, { odredisteStareAppDomene } from '../src/preusmjeravanje/stara-app-domena';

const o = (u: string) => odredisteStareAppDomene(new URL(u));

describe('preusmjeravanje stare app domene', () => {
  it('korijen ide na /app/', () => {
    expect(o('https://fiskal-app.domovina.ai/')).toBe('https://fiskal.domovina.ai/app/');
    expect(o('https://fiskal-app-test.domovina.ai/')).toBe('https://fiskal-test.domovina.ai/app/');
  });

  it('putanja i upit se zadržavaju, /app se ne udvostručuje', () => {
    expect(o('https://fiskal-app.domovina.ai/dashboard/racuni?str=2')).toBe(
      'https://fiskal.domovina.ai/app/dashboard/racuni?str=2',
    );
    expect(o('https://fiskal-app.domovina.ai/app/dashboard')).toBe('https://fiskal.domovina.ai/app/dashboard');
    expect(o('https://fiskal-app.domovina.ai/app')).toBe('https://fiskal.domovina.ai/app/');
    expect(o('https://fiskal-app.domovina.ai/application')).toBe('https://fiskal.domovina.ai/app/application');
  });

  it('nepoznat host ide na PROD', () => {
    expect(o('https://nesto.example/x')).toBe('https://fiskal.domovina.ai/app/x');
  });

  it('fetch vraća 301 s Location', async () => {
    const r = worker.fetch(new Request('https://fiskal-app.domovina.ai/login'));
    expect(r.status).toBe(301);
    expect(r.headers.get('Location')).toBe('https://fiskal.domovina.ai/app/login');
  });
});
