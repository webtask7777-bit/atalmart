-- 019_move_postgis_to_extensions.sql
--
-- Real fix for the Security Advisor "rls_disabled_in_public" finding on
-- public.spatial_ref_sys. PostGIS was installed into `public` (migration 007),
-- so its system table sits in the API-exposed schema, owned by supabase_admin
-- with SELECT granted to PUBLIC — nothing the `postgres` role can revoke or
-- RLS-enable (migration 018 confirmed that). Reinstalling PostGIS into the
-- `extensions` schema (Supabase's recommended home for it) takes the table
-- out of the API surface entirely.
--
-- Runs as ONE implicit transaction: sectors geometry is saved as WKT, the
-- three geo RPCs and the geometry column are dropped, PostGIS is re-created
-- in `extensions`, then everything is restored with `search_path =
-- public, extensions` so unqualified ST_* calls keep resolving.

create schema if not exists extensions;

-- 1) Preserve the 9 service-area polygons.
create temp table _sectors_bak as
  select id, ST_AsText(geometry) as wkt from public.sectors;

-- 2) Drop everything that depends on the PostGIS types.
drop function if exists public.contains_point(numeric, numeric);
drop function if exists public.nearest_sector(numeric, numeric);
drop function if exists public.list_sectors_geojson();
drop index if exists public.sectors_geom_gix;
alter table public.sectors drop column geometry;

-- 3) Move the extension.
drop extension postgis;
create extension postgis with schema extensions;

-- 4) Restore the column, data and index.
alter table public.sectors add column geometry extensions.geometry(Polygon, 4326);
update public.sectors s
   set geometry = extensions.ST_GeomFromText(b.wkt, 4326)
  from _sectors_bak b
 where b.id = s.id;
alter table public.sectors alter column geometry set not null;
create index sectors_geom_gix on public.sectors using gist (geometry);

-- 5) Recreate the RPCs (bodies identical to 007; search_path now includes
--    extensions so ST_* / geography / <-> resolve).
create or replace function public.contains_point(p_lat numeric, p_lng numeric)
returns table (sector_id uuid, sector_name text, pincode text)
language sql stable security definer
set search_path = public, extensions
as $$
  select s.id, s.name, s.pincode
  from public.sectors s
  where s.active = true
    and ST_Contains(s.geometry, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  limit 1;
$$;

create or replace function public.nearest_sector(p_lat numeric, p_lng numeric)
returns table (sector_id uuid, sector_name text, pincode text, distance_m numeric)
language sql stable security definer
set search_path = public, extensions
as $$
  select s.id, s.name, s.pincode,
         ROUND(
           ST_Distance(
             s.geometry::geography,
             ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
           )::numeric,
           1
         ) as distance_m
  from public.sectors s
  where s.active = true
  order by s.geometry <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  limit 1;
$$;

create or replace function public.list_sectors_geojson()
returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'name_hi', s.name_hi,
          'pincode', s.pincode,
          'area_type', s.area_type,
          'centroid', jsonb_build_array(s.centroid_lng, s.centroid_lat),
          'source', s.source
        ),
        'geometry', ST_AsGeoJSON(s.geometry)::jsonb
      )
      order by s.name
    ), '[]'::jsonb)
  )
  from public.sectors s
  where s.active = true;
$$;

grant execute on function public.contains_point(numeric, numeric) to anon, authenticated;
grant execute on function public.nearest_sector(numeric, numeric) to anon, authenticated;
grant execute on function public.list_sectors_geojson() to anon, authenticated;

notify pgrst, 'reload schema';

select
  (select count(*) from public.sectors where geometry is not null) as sectors_with_geometry,
  (select extnamespace::regnamespace::text from pg_extension where extname = 'postgis') as postgis_schema,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'spatial_ref_sys') as spatial_ref_sys_in_public,
  (select sector_name from public.contains_point(21.1698, 81.7725)) as test_contains_sector_21,
  (select sector_name || ' @ ' || distance_m || 'm' from public.nearest_sector(21.20, 81.80)) as test_nearest;
