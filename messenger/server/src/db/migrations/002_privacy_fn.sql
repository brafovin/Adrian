-- Zentrale Sichtbarkeitsregel: darf `viewer` ein Merkmal von `owner` sehen, das mit `vis` geschützt ist?
-- Blockierungen (in beide Richtungen) verbergen immer.
create function is_blocked_between(a uuid, b uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create function can_see(viewer uuid, owner uuid, vis text) returns boolean
language sql stable as $$
  select case
    when viewer = owner then true
    when is_blocked_between(viewer, owner) then false
    when vis = 'everyone' then true
    when vis = 'contacts' then exists (select 1 from contacts where user_id = owner and contact_id = viewer)
    else false
  end
$$;

create function are_contacts(a uuid, b uuid) returns boolean
language sql stable as $$
  select exists (select 1 from contacts where user_id = a and contact_id = b)
$$;
