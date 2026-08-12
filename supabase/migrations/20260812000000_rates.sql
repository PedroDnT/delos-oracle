-- BCB rate history, written by the rate-sync GitHub Action (service role)
-- and read publicly by the dashboard through the anon key.

create table public.rates (
  id bigint generated always as identity primary key,
  rate_type text not null,
  answer bigint not null,                     -- value scaled by 10^8 (Chainlink convention)
  raw_value double precision not null,        -- original BCB value
  real_world_date integer not null,           -- BCB reference date as YYYYMMDD
  bcb_timestamp timestamptz not null,         -- BCB reference date as a timestamp
  fetched_at timestamptz not null default now(),
  source text not null,                       -- e.g. "BCB-12"
  heartbeat_seconds integer not null,         -- max expected age before the rate counts as stale
  unique (rate_type, real_world_date)
);

comment on table public.rates is
  'Brazilian macro rates fetched from the BCB SGS API. One row per rate type per reference date.';

-- Anyone may read; only the service role (which bypasses RLS) may write.
alter table public.rates enable row level security;

create policy "rates are publicly readable"
  on public.rates for select
  using (true);

-- The dashboard reads this: the most recent row per rate type, with staleness
-- computed against the rate's own heartbeat. security_invoker keeps RLS
-- applied as the querying role.
create view public.latest_rates
  with (security_invoker = true) as
select distinct on (rate_type)
  rate_type,
  answer,
  raw_value,
  real_world_date,
  extract(epoch from bcb_timestamp)::bigint as "timestamp",
  source,
  (now() - bcb_timestamp) > make_interval(secs => heartbeat_seconds) as is_stale,
  heartbeat_seconds
from public.rates
order by rate_type, real_world_date desc;
