import type { Ctx } from '../context.js';
import type { Queryable, Tx } from '../db/pool.js';
import type { MemberRow } from './conversations.js';

export interface MsgRow {
  id: string;
  conversation_id: string;
  seq: number;
  sender_id: string | null;
  client_msg_id: string | null;
  kind: string;
  body: string;
  media_id: string | null;
  reply_to_id: string | null;
  forwarded: boolean;
  system_event: Record<string, unknown> | null;
  edited_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
}

export interface MediaView {
  id: string;
  kind: string;
  mime: string;
  size: number;
  name: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
  thumbUrl: string | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  clientMsgId: string | null;
  kind: string;
  body: string;
  media: MediaView | null;
  replyTo: { id: string; senderId: string | null; kind: string; body: string; deleted: boolean } | null;
  forwarded: boolean;
  system: Record<string, unknown> | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: { userId: string; emoji: string }[];
}

export interface CreateMessageInput {
  conversationId: string;
  senderId: string | null;
  kind: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'system';
  body?: string;
  mediaId?: string | null;
  replyToId?: string | null;
  forwarded?: boolean;
  clientMsgId?: string | null;
  systemEvent?: Record<string, unknown> | null;
}

/**
 * Legt eine Nachricht an (innerhalb einer Transaktion). Die Konversationszeile wird gesperrt,
 * damit `seq` lückenlos vergeben wird. Wiederholte `clientMsgId` liefern die bestehende Nachricht (Idempotenz).
 */
