create table public.event_ledger (
  id uuid primary key,
  environment text not null,
  contract_version integer not null,
  event_type text not null,
  event_version integer not null,
  occurred_at timestamptz,
  ingested_at timestamptz not null default now(),
  source_id uuid references public.data_sources (id) on delete restrict,
  provenance_record_id uuid references public.provenance_records (id) on delete restrict,
  external_event_id text,
  subject_type text,
  subject_id uuid,
  correlation_id uuid not null,
  causation_event_id uuid references public.event_ledger (id) on delete restrict,
  request_id uuid not null,
  request_body_sha256 text not null,
  payload jsonb not null,
  constraint event_ledger_environment_check check (environment in ('dev', 'prod')),
  constraint event_ledger_contract_version_check check (contract_version = 1),
  constraint event_ledger_event_type_check check (
    length(event_type) <= 128
    and event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint event_ledger_event_version_check check (event_version > 0),
  constraint event_ledger_external_event_id_check check (
    external_event_id is null or length(external_event_id) between 1 and 256
  ),
  constraint event_ledger_subject_type_check check (
    subject_type is null
    or (length(subject_type) <= 64 and subject_type ~ '^[a-z][a-z0-9_]*$')
  ),
  constraint event_ledger_subject_pair_check check (
    (subject_type is null) = (subject_id is null)
  ),
  constraint event_ledger_provenance_source_check check (
    provenance_record_id is null or source_id is not null
  ),
  constraint event_ledger_request_body_sha256_check check (
    request_body_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint event_ledger_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create index event_ledger_ingested_at_idx
  on public.event_ledger (ingested_at);

create index event_ledger_event_type_ingested_at_idx
  on public.event_ledger (event_type, ingested_at);

create index event_ledger_correlation_id_idx
  on public.event_ledger (correlation_id);

create index event_ledger_subject_idx
  on public.event_ledger (subject_type, subject_id)
  where subject_id is not null;

create index event_ledger_source_external_event_idx
  on public.event_ledger (source_id, external_event_id)
  where external_event_id is not null;

create or replace function public.reject_event_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'event_ledger is append-only';
  return null;
end;
$$;

revoke all on function public.reject_event_ledger_mutation() from public, anon, authenticated;

create trigger event_ledger_reject_update_delete
before update or delete on public.event_ledger
for each row execute function public.reject_event_ledger_mutation();

create trigger event_ledger_reject_truncate
before truncate on public.event_ledger
for each statement execute function public.reject_event_ledger_mutation();

alter table public.event_ledger enable row level security;

revoke all privileges on table public.event_ledger from anon, authenticated;
revoke update, delete, truncate on table public.event_ledger from service_role;
grant select, insert on table public.event_ledger to service_role;
