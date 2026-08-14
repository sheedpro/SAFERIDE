-- Police Console uses the existing Supabase Auth users and admin_users profile.
-- These two roles can access only the /police/api namespace.
alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users add constraint admin_users_role_check
  check (role in ('super_admin', 'ops_admin', 'moderator', 'upf_liaison', 'police_supervisor', 'police_dispatcher'));

create index if not exists reports_police_queue_idx
  on reports(status, reported_at desc);
