alter table app_settings
  add column if not exists dispatch_ack_timeout_minutes integer not null default 5 check (dispatch_ack_timeout_minutes > 0),
  add column if not exists acknowledged_reminder_minutes integer not null default 15 check (acknowledged_reminder_minutes > 0),
  add column if not exists acknowledged_escalation_minutes integer not null default 25 check (acknowledged_escalation_minutes > 0);

alter table reports
  add column if not exists officer_reminder_sent_at timestamptz,
  add column if not exists auto_escalated_at timestamptz;

create index if not exists reports_operational_sweep_idx
  on reports(status, reported_at, officer_action_at);
