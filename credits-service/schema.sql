-- Run once in the Supabase SQL editor. Browser clients have no ledger access.
create table if not exists public.zebby_wallets (
  user_id uuid primary key, balance bigint not null default 0, reserved bigint not null default 0,
  used bigint not null default 0, purchased bigint not null default 0, updated_at timestamptz not null default now(),
  check (reserved >= 0 and used >= 0 and purchased >= 0)
);
create table if not exists public.zebby_purchases (
  id uuid primary key, user_id uuid not null, pack text not null, cents integer not null check(cents > 0),
  amount bigint not null check(amount > 0), session_id text unique, payment_id text unique,
  paid boolean not null default false, reversed bigint not null default 0, disputed boolean not null default false,
  created_at timestamptz not null default now(), check(reversed >= 0 and reversed <= amount)
);
create table if not exists public.zebby_quotes (
  id uuid primary key, user_id uuid not null, model text not null, kind text not null check(kind in ('plan','match')),
  content_hash text not null, maximum bigint not null check(maximum > 0), price_version text not null,
  expires_at timestamptz not null, claimed_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.zebby_runs (
  id uuid primary key, user_id uuid not null, quote_id uuid not null references public.zebby_quotes(id),
  model text not null, kind text not null, maximum bigint not null, cost bigint not null default 0,
  status text not null check(status in ('reserved','completed','failed')), result jsonb,
  expires_at timestamptz not null default now() + interval '10 minutes', created_at timestamptz not null default now()
);
create table if not exists public.zebby_ledger (
  id bigint generated always as identity primary key, user_id uuid not null, reference uuid not null,
  kind text not null, delta bigint not null, created_at timestamptz not null default now()
);
alter table public.zebby_ledger drop constraint if exists zebby_ledger_reference_kind_delta_key;
create unique index if not exists zebby_ledger_once on public.zebby_ledger(reference,kind) where kind in ('purchase','analysis');
create table if not exists public.zebby_stripe_events (id text primary key, created_at timestamptz not null default now());
create index if not exists zebby_runs_user on public.zebby_runs(user_id,created_at desc);
create index if not exists zebby_purchase_user on public.zebby_purchases(user_id);

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
    'updatedAt',w.updated_at,'recent',recent);
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
  if w.balance-w.reserved<q.maximum then raise exception 'Not enough credits for this analysis'; end if;
  update zebby_quotes set claimed_by=p_id where id=p_quote;
  update zebby_wallets set reserved=reserved+q.maximum,updated_at=now() where user_id=p_user;
  insert into zebby_runs(id,user_id,quote_id,model,kind,maximum,status)
    values(p_id,p_user,p_quote,q.model,q.kind,q.maximum,'reserved') returning * into r;
  return to_jsonb(r) || jsonb_build_object('fresh',true);
end $$;

