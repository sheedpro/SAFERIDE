create table if not exists case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references reports(case_id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  sender_role text not null check (sender_role in ('reporter', 'admin', 'police', 'system')),
  actor_admin_id uuid references admin_users(id),
  body text not null,
  twilio_message_sid text,
  created_at timestamptz not null default now()
);
create index if not exists case_messages_case_idx on case_messages(case_id, created_at);
