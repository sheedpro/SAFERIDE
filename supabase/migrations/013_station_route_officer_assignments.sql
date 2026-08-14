-- A checkpoint is the physical interception point.  A station owns and
-- supervises it; officers remain stored in the existing checkpoint roster.
alter table checkpoints
  add column if not exists station_id text references stations(station_id);

alter table reports
  add column if not exists assigned_station_id text references stations(station_id),
  add column if not exists assigned_officer_badge_id text;

create table if not exists report_assignments (
  id bigint generated always as identity primary key,
  case_id text not null references reports(case_id) on delete cascade,
  checkpoint_id text references checkpoints(checkpoint_id),
  station_id text references stations(station_id),
  officer_badge_id text,
  recipient_type text not null check (recipient_type in ('officer', 'station', 'escalation')),
  recipient_name text not null,
  assignment_reason text not null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  delivery_status text not null default 'pending',
  delivery_message_sid text,
  delivery_error text
);

create index if not exists report_assignments_case_idx
  on report_assignments(case_id, assigned_at desc);

create index if not exists checkpoints_station_idx
  on checkpoints(station_id);
