import type { Ctx } from '../context.js';
import type { Tx } from '../db/pool.js';
import { systemMessage } from './conversations.js';
import type { MsgRow } from './messages.js';

/**
 * Entfernt ein Mitglied (Austritt oder Entfernung). Übergibt bei Bedarf die Inhaberrolle weiter
 * und löscht leere Gruppen. Gibt die erzeugte Systemnachricht zurück (zum Veröffentlichen nach dem Commit).
 */
export async function removeMemberTx(
  ctx: Ctx,
  tx: Tx,
  conversationId: string,
  userId: string,
  by: string | null,
): Promise<{ system: MsgRow | null; remaining: string[] }> {
  const { rows: cur } = await tx.query(
    'update conversation_members set left_at = now(), pinned_at = null, role = $3 where conversation_id = $1 and user_id = $2 and left_at is null returning role',
    [conversationId, userId, 'member'],
  );
  const wasOwner = cur[0] ? await tx.query('select 1 from conversations where id=$1 and created_by = $2', [conversationId, userId]) : null;
  void wasOwner;
  const { rows: rest } = await tx.query(
    `select user_id, role from conversation_members where conversation_id = $1 and left_at is null order by (role = 'owner') desc, (role = 'admin') desc, joined_at`,
    [conversationId],
  );
  if (!rest.length) {
    await tx.query('delete from conversations where id = $1', [conversationId]);
    return { system: null, remaining: [] };
  }
  if (!rest.some((r) => r.role === 'owner')) {
    await tx.query(`update conversation_members set role = 'owner' where conversation_id = $1 and user_id = $2`, [conversationId, rest[0].user_id]);
  }
  const { row } = await systemMessage(ctx, tx, conversationId, by && by !== userId ? { type: 'member_removed', userId, by } : { type: 'member_left', userId }, by ?? userId);
  return { system: row, remaining: rest.map((r) => r.user_id) };
}