create or replace function public.zebby_finish(p_user uuid,p_id uuid,p_cost bigint,p_result jsonb,p_success boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r zebby_runs;
begin
  perform 1 from zebby_wallets where user_id=p_user for update;
  select * into r from zebby_runs where id=p_id and user_id=p_user for update;
  if not found then raise exception 'Analysis not found'; end if;
  if r.status <> 'reserved' then return to_jsonb(r); end if;
  if p_cost<0 or p_cost>r.maximum or (p_success and p_result is null) then raise exception 'Invalid analysis settlement'; end if;
  if not p_success then p_cost:=0; p_result:=null; end if;
  update zebby_wallets set reserved=reserved-r.maximum,balance=balance-p_cost,used=used+p_cost,updated_at=now() where user_id=p_user;
  update zebby_runs set cost=p_cost,result=p_result,status=case when p_success then 'completed' else 'failed' end
    where id=p_id returning * into r;
  if p_success then insert into zebby_ledger(user_id,reference,kind,delta) values(p_user,p_id,'analysis',-p_cost); end if;
  return to_jsonb(r);
end $$;

create or replace function public.zebby_payment(p_event text,p_purchase uuid,p_session text,p_payment text,p_cents integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare p zebby_purchases;
begin
  select * into p from zebby_purchases where id=p_purchase;
  if not found then raise exception 'Purchase not found'; end if;
  insert into zebby_wallets(user_id) values(p.user_id) on conflict do nothing;
  perform 1 from zebby_wallets where user_id=p.user_id for update;
  select * into p from zebby_purchases where id=p_purchase for update;
  if p.session_id is distinct from p_session or p.cents<>p_cents or p_payment is null then raise exception 'Payment does not match purchase'; end if;
  insert into zebby_stripe_events(id) values(p_event) on conflict do nothing;
  if not found or p.paid then return false; end if;
  update zebby_purchases set paid=true,payment_id=p_payment where id=p_purchase;
  update zebby_wallets set balance=balance+p.amount,purchased=purchased+p.amount,updated_at=now() where user_id=p.user_id;
  insert into zebby_ledger(user_id,reference,kind,delta) values(p.user_id,p.id,'purchase',p.amount);
  return true;
end $$;

create or replace function public.zebby_reverse(p_event text,p_payment text,p_refunded integer,p_disputed boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare p zebby_purchases; target bigint; change bigint;
begin
  select * into p from zebby_purchases where payment_id=p_payment and paid;
  if not found then raise exception 'Paid purchase not found'; end if;
  perform 1 from zebby_wallets where user_id=p.user_id for update;
  select * into p from zebby_purchases where id=p.id for update;
  insert into zebby_stripe_events(id) values(p_event) on conflict do nothing;
  if not found then return false; end if;
  if p_refunded<0 or p_refunded>p.cents then raise exception 'Invalid refund amount'; end if;
  target:=floor(p.amount::numeric*p_refunded/p.cents);
  change:=greatest(0,target-p.reversed);
  update zebby_purchases set reversed=reversed+change,disputed=p_disputed where id=p.id;
  update zebby_wallets set balance=balance-change,updated_at=now() where user_id=p.user_id;
  if change>0 then insert into zebby_ledger(user_id,reference,kind,delta) values(p.user_id,p.id,'refund',-change); end if;
  return true;
end $$;

create or replace function public.zebby_cleanup() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select id,user_id from zebby_runs where status='reserved' and expires_at<now() loop
    perform zebby_finish(r.user_id,r.id,0,null,false);
  end loop;
  update zebby_runs set result=null where created_at<now()-interval '24 hours' and result is not null;
  delete from zebby_quotes where expires_at<now()-interval '1 day' and claimed_by is null;
end $$;

alter table public.zebby_wallets enable row level security;
alter table public.zebby_purchases enable row level security;
alter table public.zebby_quotes enable row level security;
alter table public.zebby_runs enable row level security;
alter table public.zebby_ledger enable row level security;
alter table public.zebby_stripe_events enable row level security;
revoke all on public.zebby_wallets,public.zebby_purchases,public.zebby_quotes,public.zebby_runs,public.zebby_ledger,public.zebby_stripe_events from anon,authenticated;
revoke all on function public.zebby_wallet(uuid),public.zebby_reserve(uuid,uuid,uuid,text),
  public.zebby_finish(uuid,uuid,bigint,jsonb,boolean),public.zebby_payment(text,uuid,text,text,integer),
  public.zebby_reverse(text,text,integer,boolean),public.zebby_cleanup() from public,anon,authenticated;
grant execute on function public.zebby_wallet(uuid),public.zebby_reserve(uuid,uuid,uuid,text),
  public.zebby_finish(uuid,uuid,bigint,jsonb,boolean),public.zebby_payment(text,uuid,text,text,integer),
  public.zebby_reverse(text,text,integer,boolean),public.zebby_cleanup() to service_role;
grant all on public.zebby_wallets,public.zebby_purchases,public.zebby_quotes,public.zebby_runs,public.zebby_ledger,public.zebby_stripe_events to service_role;
grant usage,select on sequence public.zebby_ledger_id_seq to service_role;
