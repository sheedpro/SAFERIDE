create table if not exists message_templates (
  template_key text primary key,
  label text not null,
  body text not null,
  is_active boolean not null default true,
  updated_by uuid references admin_users(id),
  updated_at timestamptz not null default now()
);

alter table reports add column if not exists vehicle_watch_status text not null default 'STANDARD'
  check (vehicle_watch_status in ('STANDARD', 'HIGH'));
alter table reports add column if not exists vehicle_watch_reason text;

create index if not exists reports_vehicle_watch_idx on reports(plate_number, vehicle_watch_status, reported_at desc);
