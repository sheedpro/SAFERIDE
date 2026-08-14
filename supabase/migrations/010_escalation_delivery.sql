-- Command-centre numbers are managed operationally, not embedded in source code.
alter table app_settings add column if not exists escalation_whatsapp_recipients text[] not null default '{}';
alter table reports add column if not exists escalation_notification_attempts jsonb not null default '[]';
