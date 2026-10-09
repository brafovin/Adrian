import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from './errors.js';

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.auth) throw unauthorized('not_authenticated', 'Bitte anmelden.');
}
