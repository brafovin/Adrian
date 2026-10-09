import type { Ctx } from './context.js';
import { purgeMedia } from './routes/media.js';

/** Regelmäßige Bereinigung. Ablauf von Status wird zusätzlich bei jeder Abfrage serverseitig erzwungen. */
export async function runCleanup(ctx: Ctx): Promise<Record<string, number>> {
  const { db, cfg } = ctx;
  const out: Record<string, number> = {};

  // 1. Abgelaufene / gelöschte Status entfernen (inkl. Medien, sofern nicht anderweitig genutzt)
  const st = await db.query(
    `delete from statuses where (expires_at < now() - make_interval(hours => $1::int) or (deleted_at is not null and deleted_at < now() - interval '1 hour'))
     returning media_id`, [cfg.STATUS_MEDIA_GRACE_HOURS]);
  out.statuses = st.rowCount ?? 0;
  // Entwürfe, die nie veröffentlicht wurden, nach 7 Tagen
  out.drafts = (await db.query(`delete from statuses where published_at is null and created_at < now() - interval '7 days'`)).rowCount ?? 0;

  // 2. Verwaiste Medien (nirgends referenziert, älter als 24 h; Status-Medien schon nach der Frist)
  const orphans = await db.query(
    `select m.id, m.storage_key, m.thumb_key from media m
      where m.created_at < now() - interval '24 hours'
        and not exists (select 1 from messages x where x.media_id = m.id)
        and not exists (select 1 from users x where x.avatar_media_id = m.id)
        and not exists (select 1 from conversations x where x.avatar_media_id = m.id)
        and not exists (select 1 from statuses x where x.media_id = m.id)
        and not exists (select 1 from chat_backgrounds x where x.media_id = m.id or x.source_media_id = m.id)
      limit 500`);
  await purgeMedia(ctx, orphans.rows);
  out.orphanMedia = orphans.rowCount ?? 0;

  // 3. Tokens, Sitzungen, Login-Versuche
  out.tokens = (await db.query(`delete from email_tokens where expires_at < now() - interval '7 days'`)).rowCount ?? 0;
  out.sessions = (await db.query(`delete from sessions where expires_at < now() or revoked_at < now() - interval '30 days'`)).rowCount ?? 0;
  out.loginAttempts = (await db.query(`delete from login_attempts where created_at < now() - interval '2 days'`)).rowCount ?? 0;

  // 4. Hängende Anrufe
  out.stuckCalls = (await db.query(
    `update calls set state = 'failed', end_reason = 'stale', ended_at = now()
      where (state = 'ringing' and created_at < now() - interval '5 minutes') or (state = 'active' and answered_at < now() - interval '12 hours')`)).rowCount ?? 0;

  // 5. Audit-Log nach 12 Monaten
  out.audit = (await db.query(`delete from audit_log where created_at < now() - interval '12 months'`)).rowCount ?? 0;
  return out;
}

export function startJobs(ctx: Ctx, log: { error: (o: unknown, m?: string) => void; info: (o: unknown, m?: string) => void }): () => void {
  const tick = () => runCleanup(ctx).then((r) => log.info(r, 'cleanup'), (e) => log.error({ err: String(e) }, 'cleanup fehlgeschlagen'));
  const t = setInterval(tick, 10 * 60_000);
  const first = setTimeout(tick, 15_000);
  return () => { clearInterval(t); clearTimeout(first); };
}
