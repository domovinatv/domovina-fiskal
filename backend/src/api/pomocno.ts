// Pomoćne funkcije ruta javnog API-ja.

import { z } from 'zod';
import type { GreskaVrsta } from '../dokumenti/izdavanje';
import type { ApiKontekst } from './tipovi';

// Vrsta greške servisa izdavanja → HTTP status (servis ne zna za HTTP).
export const HTTP_ZA_VRSTU = { validacija: 400, ne_postoji: 404, sukob: 409 } as const satisfies Record<GreskaVrsta, number>;

// `:id` iz putanje kao pozitivan cijeli broj; inače gotov 400 odgovor.
export function idIzParametra(c: ApiKontekst): number | Response {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ greska: 'id mora biti pozitivan cijeli broj' }, 400);
  return id;
}

// JSON tijelo zahtjeva; neispravan ili prazan JSON = prazan objekt.
export async function jsonTijelo(c: ApiKontekst): Promise<Record<string, unknown>> {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

// Paginacija: neispravan limit/offset je 400 (prije: NaN → 500).
export const cijeliBroj = (naziv: string, min: number, max: number, zadano: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return zadano;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${naziv} mora biti cijeli broj u rasponu [${min}, ${max}]` });
        return z.NEVER;
      }
      return n;
    });
