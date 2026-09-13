create table public.assets (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  asset_kind text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_asset_kind_check check (
    asset_kind in ('crypto', 'fiat', 'commodity', 'index', 'equity', 'fund', 'rate', 'other')
  )
);

create unique index assets_code_ci_unique
  on public.assets (lower(code));

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  canonical_code text not null,
  name text not null,
  instrument_type text not null,
  base_asset_id uuid references public.assets(id) on delete restrict,
  quote_asset_id uuid references public.assets(id) on delete restrict,
  underlying_asset_id uuid references public.assets(id) on delete restrict,
  settlement_asset_id uuid references public.assets(id) on delete restrict,
  contract_family text,
  expiry_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instruments_instrument_type_check check (
    instrument_type in (
      'spot',
      'perpetual',
      'dated_future',
      'option',
      'index_reference',
      'cfd',
      'fx_pair',
      'equity',
      'etf',
      'reference',
      'other'
    )
  )
);

create unique index instruments_canonical_code_ci_unique
  on public.instruments (lower(canonical_code));
create index instruments_base_asset_id_idx
  on public.instruments (base_asset_id);
create index instruments_quote_asset_id_idx
  on public.instruments (quote_asset_id);
create index instruments_underlying_asset_id_idx
  on public.instruments (underlying_asset_id);
create index instruments_settlement_asset_id_idx
  on public.instruments (settlement_asset_id);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  venue_type text not null,
  timezone_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_venue_type_check check (
    venue_type in ('exchange', 'broker', 'data_venue', 'index_provider', 'other')
  )
);

create unique index venues_code_ci_unique
  on public.venues (lower(code));

create table public.venue_instruments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  market_scope text not null default 'default',
  symbol text not null,
  display_name text,
  tick_size numeric(38, 18),
  quantity_step numeric(38, 18),
  contract_multiplier numeric(38, 18),
  trading_timezone text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_instruments_tick_size_positive check (
    tick_size is null or tick_size > 0
  ),
  constraint venue_instruments_quantity_step_positive check (
    quantity_step is null or quantity_step > 0
  ),
  constraint venue_instruments_contract_multiplier_positive check (
    contract_multiplier is null or contract_multiplier > 0
  ),
  constraint venue_instruments_valid_window_check check (
    valid_to is null or valid_to > valid_from
  )
);

create index venue_instruments_venue_id_idx
  on public.venue_instruments (venue_id);
create index venue_instruments_instrument_id_idx
  on public.venue_instruments (instrument_id);
create unique index venue_instruments_active_listing_ci_unique
  on public.venue_instruments (venue_id, lower(market_scope), lower(symbol))
  where valid_to is null;

create table public.instrument_aliases (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  alias text not null,
  instrument_id uuid references public.instruments(id) on delete restrict,
  venue_instrument_id uuid references public.venue_instruments(id) on delete restrict,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instrument_aliases_target_xor_check check (
    (instrument_id is not null) <> (venue_instrument_id is not null)
  ),
  constraint instrument_aliases_valid_window_check check (
    valid_to is null or valid_to > valid_from
  )
);

create index instrument_aliases_instrument_id_idx
  on public.instrument_aliases (instrument_id);
create index instrument_aliases_venue_instrument_id_idx
  on public.instrument_aliases (venue_instrument_id);
create unique index instrument_aliases_active_alias_ci_unique
  on public.instrument_aliases (lower(namespace), lower(alias))
  where valid_to is null;

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  source_type text not null,
  provider_name text,
  adapter_name text,
  adapter_version text,
  license_ref text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_sources_source_type_check check (
    source_type in ('exchange', 'broker', 'data_api', 'webhook', 'file', 'manual', 'derived', 'other')
  )
);

create unique index data_sources_code_ci_unique
  on public.data_sources (lower(code));

create table public.provenance_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete restrict,
  source_namespace text,
  external_record_id text,
  instrument_id uuid references public.instruments(id) on delete restrict,
  venue_instrument_id uuid references public.venue_instruments(id) on delete restrict,
  source_timestamp timestamptz,
  retrieved_at timestamptz not null default now(),
  adapter_name text,
  adapter_version text,
  payload_sha256 text,
  evidence_uri text,
  license_ref text,
  created_at timestamptz not null default now(),
  constraint provenance_records_payload_sha256_check check (
    payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create index provenance_records_source_id_idx
  on public.provenance_records (source_id);
create index provenance_records_external_record_id_idx
  on public.provenance_records (external_record_id);
create index provenance_records_instrument_id_idx
  on public.provenance_records (instrument_id);
create index provenance_records_venue_instrument_id_idx
  on public.provenance_records (venue_instrument_id);
create index provenance_records_source_timestamp_idx
  on public.provenance_records (source_timestamp);
create index provenance_records_retrieved_at_idx
  on public.provenance_records (retrieved_at);

alter table public.assets enable row level security;
alter table public.instruments enable row level security;
alter table public.venues enable row level security;
alter table public.venue_instruments enable row level security;
alter table public.instrument_aliases enable row level security;
alter table public.data_sources enable row level security;
alter table public.provenance_records enable row level security;

revoke all privileges on table public.assets from anon, authenticated;
revoke all privileges on table public.instruments from anon, authenticated;
revoke all privileges on table public.venues from anon, authenticated;
revoke all privileges on table public.venue_instruments from anon, authenticated;
revoke all privileges on table public.instrument_aliases from anon, authenticated;
revoke all privileges on table public.data_sources from anon, authenticated;
revoke all privileges on table public.provenance_records from anon, authenticated;
