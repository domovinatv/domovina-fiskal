// K17: javni GET / opisuje servis, ali ne otkriva broj tenanata ni računa.
import { describe, expect, it } from 'vitest';
import { json, poziv } from './pomocno/okolina';

describe('GET / (K17)', () => {
  it('vraća opis servisa bez brojača', async () => {
    const r = await poziv('/');
    expect(r.status).toBe(200);
    const tijelo = await json(r);
    expect(tijelo.servis).toBe('fiskal.domovina.ai');
    expect(tijelo).not.toHaveProperty('brojaci');
  });
});
