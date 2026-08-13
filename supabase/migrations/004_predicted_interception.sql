-- A location pin is a snapshot. This predicts the vehicle's progress along its
-- selected route before choosing a checkpoint, and excludes checkpoints already
-- attempted during a re-dispatch.
alter table reports add column if not exists predicted_lat double precision;
alter table reports add column if not exists predicted_lng double precision;
alter table reports add column if not exists prediction_confidence text not null default 'LOW';
alter table reports add column if not exists interception_attempts jsonb not null default '[]';
alter table reports add column if not exists redispatch_count integer not null default 0;

create or replace function predicted_dispatch_checkpoint(
  route_key text,
  lat double precision,
  lng double precision,
  travel_direction text,
  reported_at timestamptz,
  speed_kmh double precision,
  excluded_checkpoint_ids text[] default '{}'
)
returns table(
  checkpoint_id text,
  name text,
  distance_ahead_km double precision,
  checkpoint_lat double precision,
  checkpoint_lng double precision,
  predicted_lat double precision,
  predicted_lng double precision,
  minutes_since_report integer
)
language sql stable as $$
  with corridor as (
    select polyline::geometry as line, st_length(polyline) as line_degrees,
      st_length(polyline::geometry::geography) / 1000 as route_km
    from routes where route_id = route_key and is_active
  ), vehicle as (
    select line, route_km,
      greatest(0, extract(epoch from (now() - reported_at)) / 60)::integer as elapsed_minutes,
      st_linelocatepoint(line, st_setsrid(st_makepoint(lng, lat), 4326)) as reported_progress
    from corridor
  ), predicted as (
    select line, route_km, elapsed_minutes,
      least(1::double precision, greatest(0::double precision,
        reported_progress + case when travel_direction = 'westbound'
          then -1 else 1 end * (speed_kmh * elapsed_minutes / 60) / nullif(route_km, 0)
      )) as progress
    from vehicle
  ), candidates as (
    select c.*, p.line, p.progress as vehicle_progress, p.elapsed_minutes,
      st_linelocatepoint(p.line, c.location::geometry) as checkpoint_progress,
      st_lineinterpolatepoint(p.line, p.progress) as predicted_point
    from checkpoints c cross join predicted p
    where c.is_active
      and route_key = any(c.route_ids)
      and travel_direction = any(c.directions_covered)
      and not (c.checkpoint_id = any(excluded_checkpoint_ids))
      and ((c.shift_start <= c.shift_end and (now() at time zone 'Africa/Kampala')::time between c.shift_start and c.shift_end)
        or (c.shift_start > c.shift_end and ((now() at time zone 'Africa/Kampala')::time >= c.shift_start or (now() at time zone 'Africa/Kampala')::time <= c.shift_end)))
  )
  select checkpoint_id, name,
    abs(checkpoint_progress - vehicle_progress) * st_length(line::geography) / 1000,
    st_y(location::geometry), st_x(location::geometry),
    st_y(predicted_point), st_x(predicted_point), elapsed_minutes
  from candidates
  where (travel_direction = 'westbound' and checkpoint_progress < vehicle_progress)
     or (travel_direction <> 'westbound' and checkpoint_progress > vehicle_progress)
  order by case when travel_direction = 'westbound' then vehicle_progress - checkpoint_progress else checkpoint_progress - vehicle_progress end
  limit 1;
$$;
