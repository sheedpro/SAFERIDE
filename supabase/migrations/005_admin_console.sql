create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  role text not null check (role in ('super_admin', 'ops_admin', 'moderator', 'upf_liaison')),
  station_scope text[] not null default '{}',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  id text primary key check (id = 'saferide-config'),
  avg_corridor_speed_kmh numeric not null default 35 check (avg_corridor_speed_kmh > 0),
  corroboration_window_minutes integer not null default 20 check (corroboration_window_minutes > 0),
  repeat_offender_count integer not null default 3 check (repeat_offender_count > 0),
  repeat_offender_window_days integer not null default 30 check (repeat_offender_window_days > 0),
  rate_limit_count integer not null default 5 check (rate_limit_count > 0),
  rate_limit_window_hours integer not null default 24 check (rate_limit_window_hours > 0),
  updated_by uuid references admin_users(id),
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values ('saferide-config') on conflict (id) do nothing;

create table if not exists moderation_flags (
  id uuid primary key default gen_random_uuid(),
  reporter_phone_hash text unique not null,
  warning_count integer not null default 0,
  cooldown_until timestamptz,
  is_banned boolean not null default false,
  flag_history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references admin_users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on audit_logs(entity_type, entity_id, created_at desc);
create index if not exists audit_logs_actor_idx on audit_logs(actor_admin_id, created_at desc);

alter table checkpoints add column if not exists last_edited_by uuid references admin_users(id);
alter table checkpoints add column if not exists last_edited_at timestamptz;
alter table checkpoints add column if not exists shift_end_sweep_enabled boolean not null default true;
alter table routes add column if not exists last_edited_by uuid references admin_users(id);
alter table routes add column if not exists last_edited_at timestamptz;
alter table routes add column if not exists polyline_source text not null default 'manual';
alter table reports add column if not exists moderation_status text not null default 'clean';
alter table reports add column if not exists flag_reasons text[] not null default '{}';

create index if not exists reports_moderation_idx on reports(moderation_status, reported_at desc);
