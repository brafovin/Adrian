-- Adrian Messenger – Basisschema
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- Benutzer
create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext unique,
  email_verified_at timestamptz,
  username          citext not null unique,
  display_name      text not null,
  bio               text not null default '',
  avatar_media_id   uuid,
  password_hash     text,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint users_username_format check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  constraint users_display_name_len check (char_length(display_name) between 1 and 60),
  constraint users_bio_len check (char_length(bio) <= 300)
);
create index users_display_name_trgm on users using gin (display_name gin_trgm_ops);
create index users_username_trgm on users using gin ((username::text) gin_trgm_ops);

create table user_privacy (
  user_id            uuid primary key references users(id) on delete cascade,
  avatar_vis         text not null default 'everyone'  check (avatar_vis in ('everyone','contacts','nobody')),
  bio_vis            text not null default 'everyone'  check (bio_vis in ('everyone','contacts','nobody')),
  online_vis         text not null default 'everyone'  check (online_vis in ('everyone','contacts','nobody')),
  last_seen_vis      text not null default 'contacts'  check (last_seen_vis in ('everyone','contacts','nobody')),
  status_vis         text not null default 'contacts'  check (status_vis in ('contacts','nobody')),
  groups_vis         text not null default 'contacts'  check (groups_vis in ('everyone','contacts','nobody')),
  contact_requests   text not null default 'everyone'  check (contact_requests in ('everyone','nobody')),
  dm_from            text not null default 'contacts'  check (dm_from in ('everyone','contacts')),
  calls_from         text not null default 'contacts'  check (calls_from in ('everyone','contacts','nobody')),
  group_add_from     text not null default 'contacts'  check (group_add_from in ('everyone','contacts')),
  discoverable       boolean not null default true,
  read_receipts      boolean not null default true
);

create table user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  data    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Sitzungen & Tokens
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  device_name   text not null default '',
  user_agent    text not null default '',
  ip            text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index sessions_user_idx on sessions(user_id) where revoked_at is null;

create table email_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('verify','reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create table login_attempts (
  id         bigserial primary key,
  identifier text not null,
  ip         text,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_ident_idx on login_attempts(identifier, created_at desc);
create index login_attempts_ip_idx on login_attempts(ip, created_at desc);

-- ---------------------------------------------------------------- Medien
create table media (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  purpose       text not null check (purpose in ('message','avatar','status','background','group_avatar')),
  kind          text not null check (kind in ('image','video','audio','file')),
  mime          text not null,
  size          bigint not null,
  sha256        text not null,
  storage_key   text not null unique,
  thumb_key     text,
  original_name text not null default '',
  width         int,
  height        int,
  duration_ms   int,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index media_owner_idx on media(owner_id, created_at desc);
create index media_orphan_idx on media(created_at) where deleted_at is null;

alter table users add constraint users_avatar_fk foreign key (avatar_media_id) references media(id) on delete set null;

-- ---------------------------------------------------------------- Kontakte
create table contact_requests (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id   uuid not null references users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user_id <> to_user_id)
);
create unique index contact_requests_pending_uq on contact_requests(from_user_id, to_user_id) where status = 'pending';
create index contact_requests_to_idx on contact_requests(to_user_id, status);

-- Beide Richtungen werden gespeichert (a->b und b->a).
create table contacts (
  user_id    uuid not null references users(id) on delete cascade,
  contact_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id),
  check (user_id <> contact_id)
);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on blocks(blocked_id);

create table reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references users(id) on delete cascade,
  reported_user_id uuid not null references users(id) on delete cascade,
  conversation_id  uuid,
  message_id       uuid,
  reason           text not null check (reason in ('spam','harassment','illegal','impersonation','other')),
  details          text not null default '',
  status           text not null default 'open' check (status in ('open','reviewing','closed')),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- Unterhaltungen
