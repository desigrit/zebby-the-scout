-- Apply before deploying the counted-budget service. Safe to repeat.
-- Existing quotes remain readable but expire under the previous price version.
-- No balances, purchases, results or application databases are changed.
alter table public.zebby_quotes add column if not exists input_tokens integer
  check(input_tokens > 0);
alter table public.zebby_quotes add column if not exists output_limit integer
  check(output_limit > 0);

-- Derive Astra access from authoritative purchases, including existing purchases.
-- Spending the balance does not remove access; full refunds/disputes do.
create or replace function public.zebby_wallet(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w zebby_wallets; recent jsonb;
begin
  insert into zebby_wallets(user_id) values(p_user) on conflict do nothing;
  select * into w from zebby_wallets where user_id = p_user;
  select coalesce(jsonb_agg(item),'[]') into recent from (select jsonb_build_object(
    'id',id,'model',model,'kind',kind,'cost',cost,'createdAt',created_at) item
    from zebby_runs where user_id=p_user and status='completed' order by created_at desc limit 10) r;
  return jsonb_build_object('balance',w.balance,'reserved',w.reserved,'used',w.used,'purchased',w.purchased,
    'updatedAt',w.updated_at,'recent',recent,
    'astraUnlocked',exists(select 1 from zebby_purchases where user_id=p_user and paid
      and cents>=2000 and reversed<amount and not disputed));
end $$;

create or replace function public.zebby_reserve(p_user uuid,p_id uuid,p_quote uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w zebby_wallets; q zebby_quotes; r zebby_runs;
begin
  insert into zebby_wallets(user_id) values(p_user) on conflict do nothing;
  select * into w from zebby_wallets where user_id=p_user for update;
  select * into r from zebby_runs where id=p_id;
  if found then
    if r.user_id <> p_user or r.quote_id <> p_quote then raise exception 'Request already belongs to another analysis'; end if;
    return to_jsonb(r) || jsonb_build_object('fresh',false);
  end if;
  select * into q from zebby_quotes where id=p_quote for update;
  if not found or q.user_id<>p_user or q.content_hash<>p_hash then raise exception 'Invalid analysis quote'; end if;
  if q.expires_at<=now() or q.claimed_by is not null then raise exception 'Analysis quote expired or already used'; end if;
  if exists(select 1 from zebby_purchases where user_id=p_user and disputed) then raise exception 'Contact support about a disputed payment'; end if;
  if q.model='gpt-6-astra' and not exists(select 1 from zebby_purchases where user_id=p_user
    and paid and cents>=2000 and reversed<amount and not disputed) then
    raise exception 'GPT-6 Astra is included with a $20, $50 or $100 pack';
  end if;
  if w.balance-w.reserved<q.maximum then raise exception 'Not enough credits for this analysis'; end if;
  update zebby_quotes set claimed_by=p_id where id=p_quote;
  update zebby_wallets set reserved=reserved+q.maximum,updated_at=now() where user_id=p_user;
  insert into zebby_runs(id,user_id,quote_id,model,kind,maximum,status)
    values(p_id,p_user,p_quote,q.model,q.kind,q.maximum,'reserved') returning * into r;
  return to_jsonb(r) || jsonb_build_object('fresh',true);
end $$;

revoke all on function public.zebby_wallet(uuid), public.zebby_reserve(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.zebby_wallet(uuid), public.zebby_reserve(uuid,uuid,uuid,text) to service_role;
