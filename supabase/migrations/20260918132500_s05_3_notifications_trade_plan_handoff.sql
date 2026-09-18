create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  opportunity_id uuid not null
    references public.opportunities (id) on delete restrict,
  notification_type text not null default 'opportunity_alert',
  priority text not null default 'normal',
  title text not null,
  body text not null,
  status text not null default 'unread',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notifications_environment_check
    check (environment in ('dev', 'prod')),

  constraint notifications_type_check
    check (
      notification_type in (
        'opportunity_alert'
      )
    ),

  constraint notifications_priority_check
    check (
      priority in (
        'low',
        'normal',
        'high',
        'critical'
      )
    ),

  constraint notifications_status_check
    check (status in ('unread', 'read')),

  constraint notifications_title_check
    check (length(title) between 1 and 160),

  constraint notifications_body_check
    check (length(body) between 1 and 1000),

  constraint notifications_read_time_check
    check (
      (status = 'unread' and read_at is null)
      or (status = 'read' and read_at is not null)
    )
);

create unique index notifications_opportunity_type_uidx
  on public.notifications (
    environment,
    opportunity_id,
    notification_type
  );

create index notifications_environment_status_created_idx
  on public.notifications (
    environment,
    status,
    created_at desc
  );

create table public.trade_plan_requests (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  opportunity_id uuid not null
    references public.opportunities (id) on delete restrict,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trade_plan_requests_environment_check
    check (environment in ('dev', 'prod')),

  constraint trade_plan_requests_status_check
    check (status in ('pending', 'consumed', 'cancelled')),

  constraint trade_plan_requests_consumed_time_check
    check (
      (status = 'consumed' and consumed_at is not null)
      or (status <> 'consumed' and consumed_at is null)
    ),

  constraint trade_plan_requests_opportunity_unique
    unique (environment, opportunity_id)
);

create or replace function public.touch_s05_3_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notifications_touch_updated_at
before update on public.notifications
for each row execute function public.touch_s05_3_updated_at();

create trigger trade_plan_requests_touch_updated_at
before update on public.trade_plan_requests
for each row execute function public.touch_s05_3_updated_at();

