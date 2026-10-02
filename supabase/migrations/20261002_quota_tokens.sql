-- quota_tokens: cost-weighted consumption metric (raw prompt+completion for non-Grok models)
alter table usage_log add column if not exists quota_tokens bigint;
update usage_log set quota_tokens = coalesce(prompt_tokens,0) + coalesce(completion_tokens,0) where quota_tokens is null;
drop function if exists usage_sum(uuid, timestamptz, timestamptz);
create or replace function usage_sum(p_user uuid, p_from timestamptz, p_to timestamptz)
returns table (prompt_tokens bigint, completion_tokens bigint, requests bigint, saved_tokens bigint, quota_tokens bigint)
language sql stable as $$
  select coalesce(sum(prompt_tokens),0), coalesce(sum(completion_tokens),0), count(*),
         coalesce(sum(saved_tokens),0),
         coalesce(sum(coalesce(quota_tokens, coalesce(prompt_tokens,0) + coalesce(completion_tokens,0))),0)
  from usage_log where user_id = p_user and created_at >= p_from and created_at < p_to
    and status in (200,201) and is_event = false;
$$;
-- unlimited plan discontinued
update users set plan='none' where plan='unlimited';

