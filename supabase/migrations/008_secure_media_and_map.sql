-- Evidence is private. The server stores WhatsApp media using its service role;
-- web clients never receive a bucket URL or a direct Storage policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('saferide-evidence', 'saferide-evidence', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'])
on conflict (id) do nothing;

create or replace function admin_checkpoint_locations()
returns table(checkpoint_id text, latitude double precision, longitude double precision)
language sql stable security definer as $$
  select checkpoint_id, st_y(location::geometry), st_x(location::geometry)
  from checkpoints;
$$;
