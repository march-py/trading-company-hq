-- F-06: normalized Opportunity market identity.
-- Provider exchange/ticker remain source facts.

do $$
declare
  btc_id uuid;
  usdt_id uuid;
  spot_id uuid;
  binance_id uuid;
  binance_btcusdt_id uuid;
begin
  select id into btc_id from public.assets where lower(code) = 'btc' limit 1;
  if btc_id is null then
    insert into public.assets (code, name, asset_kind)
    values ('BTC', 'Bitcoin', 'crypto')
    returning id into btc_id;
  end if;

  select id into usdt_id from public.assets where lower(code) = 'usdt' limit 1;
  if usdt_id is null then
    insert into public.assets (code, name, asset_kind)
    values ('USDT', 'Tether USD', 'crypto')
    returning id into usdt_id;
  end if;

  select id into spot_id from public.instruments
   where lower(canonical_code) = lower('BTC/USDT:SPOT') limit 1;
  if spot_id is null then
    insert into public.instruments (
      canonical_code, name, instrument_type, base_asset_id, quote_asset_id
    ) values (
      'BTC/USDT:SPOT', 'BTC/USDT Spot', 'spot', btc_id, usdt_id
    ) returning id into spot_id;
  end if;

  select id into binance_id from public.venues where lower(code) = 'binance' limit 1;
  if binance_id is null then
    insert into public.venues (code, name, venue_type, timezone_name)
    values ('BINANCE', 'Binance', 'exchange', 'UTC')
    returning id into binance_id;
  end if;

  select id into binance_btcusdt_id
    from public.venue_instruments
   where venue_id = binance_id
     and lower(market_scope) = 'spot'
     and lower(symbol) = 'btcusdt'
     and valid_to is null
   limit 1;

  if binance_btcusdt_id is null then
    insert into public.venue_instruments (
      venue_id, instrument_id, market_scope, symbol, display_name, trading_timezone
    ) values (
      binance_id, spot_id, 'spot', 'BTCUSDT', 'BTC/USDT Spot', 'UTC'
    ) returning id into binance_btcusdt_id;
  end if;

  if not exists (
    select 1 from public.instrument_aliases
     where lower(namespace) = 'tradingview'
       and lower(alias) = lower('BINANCE:BTCUSDT')
       and valid_to is null
  ) then
    insert into public.instrument_aliases (
      namespace, alias, venue_instrument_id
    ) values (
      'tradingview', 'BINANCE:BTCUSDT', binance_btcusdt_id
    );
  end if;
end
$$;

alter table public.opportunities add column instrument_id uuid;
alter table public.opportunities add column venue_instrument_id uuid;

alter table public.opportunities
  add constraint opportunities_instrument_id_fk
    foreign key (instrument_id)
    references public.instruments(id)
    on delete restrict;

alter table public.opportunities
  add constraint opportunities_venue_instrument_id_fk
    foreign key (venue_instrument_id)
    references public.venue_instruments(id)
    on delete restrict;

update public.opportunities o
   set instrument_id = vi.instrument_id,
       venue_instrument_id = vi.id
  from public.instrument_aliases ia
  join public.venue_instruments vi
    on vi.id = ia.venue_instrument_id
 where lower(ia.namespace) = 'tradingview'
   and lower(ia.alias) = lower(o.exchange || ':' || o.ticker)
   and ia.valid_to is null
   and o.instrument_id is null;

do $$
begin
  if exists (select 1 from public.opportunities where instrument_id is null) then
    raise exception
      'F-06 migration refused: historical opportunity has no verified instrument mapping';
  end if;
end
$$;

alter table public.opportunities alter column instrument_id set not null;

create index opportunities_instrument_triggered_idx
  on public.opportunities (environment, instrument_id, triggered_at);

create index opportunities_venue_instrument_triggered_idx
  on public.opportunities (environment, venue_instrument_id, triggered_at)
  where venue_instrument_id is not null;

create or replace function public.enforce_opportunity_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source_event_id is distinct from new.source_event_id
     or old.environment is distinct from new.environment
     or old.dedupe_key_sha256 is distinct from new.dedupe_key_sha256
     or old.instrument_id is distinct from new.instrument_id
     or old.venue_instrument_id is distinct from new.venue_instrument_id then
    raise exception 'opportunity identity is immutable';
  end if;

  if old.status = new.status then
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'detected' and new.status = 'qualified' then
    new.qualified_at := coalesce(new.qualified_at, now());
  elsif old.status = 'qualified' and new.status = 'alerted' then
    new.alerted_at := coalesce(new.alerted_at, now());
  elsif old.status = 'alerted' and new.status = 'seen' then
    new.seen_at := coalesce(new.seen_at, now());
  else
    raise exception 'invalid opportunity lifecycle transition: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
