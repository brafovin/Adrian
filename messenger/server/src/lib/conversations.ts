import type { Ctx } from '../context.js';
import type { Db, Queryable, Tx } from '../db/pool.js';
import { withTx } from '../db/pool.js';
import { forbidden, notFound } from './errors.js';
import { hydrateMessages, type MessageView, type MsgRow } from './messages.js';
import { DELETED_USER, publicUserCols, toPublicUser, type PublicUserRow } from './users.js';

export interface MemberRow {
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  left_at: Date | null;
  history_from_seq: number;
  last_read_seq: number;
  last_delivered_seq: number;
  archived: boolean;
  pinned_at: Date | null;
  muted_until: Date | null;
}
export interface ConvRow {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  description: string;
  avatar_media_id: string | null;
  created_by: string | null;
  last_seq: number;
  last_message_at: Date | null;
  info_admins_only: boolean;
  send_admins_only: boolean;
  add_admins_only: boolean;
  created_at: Date;
}

/** Aktives Mitglied oder 404 (kein Hinweis auf Existenz fremder Chats). */
export async function requireMember(db: Queryable, conversationId: string, userId: string): Promise<{ conv: ConvRow; me: MemberRow }> {
  const { rows } = await db.query(
    `select to_jsonb(c) as c, to_jsonb(cm) as cm from conversations c
       join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $2 and cm.left_at is null
      where c.id = $1`,
    [conversationId, userId],
  ).catch((e) => {
    if ((e as { code?: string }).code === '22P02') return { rows: [] };
    throw e;
  });
  if (!rows[0]) throw notFound('conversation_not_found', 'Chat nicht gefunden.');
  return { conv: reviveDates(rows[0].c) as ConvRow, me: reviveDates(rows[0].cm) as MemberRow };
}

function reviveDates<T extends Record<string, unknown>>(o: T): T {
  for (const k of ['last_message_at', 'created_at', 'left_at', 'pinned_at', 'muted_until', 'joined_at'])
    if (typeof o[k] === 'string') (o as Record<string, unknown>)[k] = new Date(o[k] as string);
  for (const k of ['last_seq', 'history_from_seq', 'last_read_seq', 'last_delivered_seq'])
    if (typeof o[k] === 'string') (o as Record<string, unknown>)[k] = Number(o[k]);
  return o;
}

export const isAdmin = (m: MemberRow) => m.role === 'owner' || m.role === 'admin';

export async function activeMemberIds(db: Queryable, conversationId: string): Promise<string[]> {
  const { rows } = await db.query('select user_id from conversation_members where conversation_id = $1 and left_at is null', [conversationId]);
  return rows.map((r) => r.user_id);
}

export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Die andere Person eines Direktchats (oder null, wenn sie ihr Konto gelöscht hat). */
export async function directPeerId(db: Queryable, conversationId: string, me: string): Promise<string | null> {
  const { rows } = await db.query(
    'select user_id from conversation_members where conversation_id = $1 and user_id <> $2 and left_at is null',
    [conversationId, me],
  );
  return rows[0]?.user_id ?? null;
}

/** Darf `from` dem Benutzer `to` direkt schreiben? Wirft sonst 403. */
export async function assertCanDirectMessage(db: Queryable, from: string, to: string): Promise<void> {
  const { rows } = await db.query(
    `select is_blocked_between($1,$2) as blocked, are_contacts($1,$2) as contact, p.dm_from, u.deleted_at
       from users u join user_privacy p on p.user_id = u.id where u.id = $2`,
    [from, to],
  );
  const r = rows[0];
  if (!r || r.deleted_at) throw notFound('user_not_found', 'Benutzer nicht gefunden.');
  if (r.blocked) throw forbidden('cannot_message', 'Du kannst diesem Nutzer keine Nachrichten senden.');
  if (!r.contact && r.dm_from !== 'everyone') throw forbidden('not_contact', 'Dieser Nutzer nimmt nur Nachrichten von Kontakten an.');
}

export async function systemMessage(
  ctx: Ctx,
  tx: Tx,
  conversationId: string,
  event: Record<string, unknown>,
  senderId: string | null,
) {
  const { createMessage } = await import('./messages.js');
  return createMessage(ctx, tx, { conversationId, senderId, kind: 'system', body: '', systemEvent: event });
}

export function emitConversationUpdated(ctx: Ctx, memberIds: Iterable<string>, conversationId: string, extra: Record<string, unknown> = {}) {
  ctx.hub.sendMany(memberIds, { type: 'conversation.updated', conversationId, ...extra });
}

