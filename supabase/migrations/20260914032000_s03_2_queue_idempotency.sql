alter table public.event_ledger
  add column idempotency_key_sha256 text;

alter table public.event_ledger
  add constraint event_ledger_idempotency_key_sha256_check
  check (
    idempotency_key_sha256 is null
    or idempotency_key_sha256 ~ '^[0-9a-f]{64}$'
  );

create unique index event_ledger_environment_idempotency_key_uidx
  on public.event_ledger (environment, idempotency_key_sha256)
  where idempotency_key_sha256 is not null;

create table public.event_processing_receipts (
  event_id uuid primary key
    references public.event_ledger (id) on delete restrict,
  environment text not null,
  status text not null,
  attempt_count integer not null default 0,
  last_queue_message_id text,
  first_started_at timestamptz,
  processed_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  constraint event_processing_receipts_environment_check
    check (environment in ('dev', 'prod')),
  constraint event_processing_receipts_status_check
    check (status in ('processing', 'succeeded')),
  constraint event_processing_receipts_attempt_count_check
    check (attempt_count >= 0),
  constraint event_processing_receipts_queue_message_id_check
    check (
      last_queue_message_id is null
      or length(last_queue_message_id) between 1 and 256
    ),
  constraint event_processing_receipts_error_code_check
    check (
      last_error_code is null
      or (
        length(last_error_code) <= 64
        and last_error_code ~ '^[a-z][a-z0-9_]*$'
      )
    )
);

create index event_processing_receipts_status_idx
  on public.event_processing_receipts
  (environment, status, last_attempt_at);

alter table public.event_processing_receipts enable row level security;

revoke all privileges on table public.event_processing_receipts
  from anon, authenticated;

revoke delete, truncate on table public.event_processing_receipts
  from service_role;

grant select, insert, update on table public.event_processing_receipts
  to service_role;

create table public.event_dead_letters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid
    references public.event_ledger (id) on delete restrict,
  environment text not null,
  queue_message_id text not null,
  observed_at timestamptz not null default now(),
  failure_code text not null,
  payload jsonb not null,
  constraint event_dead_letters_environment_check
    check (environment in ('dev', 'prod')),
  constraint event_dead_letters_queue_message_id_check
    check (length(queue_message_id) between 1 and 256),
  constraint event_dead_letters_failure_code_check
    check (
      length(failure_code) <= 64
      and failure_code ~ '^[a-z][a-z0-9_]*$'
    ),
  constraint event_dead_letters_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint event_dead_letters_payload_size_check
    check (pg_column_size(payload) <= 32768)
);

create unique index event_dead_letters_queue_message_id_uidx
  on public.event_dead_letters (queue_message_id);

create index event_dead_letters_event_observed_idx
  on public.event_dead_letters (event_id, observed_at)
  where event_id is not null;

create or replace function public.reject_event_dead_letters_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'event_dead_letters is append-only';
  return null;
end;
$$;

revoke all on function public.reject_event_dead_letters_mutation()
  from public, anon, authenticated;

create trigger event_dead_letters_reject_update_delete
before update or delete on public.event_dead_letters
for each row execute function public.reject_event_dead_letters_mutation();

create trigger event_dead_letters_reject_truncate
before truncate on public.event_dead_letters
for each statement execute function public.reject_event_dead_letters_mutation();

alter table public.event_dead_letters enable row level security;

revoke all privileges on table public.event_dead_letters
  from anon, authenticated;

revoke update, delete, truncate on table public.event_dead_letters
  from service_role;

grant select, insert on table public.event_dead_letters
  to service_role;