export async function createMessage(_ctx: Ctx, tx: Tx, i: CreateMessageInput): Promise<{ row: MsgRow; created: boolean }> {
  await tx.query('select 1 from conversations where id = $1 for update', [i.conversationId]);
  if (i.clientMsgId && i.senderId) {
    const dup = await tx.query('select * from messages where conversation_id = $1 and sender_id = $2 and client_msg_id = $3', [
      i.conversationId, i.senderId, i.clientMsgId,
    ]);
    if (dup.rows[0]) return { row: dup.rows[0], created: false };
  }
  const { rows: c } = await tx.query(
    'update conversations set last_seq = last_seq + 1, last_message_at = now() where id = $1 returning last_seq',
    [i.conversationId],
  );
  const { rows } = await tx.query(
    `insert into messages(conversation_id, seq, sender_id, client_msg_id, kind, body, media_id, reply_to_id, forwarded, system_event)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [
      i.conversationId, c[0].last_seq, i.senderId, i.clientMsgId ?? null, i.kind, i.body ?? '', i.mediaId ?? null,
      i.replyToId ?? null, i.forwarded ?? false, i.systemEvent ? JSON.stringify(i.systemEvent) : null,
    ],
  );
  // Der Absender hat seine eigene Nachricht gelesen und „zugestellt“.
  if (i.senderId) {
    await tx.query(
      `update conversation_members set last_read_seq = greatest(last_read_seq, $3), last_delivered_seq = greatest(last_delivered_seq, $3)
        where conversation_id = $1 and user_id = $2`,
      [i.conversationId, i.senderId, c[0].last_seq],
    );
  }
  return { row: rows[0], created: true };
}

export async function hydrateMessages(db: Queryable, rows: MsgRow[]): Promise<MessageView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const mediaIds = [...new Set(rows.filter((r) => r.media_id && !r.deleted_at).map((r) => r.media_id as string))];
  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean) as string[])];

  const [media, replies, reactions] = await Promise.all([
    mediaIds.length
      ? db.query('select * from media where id = any($1) and deleted_at is null', [mediaIds])
      : { rows: [] as Record<string, any>[] },
    replyIds.length
      ? db.query('select id, sender_id, kind, body, deleted_at from messages where id = any($1)', [replyIds])
      : { rows: [] as Record<string, any>[] },
    db.query('select message_id, user_id, emoji from message_reactions where message_id = any($1) order by created_at', [ids]),
  ]);
  const mediaMap = new Map(media.rows.map((m) => [m.id, m]));
  const replyMap = new Map(replies.rows.map((m) => [m.id, m]));
  const reactMap = new Map<string, { userId: string; emoji: string }[]>();
  for (const r of reactions.rows) {
    const l = reactMap.get(r.message_id) ?? [];
    l.push({ userId: r.user_id, emoji: r.emoji });
    reactMap.set(r.message_id, l);
  }

  return rows.map((r) => {
    const m = r.media_id && !r.deleted_at ? mediaMap.get(r.media_id) : null;
    const rp = r.reply_to_id ? replyMap.get(r.reply_to_id) : null;
    const deleted = !!r.deleted_at;
    return {
      id: r.id,
      conversationId: r.conversation_id,
      seq: r.seq,
      senderId: r.sender_id,
      clientMsgId: r.client_msg_id,
      kind: r.kind,
      body: deleted ? '' : r.body,
      media: m
        ? {
            id: m.id, kind: m.kind, mime: m.mime, size: m.size, name: m.original_name, width: m.width, height: m.height,
            durationMs: m.duration_ms, url: `/api/media/${m.id}`, thumbUrl: m.thumb_key ? `/api/media/${m.id}?thumb=1` : null,
          }
        : null,
      replyTo: rp
        ? { id: rp.id, senderId: rp.sender_id, kind: rp.kind, body: rp.deleted_at ? '' : String(rp.body).slice(0, 140), deleted: !!rp.deleted_at }
        : null,
      forwarded: r.forwarded,
      system: r.system_event,
      editedAt: r.edited_at ? r.edited_at.toISOString() : null,
      deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      reactions: reactMap.get(r.id) ?? [],
    };
  });
}

export function previewText(m: Pick<MessageView, 'kind' | 'body'>): string {
  switch (m.kind) {
    case 'image': return m.body ? `📷 ${m.body}` : '📷 Foto';
    case 'video': return m.body ? `🎬 ${m.body}` : '🎬 Video';
    case 'voice': return '🎤 Sprachnachricht';
    case 'audio': return '🎵 Audio';
    case 'file': return m.body ? `📎 ${m.body}` : '📎 Datei';
    default: return m.body.slice(0, 140);
  }
}

/**
 * Liefert die Nachricht an alle Mitglieder: WebSocket (alle Geräte), Zustellstatus und Push für Offline-Geräte.
 * Wird nach dem Commit aufgerufen.
 */
export async function publishNewMessage(ctx: Ctx, view: MessageView): Promise<void> {
  const { rows: members } = await ctx.db.query<MemberRow & { display_name: string; conv_type: string; title: string | null; blocked: boolean }>(
    `select cm.*, c.type as conv_type, c.title, su.display_name,
            (case when $2::uuid is null then false else is_blocked_between(cm.user_id, $2) end) as blocked
       from conversation_members cm
       join conversations c on c.id = cm.conversation_id
       left join users su on su.id = $2
      where cm.conversation_id = $1 and cm.left_at is null`,
    [view.conversationId, view.senderId],
  );
  const delivered: string[] = [];
  for (const m of members) {
    const n = ctx.hub.send(m.user_id, { type: 'message.new', message: view });
    if (n > 0 && m.user_id !== view.senderId) delivered.push(m.user_id);
  }
  if (delivered.length) {
    await ctx.db.query(
      `update conversation_members set last_delivered_seq = greatest(last_delivered_seq, $3)
        where conversation_id = $1 and user_id = any($2)`,
      [view.conversationId, delivered, view.seq],
    );
    for (const uid of delivered)
      ctx.hub.sendMany(
        members.map((x) => x.user_id).filter((x) => x !== uid),
        { type: 'receipt', conversationId: view.conversationId, userId: uid, kind: 'delivered', seq: view.seq },
      );
  }
  if (view.kind === 'system') return;
  const first = members[0];
  const now = Date.now();
  await Promise.all(
    members
      .filter((m) => m.user_id !== view.senderId && !m.blocked && (!m.muted_until || m.muted_until.getTime() < now))
      .map((m) =>
        ctx.push
          .notifyUser(m.user_id, {
            kind: first?.conv_type === 'group' ? 'group' : 'message',
            title: first?.conv_type === 'group' ? `${first.title ?? 'Gruppe'}` : (first?.display_name ?? 'Neue Nachricht'),
            body: first?.conv_type === 'group' ? `${first.display_name}: ${previewText(view)}` : previewText(view),
            url: `/chats/${view.conversationId}`,
            tag: `conv-${view.conversationId}`,
          })
          .catch(() => 0),
      ),
  );
}

/** Markiert alles bis `upTo` (oder alles) als zugestellt – z. B. wenn ein Gerät online geht. */
export async function markAllDelivered(ctx: Ctx, userId: string): Promise<void> {
  const { rows } = await ctx.db.query(
    `update conversation_members cm set last_delivered_seq = c.last_seq
       from conversations c
      where c.id = cm.conversation_id and cm.user_id = $1 and cm.left_at is null and cm.last_delivered_seq < c.last_seq
      returning cm.conversation_id, c.last_seq`,
    [userId],
  );
  for (const r of rows) {
    const others = (await ctx.db.query('select user_id from conversation_members where conversation_id = $1 and user_id <> $2 and left_at is null', [r.conversation_id, userId])).rows.map((x) => x.user_id);
    ctx.hub.sendMany(others, { type: 'receipt', conversationId: r.conversation_id, userId, kind: 'delivered', seq: r.last_seq });
  }
}