export interface ConversationView {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  description: string;
  avatarUrl: string | null;
  peer: ReturnType<typeof toPublicUser> | typeof DELETED_USER | null;
  memberCount: number;
  myRole: string;
  lastSeq: number;
  lastMessageAt: string | null;
  lastMessage: MessageView | null;
  /** Zusammengefasste Empfangsbestätigungen der anderen Mitglieder (für Haken in der Chatliste). */
  receipts: { deliveredSeq: number; readSeq: number | null };
  unreadCount: number;
  archived: boolean;
  pinnedAt: string | null;
  mutedUntil: string | null;
  sendAdminsOnly: boolean;
  infoAdminsOnly: boolean;
  addAdminsOnly: boolean;
  createdAt: string;
}

/** Liste (oder einzelne) Unterhaltungen aus Sicht von `userId`. */
export async function loadConversationViews(ctx: Ctx, userId: string, onlyId?: string): Promise<ConversationView[]> {
  const { rows } = await ctx.db.query(
    `select c.*, cm.role as my_role, cm.archived, cm.pinned_at, cm.muted_until,
        (select count(*)::int from conversation_members x where x.conversation_id = c.id and x.left_at is null) as member_count,
        (select count(*)::int from messages m
           where m.conversation_id = c.id and m.seq > greatest(cm.last_read_seq, cm.history_from_seq)
             and m.sender_id is distinct from $1 and m.deleted_at is null and m.kind <> 'system'
             and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = $1)) as unread,
        (select min(x.last_delivered_seq) from conversation_members x where x.conversation_id = c.id and x.user_id <> $1 and x.left_at is null) as rcpt_delivered,
        (select min(x.last_read_seq) from conversation_members x join user_privacy xp on xp.user_id = x.user_id
          where x.conversation_id = c.id and x.user_id <> $1 and x.left_at is null and xp.read_receipts) as rcpt_read,
        (select m.id from messages m where m.conversation_id = c.id and m.seq > cm.history_from_seq
            and not exists (select 1 from message_hidden h where h.message_id = m.id and h.user_id = $1)
          order by m.seq desc limit 1) as last_message_id,
        (select to_jsonb(pu) from (select ${publicUserCols('$1')}
            from conversation_members pm join users u on u.id = pm.user_id join user_privacy p on p.user_id = u.id
           where c.type = 'direct' and pm.conversation_id = c.id and pm.user_id <> $1 and pm.left_at is null limit 1) pu) as peer
       from conversations c
       join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $1 and cm.left_at is null
      where ($2::uuid is null or c.id = $2)
      order by (cm.pinned_at is not null) desc, cm.pinned_at desc nulls last, coalesce(c.last_message_at, c.created_at) desc`,
    [userId, onlyId ?? null],
  );
  const lastIds = rows.map((r) => r.last_message_id).filter(Boolean) as string[];
  const lastRows = lastIds.length ? ((await ctx.db.query('select * from messages where id = any($1)', [lastIds])).rows as MsgRow[]) : [];
  const lastViews = new Map((await hydrateMessages(ctx.db, lastRows)).map((m) => [m.id, m]));
  return rows.map((r) => {
    let peer: ConversationView['peer'] = null;
    if (r.type === 'direct') {
      if (r.peer) {
        const p = r.peer as PublicUserRow & { last_seen_at: string | null };
        peer = toPublicUser({ ...p, last_seen_at: p.last_seen_at ? new Date(p.last_seen_at) : null }, ctx.hub);
      } else peer = DELETED_USER;
    }
    return {
      id: r.id, type: r.type, title: r.title, description: r.description,
      avatarUrl: r.avatar_media_id ? `/api/media/${r.avatar_media_id}` : null,
      peer, memberCount: r.member_count, myRole: r.my_role, lastSeq: r.last_seq,
      lastMessageAt: r.last_message_at ? r.last_message_at.toISOString() : null,
      lastMessage: r.last_message_id ? (lastViews.get(r.last_message_id) ?? null) : null,
      receipts: { deliveredSeq: r.rcpt_delivered ?? 0, readSeq: r.rcpt_read ?? null },
      unreadCount: r.unread, archived: r.archived,
      pinnedAt: r.pinned_at ? r.pinned_at.toISOString() : null,
      mutedUntil: r.muted_until ? r.muted_until.toISOString() : null,
      sendAdminsOnly: r.send_admins_only, infoAdminsOnly: r.info_admins_only, addAdminsOnly: r.add_admins_only,
      createdAt: r.created_at.toISOString(),
    } satisfies ConversationView;
  });
}

export { withTx };
export type { Db };
