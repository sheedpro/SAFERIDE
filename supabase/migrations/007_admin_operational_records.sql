alter table stations add column if not exists last_edited_by uuid references admin_users(id);
alter table stations add column if not exists last_edited_at timestamptz;
alter table message_templates add column if not exists archived_at timestamptz;

create index if not exists moderation_flags_banned_idx on moderation_flags(is_banned, cooldown_until);
