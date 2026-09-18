create table public.opportunity_snapshots (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null
    references public.opportunities (id) on delete restrict,
  environment text not null,
  capture_phase text not null,
  due_at timestamptz,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  captured_at timestamptz,
  object_key text,
  content_type text,
  width integer,
  height integer,
  renderer text not null default 'cloudflare_browser_run',
  renderer_version integer not null default 1,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint opportunity_snapshots_environment_check
    check (environment in ('dev', 'prod')),

  constraint opportunity_snapshots_capture_phase_check
    check (
      capture_phase in (
        'trigger',
        'plus_4h',
        'plus_12h',
        'plus_24h',
        'final'
      )
    ),

  constraint opportunity_snapshots_status_check
    check (
      status in (
        'pending',
        'capturing',
        'ready',
        'failed',
        'waiting_final'
      )
    ),

  constraint opportunity_snapshots_attempt_count_check
    check (attempt_count >= 0),

  constraint opportunity_snapshots_due_check
    check (
      (capture_phase = 'final' and status = 'waiting_final' and due_at is null)
      or (status <> 'waiting_final' and due_at is not null)
    ),

  constraint opportunity_snapshots_ready_fields_check
    check (
      status <> 'ready'
      or (
        captured_at is not null
        and object_key is not null
        and content_type is not null
        and width is not null
        and height is not null
      )
    ),

  constraint opportunity_snapshots_dimensions_check
    check (
      (width is null or width between 320 and 4096)
      and (height is null or height between 240 and 4096)
    ),

  constraint opportunity_snapshots_renderer_check
    check (
      length(renderer) between 1 and 64
      and renderer_version > 0
    ),

  constraint opportunity_snapshots_error_code_check
    check (
      last_error_code is null
      or (
        length(last_error_code) between 1 and 64
        and last_error_code ~ '^[a-z][a-z0-9_]*$'
      )
    )
);

create unique index opportunity_snapshots_opportunity_phase_uidx
  on public.opportunity_snapshots (opportunity_id, capture_phase);

create index opportunity_snapshots_due_idx
  on public.opportunity_snapshots (environment, status, due_at)
  where status in ('pending', 'failed');

create index opportunity_snapshots_opportunity_idx
  on public.opportunity_snapshots (opportunity_id, created_at);

create or replace function public.touch_opportunity_snapshot_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger opportunity_snapshots_touch_updated_at
before update on public.opportunity_snapshots
for each row execute function public.touch_opportunity_snapshot_updated_at();

alter table public.opportunity_snapshots enable row level security;

revoke all privileges on table public.opportunity_snapshots
  from anon, authenticated;

revoke delete, truncate on table public.opportunity_snapshots
  from service_role;

grant select, insert, update on table public.opportunity_snapshots
  to service_role;

revoke all on function public.touch_opportunity_snapshot_updated_at()
  from public, anon, authenticated;
