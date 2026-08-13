create extension if not exists postgis;

create table sessions (
    phone_hash text primary key,
    state text not null default 'MAIN_MENU',
    session_data jsonb not null default '{}',
    last_interaction_at timestamptz not null default now()
);

create table routes (
  route_id text primary key, name text not null, aliases text[] not null default '{}',
  polyline geography(LineString, 4326) not null, is_active boolean not null default true
);

create table checkpoints (
  checkpoint_id text primary key, name text not null, location geography(Point, 4326) not null,
  route_ids text[] not null, directions_covered text[] not null, duty_officers jsonb not null default '[]',
  shift_start time not null, shift_end time not null, is_active boolean not null default true
);

create table stations (
    station_id text primary key,
    name text not null,
    phone_number text,
    whatsapp text,
    location geography (Point, 4326) not null,
    is_active boolean not null default true
);

create sequence saferide_case_sequence start 1;

create or replace function next_saferide_case_sequence() returns bigint language sql as $$ select nextval('saferide_case_sequence'); $$;

create table reports (
  case_id text primary key, reporter_phone_hash text not null, reporter_phone_raw text not null,
  reported_at timestamptz not null default now(), location geography(Point, 4326), location_source text not null,
  location_label text, route_id text references routes(route_id), route_name text not null, direction_of_travel text,
  plate_number text, plate_confidence text not null, vehicle_description text, violation_type text not null,
  violation_detail text, media_url text, dispatched_checkpoint_id text, dispatch_target_name text,
  distance_ahead_km numeric, estimated_eta_minutes integer, dispatch_priority text not null default 'STANDARD',
  status text not null default 'Dispatched', officer_action text, officer_action_at timestamptz, officer_badge_id text,
  police_connect_ref_id text, corroborated boolean not null default false, linked_case_ids text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index reports_phone_idx on reports (
    reporter_phone_hash,
    reported_at desc
);

create index reports_plate_idx on reports (
    plate_number,
    reported_at desc
);

create index reports_location_idx on reports using gist (location);

create or replace function nearby_routes(lat double precision, lng double precision, max_km double precision default 3)
returns table(route_id text, name text, distance_km double precision) language sql stable as $$
 select r.route_id, r.name, st_distance(r.polyline, st_setsrid(st_makepoint(lng, lat),4326)::geography)/1000
 from routes r where r.is_active and st_dwithin(r.polyline, st_setsrid(st_makepoint(lng, lat),4326)::geography, max_km * 1000)
 order by r.polyline <-> st_setsrid(st_makepoint(lng, lat),4326)::geography limit 4;
$$;