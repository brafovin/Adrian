import type { FastifyRequest } from 'fastify';
import type { Queryable } from '../db/pool.js';

export async function audit(
  db: Queryable,
  req: FastifyRequest | null,
  userId: string | null,
  action: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await db.query('insert into audit_log(user_id, action, ip, user_agent, meta) values ($1,$2,$3,$4,$5)', [
    userId,
    action,
    req?.ip ?? null,
    req?.headers['user-agent']?.slice(0, 300) ?? null,
    JSON.stringify(meta),
  ]);
}
