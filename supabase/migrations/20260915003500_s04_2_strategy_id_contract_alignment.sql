alter table public.opportunities
  drop constraint opportunities_strategy_id_check;

alter table public.opportunities
  add constraint opportunities_strategy_id_check
  check (
    length(strategy_id) between 1 and 64
    and strategy_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  );
