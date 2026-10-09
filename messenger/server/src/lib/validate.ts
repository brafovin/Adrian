import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest(
      'validation_error',
      r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

export const uuid = z.string().uuid();
export const usernameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_]{3,30}$/, '3–30 Zeichen: Buchstaben, Ziffern, Unterstrich');
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const displayNameSchema = z.string().trim().min(1).max(60);

const COMMON = new Set(
  ['password', 'passwort', '12345678', '123456789', '1234567890', 'qwertzuiop', 'qwertyuiop', 'iloveyou', 'password1', 'passwort1', 'abcdefghij', 'letmein123', '0123456789', 'adrian1234'],
);
export const passwordSchema = z
  .string()
  .min(10, 'mindestens 10 Zeichen')
  .max(200)
  .refine((p) => !COMMON.has(p.toLowerCase()), 'zu verbreitetes Passwort')
  .refine((p) => new Set(p).size >= 5, 'zu wenig unterschiedliche Zeichen');

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'support', 'system', 'adrian', 'help', 'null', 'undefined', 'moderator', 'security', 'staff', 'official', 'me', 'api',
]);