create or replace function public.tc_qualify_opportunity(
  p_opportunity_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status
    into v_status
    from public.opportunities
   where id = p_opportunity_id
     and environment = p_environment
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_status = 'detected' then
    update public.opportunities
       set status = 'qualified'
     where id = p_opportunity_id
       and environment = p_environment;

    return jsonb_build_object(
      'result', 'qualified',
      'opportunity_id', p_opportunity_id
    );
  end if;

  if v_status in ('qualified', 'alerted', 'seen') then
    return jsonb_build_object(
      'result', 'replay',
      'opportunity_id', p_opportunity_id,
      'status', v_status
    );
  end if;

  return jsonb_build_object('result', 'invalid_state');
end;
$$;

create or replace function public.tc_alert_opportunity(
  p_opportunity_id uuid,
  p_environment text,
  p_priority text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_ticker text;
  v_direction text;
  v_notification_id uuid;
begin
  if p_priority not in ('low', 'normal', 'high', 'critical') then
    return jsonb_build_object('result', 'invalid_priority');
  end if;

  select status, ticker, direction
    into v_status, v_ticker, v_direction
    from public.opportunities
   where id = p_opportunity_id
     and environment = p_environment
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_status = 'detected' then
    return jsonb_build_object('result', 'must_qualify');
  end if;

  if v_status = 'qualified' then
    update public.opportunities
       set status = 'alerted'
     where id = p_opportunity_id
       and environment = p_environment;
  end if;

  insert into public.notifications (
    environment,
    opportunity_id,
    notification_type,
    priority,
    title,
    body
  )
  values (
    p_environment,
    p_opportunity_id,
    'opportunity_alert',
    p_priority,
    concat(v_ticker, ' opportunity ready for review'),
    concat(
      'Trading Company opportunity ',
      v_ticker,
      case
        when v_direction is null then ''
        else concat(' · ', upper(v_direction))
      end,
      ' has reached ALERTED.'
    )
  )
  on conflict (
    environment,
    opportunity_id,
    notification_type
  )
  do update set
    priority = excluded.priority
  returning id into v_notification_id;

  return jsonb_build_object(
    'result',
    case when v_status = 'qualified' then 'alerted' else 'replay' end,
    'opportunity_id', p_opportunity_id,
    'notification_id', v_notification_id
  );
end;
$$;

create or replace function public.tc_mark_opportunity_seen(
  p_opportunity_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_notification_id uuid;
begin
  select status
    into v_status
    from public.opportunities
   where id = p_opportunity_id
     and environment = p_environment
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select id
    into v_notification_id
    from public.notifications
   where environment = p_environment
     and opportunity_id = p_opportunity_id
     and notification_type = 'opportunity_alert'
   limit 1
   for update;

  if v_notification_id is null then
    return jsonb_build_object('result', 'notification_missing');
  end if;

  if v_status = 'alerted' then
    update public.opportunities
       set status = 'seen'
     where id = p_opportunity_id
       and environment = p_environment;
  elsif v_status <> 'seen' then
    return jsonb_build_object('result', 'invalid_state');
  end if;

  update public.notifications
     set status = 'read',
         read_at = coalesce(read_at, now())
   where id = v_notification_id
     and environment = p_environment
     and status <> 'read';

  return jsonb_build_object(
    'result',
    case when v_status = 'alerted' then 'seen' else 'replay' end,
    'opportunity_id', p_opportunity_id,
    'notification_id', v_notification_id
  );
end;
$$;

create or replace function public.tc_mark_notification_read(
  p_notification_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opportunity_id uuid;
begin
  select opportunity_id
    into v_opportunity_id
    from public.notifications
   where id = p_notification_id
     and environment = p_environment;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  return public.tc_mark_opportunity_seen(
    v_opportunity_id,
    p_environment
  );
end;
$$;

create or replace function public.tc_create_trade_plan_request(
  p_opportunity_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_request_id uuid;
  v_existing_status text;
begin
  select status
    into v_status
    from public.opportunities
   where id = p_opportunity_id
     and environment = p_environment
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_status <> 'seen' then
    return jsonb_build_object(
      'result',
      'must_be_seen',
      'status',
      v_status
    );
  end if;

  select id, status
    into v_request_id, v_existing_status
    from public.trade_plan_requests
   where environment = p_environment
     and opportunity_id = p_opportunity_id
   limit 1;

  if v_request_id is not null then
    return jsonb_build_object(
      'result', 'replay',
      'opportunity_id', p_opportunity_id,
      'trade_plan_request_id', v_request_id,
      'request_status', v_existing_status
    );
  end if;

  insert into public.trade_plan_requests (
    environment,
    opportunity_id
  )
  values (
    p_environment,
    p_opportunity_id
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'result', 'created',
    'opportunity_id', p_opportunity_id,
    'trade_plan_request_id', v_request_id,
    'request_status', 'pending'
  );
end;
$$;

alter table public.notifications enable row level security;
alter table public.trade_plan_requests enable row level security;

revoke all privileges on table public.notifications
  from anon, authenticated;
revoke all privileges on table public.trade_plan_requests
  from anon, authenticated;

revoke delete, truncate on table public.notifications
  from service_role;
revoke delete, truncate on table public.trade_plan_requests
  from service_role;

grant select, insert, update on table public.notifications
  to service_role;
grant select, insert, update on table public.trade_plan_requests
  to service_role;

revoke all on function public.touch_s05_3_updated_at()
  from public, anon, authenticated;
revoke all on function public.tc_qualify_opportunity(uuid, text)
  from public, anon, authenticated;
revoke all on function public.tc_alert_opportunity(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.tc_mark_opportunity_seen(uuid, text)
  from public, anon, authenticated;
revoke all on function public.tc_mark_notification_read(uuid, text)
  from public, anon, authenticated;
revoke all on function public.tc_create_trade_plan_request(uuid, text)
  from public, anon, authenticated;

grant execute on function public.tc_qualify_opportunity(uuid, text)
  to service_role;
grant execute on function public.tc_alert_opportunity(uuid, text, text)
  to service_role;
grant execute on function public.tc_mark_opportunity_seen(uuid, text)
  to service_role;
grant execute on function public.tc_mark_notification_read(uuid, text)
  to service_role;
grant execute on function public.tc_create_trade_plan_request(uuid, text)
  to service_role;
