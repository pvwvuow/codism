-- 13g_upgrade: request observability + timezone-aware KPIs
-- (head of file transcribed from opus output; RPC updates completed from task spec)

create table if not exists request_log (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  user_id uuid null references users(id) on delete set null,
  key_id uuid null references api_keys(id) on delete set null,
  route text not null,
  method text not null default 'POST',
  model text,
  status int not null,
  error_code text,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  latency_ms int
);

create index if not exists request_log_user_ts_idx on request_log (user_id, ts desc);
create index if not exists request_log_ts_idx on request_log (ts desc);

-- timezone-aware daily usage (Asia/Tehran = 210 min, fixed, no DST)
create or replace function usage_by_day(p_user uuid, p_days int, p_offset_min int default 0)
returns table (day date, prompt_tokens bigint, completion_tokens bigint, requests bigint)
language sql stable as $$
  select (created_at + make_interval(mins => p_offset_min))::date, coalesce(sum(prompt_tokens),0), coalesce(sum(completion_tokens),0), count(*)
  from usage_log where user_id = p_user and created_at >= now() - (p_days || ' days')::interval and status in (200,201)
  group by 1 order by 1 desc limit 60;
$$;

create or replace function admin_usage_by_day(p_days int, p_offset_min int default 0)
returns table (day date, requests bigint, tokens bigint)
language sql stable as $$
  select (created_at + make_interval(mins => p_offset_min))::date, count(*), coalesce(sum(prompt_tokens+completion_tokens),0)
  from usage_log where created_at >= now() - (p_days || ' days')::interval and status in (200,201)
  group by 1 order by 1 desc limit 60;
$$;

create or replace function admin_totals(p_offset_min int default 0)
returns table (users bigint, keys bigint, active_keys bigint, requests_today bigint, tokens_today bigint, failed_today bigint)
language sql stable as $$
  select
    (select count(*) from users),
    (select count(*) from api_keys),
    (select count(*) from api_keys where enabled),
    (select count(*) from usage_log where (created_at + make_interval(mins => p_offset_min))::date = (now() + make_interval(mins => p_offset_min))::date),
    (select coalesce(sum(prompt_tokens+completion_tokens),0) from usage_log where (created_at + make_interval(mins => p_offset_min))::date = (now() + make_interval(mins => p_offset_min))::date),
    (select count(*) from request_log where status >= 400 and (ts + make_interval(mins => p_offset_min))::date = (now() + make_interval(mins => p_offset_min))::date);
$$;
