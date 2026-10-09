import type { Hub } from '../hub.js';

/** Spaltenliste für „fremde“ Benutzer aus Sicht von `$N` (Viewer). Alias: u = users, p = user_privacy. */
export function publicUserCols(viewerParam: string, u = 'u', p = 'p'): string {
  const v = viewerParam;
  return `
    ${u}.id, ${u}.username::text as username, ${u}.display_name,
    case when can_see(${v}, ${u}.id, ${p}.avatar_vis) then ${u}.avatar_media_id end as avatar_media_id,
    case when can_see(${v}, ${u}.id, ${p}.bio_vis) then ${u}.bio end as bio,
    can_see(${v}, ${u}.id, ${p}.online_vis) as online_visible,
    case when can_see(${v}, ${u}.id, ${p}.last_seen_vis) then ${u}.last_seen_at end as last_seen_at,
    are_contacts(${v}, ${u}.id) as is_contact,
    exists (select 1 from blocks bb where bb.blocker_id = ${v} and bb.blocked_id = ${u}.id) as blocked_by_me`;
}

export interface PublicUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  bio: string | null;
  online_visible: boolean;
  last_seen_at: Date | null;
  is_contact: boolean;
  blocked_by_me: boolean;
}

export function toPublicUser(r: PublicUserRow, hub: Hub) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_media_id ? `/api/media/${r.avatar_media_id}` : null,
    bio: r.bio ?? '',
    online: r.online_visible ? hub.isOnline(r.id) : null,
    lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null,
    isContact: r.is_contact,
    blockedByMe: r.blocked_by_me,
  };
}
export type PublicUser = ReturnType<typeof toPublicUser>;

/** Fallback für gelöschte Konten. */
export const DELETED_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  username: 'deleted',
  displayName: 'Gelöschter Nutzer',
  avatarUrl: null,
  bio: '',
  online: null,
  lastSeenAt: null,
  isContact: false,
  blockedByMe: false,
} satisfies PublicUser;
