create or replace function route_progress(line_value text, point_value text) returns double precision language sql immutable as $$ select st_linelocatepoint(st_geomfromtext(line_value,4326), st_geomfromtext(point_value,4326)); $$;

create or replace function checkpoint_progress(route_value text, checkpoint_value text) returns double precision language sql stable as $$ select st_linelocatepoint(st_geomfromtext(route_value,4326), location::geometry) from checkpoints where checkpoint_id=checkpoint_value; $$;

create or replace function route_length_km(route_value text) returns double precision language sql immutable as $$ select st_length(st_geomfromtext(route_value,4326)::geography)/1000; $$;

create or replace function dispatch_checkpoint(route_key text, lat double precision, lng double precision, travel_direction text)
returns table(checkpoint_id text, name text, distance_ahead_km double precision, checkpoint_lat double precision, checkpoint_lng double precision) language sql stable as $$
  with corridor as (select polyline::geometry as line from routes where route_id = route_key),
  current_position as (select st_linelocatepoint(line, st_setsrid(st_makepoint(lng,lat),4326)) as progress, line from corridor),
  candidates as (
    select c.*, st_linelocatepoint(p.line, c.location::geometry) as progress, p.progress as reporter_progress, p.line
    from checkpoints c cross join current_position p
    where c.is_active and route_key = any(c.route_ids) and travel_direction = any(c.directions_covered)
  )
  select checkpoint_id, name,
    abs(progress - reporter_progress) * st_length(line::geography) / 1000,
    st_y(location::geometry), st_x(location::geometry)
  from candidates
  where (travel_direction = 'westbound' and progress < reporter_progress)
     or (travel_direction <> 'westbound' and progress > reporter_progress)
    and (shift_start <= shift_end and (now() at time zone 'Africa/Kampala')::time between shift_start and shift_end
      or shift_start > shift_end and ((now() at time zone 'Africa/Kampala')::time >= shift_start or (now() at time zone 'Africa/Kampala')::time <= shift_end))
  order by case when travel_direction = 'westbound' then reporter_progress - progress else progress - reporter_progress end
  limit 1;
$$;

create or replace function nearest_active_station(lat double precision, lng double precision)
returns table(station_id text, name text, phone_number text, whatsapp text, station_lat double precision, station_lng double precision) language sql stable as $$
  select station_id, name, phone_number, whatsapp, st_y(location::geometry), st_x(location::geometry) from stations where is_active
  order by location <-> st_setsrid(st_makepoint(lng,lat),4326)::geography limit 1;
$$;