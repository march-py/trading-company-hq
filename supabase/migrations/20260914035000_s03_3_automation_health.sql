create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  job_key text not null,
  job_version integer not null,
  adapter_key text not null,
  scheduled_for timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automation_runs_environment_check
    check (environment in ('dev', 'prod')),

  constraint automation_runs_job_key_check
    check (job_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),

  constraint automation_runs_job_version_check
    check (job_version > 0),

  constraint automation_runs_adapter_key_check
    check (adapter_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),

  constraint automation_runs_status_check
    check (status in ('running', 'succeeded', 'failed', 'skipped')),

  constraint automation_runs_failure_code_check
    check (
      failure_code is null
      or failure_code ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    ),

  constraint automation_runs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),

  constraint automation_runs_metadata_size_check
    check (pg_column_size(metadata) <= 16384),

  constraint automation_runs_finished_at_check
    check (
      finished_at is null
      or finished_at >= started_at
    ),

  constraint automation_runs_environment_job_scheduled_key
    unique (environment, job_key, scheduled_for)
);

create index automation_runs_environment_scheduled_idx
  on public.automation_runs (environment, scheduled_for desc);

create index automation_runs_environment_status_idx
  on public.automation_runs (environment, status, scheduled_for desc);

create trigger automation_runs_set_updated_at
before update on public.automation_runs
for each row execute function public.set_updated_at();

alter table public.automation_runs enable row level security;

revoke all privileges on table public.automation_runs from public;
revoke all privileges on table public.automation_runs from anon;
revoke all privileges on table public.automation_runs from authenticated;

grant select, insert, update
  on table public.automation_runs
  to service_role;

revoke delete, truncate
  on table public.automation_runs
  from service_role;


create table public.automation_heartbeats (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  component text not null,
  source text not null,
  status text not null,
  observed_at timestamptz not null,
  run_id uuid references public.automation_runs(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint automation_heartbeats_environment_check
    check (environment in ('dev', 'prod')),

  constraint automation_heartbeats_component_check
    check (component ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),

  constraint automation_heartbeats_source_check
    check (source ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),

  constraint automation_heartbeats_status_check
    check (status in ('healthy', 'degraded', 'failed')),

  constraint automation_heartbeats_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),

  constraint automation_heartbeats_metadata_size_check
    check (pg_column_size(metadata) <= 16384)
);

create index automation_heartbeats_environment_observed_idx
  on public.automation_heartbeats (environment, observed_at desc);

create index automation_heartbeats_run_idx
  on public.automation_heartbeats (run_id)
  where run_id is not null;

create or replace function public.reject_automation_heartbeats_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'automation_heartbeats is append-only';
end;
$$;

revoke all on function public.reject_automation_heartbeats_mutation() from public;

create trigger automation_heartbeats_reject_update_delete
before update or delete on public.automation_heartbeats
for each row execute function public.reject_automation_heartbeats_mutation();

create trigger automation_heartbeats_reject_truncate
before truncate on public.automation_heartbeats
for each statement execute function public.reject_automation_heartbeats_mutation();

alter table public.automation_heartbeats enable row level security;

revoke all privileges on table public.automation_heartbeats from public;
revoke all privileges on table public.automation_heartbeats from anon;
revoke all privileges on table public.automation_heartbeats from authenticated;

grant select, insert
  on table public.automation_heartbeats
  to service_role;

revoke update, delete, truncate
  on table public.automation_heartbeats
  from service_role;
