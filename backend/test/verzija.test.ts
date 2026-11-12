// K18: verzija se čita iz package.json, ne drži se na dva mjesta.
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { APP_VERSION } from '../src/admin/views';

describe('verzija (K18)', () => {
  it('APP_VERSION = v + package.json version', () => {
    expect(APP_VERSION).toBe(`v${pkg.version}`);
  });
});
