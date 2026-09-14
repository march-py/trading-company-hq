create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  source_event_id uuid not null
    references public.event_ledger (id) on delete restrict,
  dedupe_key_sha256 text not null,
  status text not null default 'detected',

  strategy_id text not null,
  strategy_version integer not null,
  exchange text not null,
  ticker text not null,
  interval text not null,
  triggered_at timestamptz not null,
  direction text,
  setup_key text,

  detected_at timestamptz not null default now(),
  qualified_at timestamptz,
  alerted_at timestamptz,
  seen_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint opportunities_environment_check
    check (environment in ('dev', 'prod')),

  constraint opportunities_dedupe_key_check
    check (dedupe_key_sha256 ~ '^[0-9a-f]{64}$'),

  constraint opportunities_status_check
    check (
      status in (
        'detected',
        'qualified',
        'alerted',
        'seen'
      )
    ),

  constraint opportunities_strategy_id_check
    check (
      length(strategy_id) between 1 and 64
      and strategy_id ~ '^[a-z][a-z0-9_]*$'
    ),

  constraint opportunities_strategy_version_check
    check (strategy_version > 0),

  constraint opportunities_exchange_check
    check (length(exchange) between 1 and 64),

  constraint opportunities_ticker_check
    check (length(ticker) between 1 and 128),

  constraint opportunities_interval_check
    check (length(interval) between 1 and 32),

  constraint opportunities_direction_check
    check (
      direction is null
      or direction in ('long', 'short', 'neutral')
    ),

  constraint opportunities_setup_key_check
    check (
      setup_key is null
      or length(setup_key) between 1 and 128
    ),

  constraint opportunities_lifecycle_time_check
    check (
      (qualified_at is null or qualified_at >= detected_at)
      and (alerted_at is null or qualified_at is not null)
      and (alerted_at is null or alerted_at >= qualified_at)
      and (seen_at is null or alerted_at is not null)
      and (seen_at is null or seen_at >= alerted_at)
    )
);

create unique index opportunities_environment_source_event_uidx
  on public.opportunities (environment, source_event_id);

create unique index opportunities_environment_dedupe_uidx
  on public.opportunities (environment, dedupe_key_sha256);

create index opportunities_environment_status_created_idx
  on public.opportunities (environment, status, created_at);

create index opportunities_strategy_triggered_idx
  on public.opportunities (
    environment,
    strategy_id,
    triggered_at
  );


create table public.opportunity_transitions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null
    references public.opportunities (id) on delete restrict,
  environment text not null,
  from_status text,
  to_status text not null,
  transitioned_at timestamptz not null default now(),
  reason_code text,

  constraint opportunity_transitions_environment_check
    check (environment in ('dev', 'prod')),

  constraint opportunity_transitions_from_status_check
    check (
      from_status is null
      or from_status in (
        'detected',
        'qualified',
        'alerted',
        'seen'
      )
    ),

  constraint opportunity_transitions_to_status_check
    check (
      to_status in (
        'detected',
        'qualified',
        'alerted',
        'seen'
      )
    ),

  constraint opportunity_transitions_reason_code_check
    check (
      reason_code is null
      or (
        length(reason_code) <= 64
        and reason_code ~ '^[a-z][a-z0-9_]*$'
      )
    )
);

create index opportunity_transitions_opportunity_time_idx
  on public.opportunity_transitions (
    opportunity_id,
    transitioned_at
  );


create or replace function public.enforce_opportunity_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source_event_id is distinct from new.source_event_id
     or old.environment is distinct from new.environment
     or old.dedupe_key_sha256 is distinct from new.dedupe_key_sha256 then
    raise exception 'opportunity identity is immutable';
  end if;

  if old.status = new.status then
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'detected'
     and new.status = 'qualified' then
    new.qualified_at := coalesce(new.qualified_at, now());

  elsif old.status = 'qualified'
     and new.status = 'alerted' then
    new.alerted_at := coalesce(new.alerted_at, now());

  elsif old.status = 'alerted'
     and new.status = 'seen' then
    new.seen_at := coalesce(new.seen_at, now());

  else
    raise exception
      'invalid opportunity lifecycle transition: % -> %',
      old.status,
      new.status;
  end if;

  new.updated_at := now();

  return new;
end;
$$;


create or replace function public.record_opportunity_insert_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.opportunity_transitions (
    opportunity_id,
    environment,
    from_status,
    to_status,
    transitioned_at
  )
  values (
    new.id,
    new.environment,
    null,
    'detected',
    new.detected_at
  );

  return new;
end;
$$;


create or replace function public.record_opportunity_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.opportunity_transitions (
      opportunity_id,
      environment,
      from_status,
      to_status,
      transitioned_at
    )
    values (
      new.id,
      new.environment,
      old.status,
      new.status,
      now()
    );
  end if;

  return new;
end;
$$;


create trigger opportunities_enforce_lifecycle
before update on public.opportunities
for each row execute function public.enforce_opportunity_lifecycle();

create trigger opportunities_record_initial_transition
after insert on public.opportunities
for each row execute function public.record_opportunity_insert_transition();

create trigger opportunities_record_status_transition
after update of status on public.opportunities
for each row execute function public.record_opportunity_status_transition();


create or replace function public.reject_opportunity_transition_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'opportunity_transitions is append-only';
  return null;
end;
$$;

create trigger opportunity_transitions_reject_update_delete
before update or delete on public.opportunity_transitions
for each row execute function public.reject_opportunity_transition_mutation();

create trigger opportunity_transitions_reject_truncate
before truncate on public.opportunity_transitions
for each statement execute function public.reject_opportunity_transition_mutation();


alter table public.opportunities enable row level security;
alter table public.opportunity_transitions enable row level security;

revoke all privileges on table public.opportunities
  from anon, authenticated;

revoke all privileges on table public.opportunity_transitions
  from anon, authenticated;

revoke delete, truncate on table public.opportunities
  from service_role;

revoke update, delete, truncate on table public.opportunity_transitions
  from service_role;

grant select, insert, update on table public.opportunities
  to service_role;

grant select, insert on table public.opportunity_transitions
  to service_role;

revoke all on function public.enforce_opportunity_lifecycle()
  from public, anon, authenticated;

revoke all on function public.record_opportunity_insert_transition()
  from public, anon, authenticated;

revoke all on function public.record_opportunity_status_transition()
  from public, anon, authenticated;

revoke all on function public.reject_opportunity_transition_mutation()
  from public, anon, authenticated;
