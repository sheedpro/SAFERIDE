-- PostgREST may serialise a geography line differently between deployments.
-- The map API always consumes this explicit GeoJSON representation instead.
create or replace function saferide_route_geometries()
returns table(route_id text, map_polyline jsonb)
language sql stable
as $$
  select r.route_id, st_asgeojson(r.polyline::geometry)::jsonb
  from routes r;
$$;
