create table public.configuration_entries (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  namespace text not null,
  key text not null,
  value_type text not null,
  value_json jsonb not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuration_entries_environment_check check (
    environment in ('dev', 'prod')
  ),
  constraint configuration_entries_namespace_check check (
    namespace ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint configuration_entries_key_check check (
    key ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint configuration_entries_value_type_check check (
    value_type in ('boolean', 'number', 'string', 'json')
  ),
  constraint configuration_entries_value_json_type_check check (
    (value_type = 'boolean' and jsonb_typeof(value_json) = 'boolean')
    or (value_type = 'number' and jsonb_typeof(value_json) = 'number')
    or (value_type = 'string' and jsonb_typeof(value_json) = 'string')
    or (value_type = 'json' and jsonb_typeof(value_json) in ('array', 'object'))
  )
);

create unique index configuration_entries_identity_ci_unique
  on public.configuration_entries (environment, lower(namespace), lower(key));

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  key text not null,
  state text not null default 'disabled',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_environment_check check (
    environment in ('dev', 'prod')
  ),
  constraint feature_flags_key_check check (
    key ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint feature_flags_state_check check (
    state in ('disabled', 'shadow', 'enabled')
  )
);

create unique index feature_flags_identity_ci_unique
  on public.feature_flags (environment, lower(key));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

create trigger instruments_set_updated_at
before update on public.instruments
for each row execute function public.set_updated_at();

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

create trigger venue_instruments_set_updated_at
before update on public.venue_instruments
for each row execute function public.set_updated_at();

create trigger instrument_aliases_set_updated_at
before update on public.instrument_aliases
for each row execute function public.set_updated_at();

create trigger data_sources_set_updated_at
before update on public.data_sources
for each row execute function public.set_updated_at();

create trigger configuration_entries_set_updated_at
before update on public.configuration_entries
for each row execute function public.set_updated_at();

create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

alter table public.configuration_entries enable row level security;
alter table public.feature_flags enable row level security;

revoke all privileges on table public.configuration_entries from anon, authenticated;
revoke all privileges on table public.feature_flags from anon, authenticated;
