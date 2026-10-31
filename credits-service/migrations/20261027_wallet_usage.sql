-- Lifetime totals and complete daily usage, independent of the recent-row limit.
create or replace function public.zebby_wallet(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w zebby_wallets; recent jsonb; daily jsonb; today date := (now() at time zone 'UTC')::date;
begin
  insert into zebby_wallets(user_id) values(p_user) on conflict do nothing;
  select * into w from zebby_wallets where user_id = p_user;
  select coalesce(jsonb_agg(item),'[]') into recent from (select jsonb_build_object(
    'id',id,'model',model,'kind',kind,'cost',cost,'createdAt',created_at) item
    from zebby_runs where user_id=p_user and status='completed' order by created_at desc,id desc limit 10) r;
  with usage as (
    select (created_at at time zone 'UTC')::date as usage_day, count(*) as analyses, sum(cost) as cost
    from zebby_runs where user_id=p_user and status='completed'
      and created_at >= ((today-83)::timestamp at time zone 'UTC')
      and created_at < ((today+1)::timestamp at time zone 'UTC')
    group by 1
  ), days as (select today-83+offset_day as usage_day from generate_series(0,83) offset_day)
  select jsonb_agg(jsonb_build_object('date',to_char(days.usage_day,'YYYY-MM-DD'),
    'count',coalesce(usage.analyses,0),'cost',coalesce(usage.cost,0)) order by days.usage_day)
    into daily from days left join usage using(usage_day);
  return jsonb_build_object('balance',w.balance,'reserved',w.reserved,'used',w.used,'purchased',w.purchased,
    'updatedAt',w.updated_at,'recent',recent,'dailyUsage',daily,
    'completedAnalyses',(select count(*) from zebby_runs where user_id=p_user and status='completed'),
    'astraUnlocked',exists(select 1 from zebby_purchases where user_id=p_user and paid
      and cents>=2000 and reversed<amount and not disputed));
end $$;

revoke all on function public.zebby_wallet(uuid) from public,anon,authenticated;
grant execute on function public.zebby_wallet(uuid) to service_role;