create table conversations (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('direct','group')),
  title            text,
  description      text not null default '',
  avatar_media_id  uuid references media(id) on delete set null,
  created_by       uuid references users(id) on delete set null,
  direct_key       text unique,
  last_seq         bigint not null default 0,
  last_message_at  timestamptz,
  info_admins_only boolean not null default true,
  send_admins_only boolean not null default false,
  add_admins_only  boolean not null default true,
  created_at       timestamptz not null default now(),
  check ((type = 'direct' and direct_key is not null) or (type = 'group' and direct_key is null))
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner','admin','member')),
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,
  -- Nachrichten mit seq <= history_from_seq sind für dieses Mitglied unsichtbar (Beitritt / Chat leeren).
  history_from_seq bigint not null default 0,
  last_read_seq    bigint not null default 0,
  last_delivered_seq bigint not null default 0,
  archived        boolean not null default false,
  pinned_at       timestamptz,
  muted_until     timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members(user_id) where left_at is null;

create table group_invites (
  code            text primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_by      uuid not null references users(id) on delete cascade,
  expires_at      timestamptz,
  max_uses        int,
  uses            int not null default 0,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index group_invites_conv_idx on group_invites(conversation_id);

-- ---------------------------------------------------------------- Nachrichten
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  seq             bigint not null,
  sender_id       uuid references users(id) on delete set null,
  client_msg_id   text,
  kind            text not null check (kind in ('text','image','video','audio','voice','file','system')),
  body            text not null default '',
  media_id        uuid references media(id) on delete set null,
  reply_to_id     uuid references messages(id) on delete set null,
  forwarded       boolean not null default false,
  system_event    jsonb,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  deleted_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (conversation_id, seq),
  constraint messages_body_len check (char_length(body) <= 8000)
);
create unique index messages_idem_uq on messages(conversation_id, sender_id, client_msg_id) where client_msg_id is not null;
create index messages_conv_seq_idx on messages(conversation_id, seq desc);
create index messages_body_trgm on messages using gin (body gin_trgm_ops);
create index messages_media_idx on messages(media_id) where media_id is not null;

create table message_hidden (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  primary key (message_id, user_id)
);

create table message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------- Chat-Hintergründe (privat pro Benutzer)
create table chat_backgrounds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  media_id        uuid not null references media(id) on delete cascade,
  source_media_id uuid references media(id) on delete set null,
  params          jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);
create unique index chat_backgrounds_default_uq on chat_backgrounds(user_id) where conversation_id is null;
create unique index chat_backgrounds_conv_uq on chat_backgrounds(user_id, conversation_id) where conversation_id is not null;

-- ---------------------------------------------------------------- Status (24 h)
create table statuses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  kind         text not null check (kind in ('text','image','video')),
  body         text not null default '',
  style        jsonb not null default '{}'::jsonb,
  media_id     uuid references media(id) on delete set null,
  visibility   text not null default 'contacts' check (visibility in ('contacts','only','except')),
  created_at   timestamptz not null default now(),
  published_at timestamptz,
  expires_at   timestamptz,
  deleted_at   timestamptz,
  constraint statuses_body_len check (char_length(body) <= 700)
);
create index statuses_user_idx on statuses(user_id, published_at desc);
create index statuses_expiry_idx on statuses(expires_at) where deleted_at is null;

create table status_audience (
  status_id uuid not null references statuses(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  primary key (status_id, user_id)
);

create table status_views (
  status_id uuid not null references statuses(id) on delete cascade,
  viewer_id uuid not null references users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

create table status_reactions (
  status_id uuid not null references statuses(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  emoji     text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (status_id, user_id)
);

-- ---------------------------------------------------------------- Anrufe
create table calls (
  id           uuid primary key default gen_random_uuid(),
  caller_id    uuid not null references users(id) on delete cascade,
  callee_id    uuid not null references users(id) on delete cascade,
  kind         text not null check (kind in ('audio','video')),
  state        text not null default 'ringing' check (state in ('ringing','active','ended','declined','missed','cancelled','failed')),
  end_reason   text,
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz,
  check (caller_id <> callee_id)
);
create index calls_caller_idx on calls(caller_id, created_at desc);
create index calls_callee_idx on calls(callee_id, created_at desc);

-- ---------------------------------------------------------------- Push
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  provider   text not null check (provider in ('webpush','fcm','apns')),
  endpoint   text not null,
  keys       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, endpoint)
);
create index push_subscriptions_user_idx on push_subscriptions(user_id);

-- ---------------------------------------------------------------- Audit
create table audit_log (
  id         bigserial primary key,
  user_id    uuid,
  action     text not null,
  ip         text,
  user_agent text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_user_idx on audit_log(user_id, created_at desc);
