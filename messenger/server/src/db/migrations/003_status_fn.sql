-- Darf `viewer` den Status `sid` aktuell sehen? (Ablauf, Löschung, Entwurf, Blockierung, Privatsphäre, Zielgruppe)
create function status_visible_to(viewer uuid, sid uuid) returns boolean
language sql stable as $$
  select exists (
    select 1
    from statuses s
    join user_privacy p on p.user_id = s.user_id
    where s.id = sid
      and s.deleted_at is null
      and s.published_at is not null
      and s.expires_at > now()
      and (
        s.user_id = viewer
        or (
          not is_blocked_between(viewer, s.user_id)
          and p.status_vis = 'contacts'
          and are_contacts(s.user_id, viewer)
          and case s.visibility
                when 'contacts' then true
                when 'only'   then exists (select 1 from status_audience a where a.status_id = s.id and a.user_id = viewer)
                when 'except' then not exists (select 1 from status_audience a where a.status_id = s.id and a.user_id = viewer)
              end
        )
      )
  )
$$;
