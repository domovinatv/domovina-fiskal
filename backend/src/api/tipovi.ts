// Zajednički Hono tipovi javnog API-ja.

import type { Context } from 'hono';
import type { ApiVarijable, Env } from '../types';

export type ApiHono = { Bindings: Env; Variables: ApiVarijable };
export type ApiKontekst = Context<ApiHono>;
