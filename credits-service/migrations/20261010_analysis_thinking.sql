-- Add only quote metadata. Existing wallets, ledger entries and results are preserved.
alter table public.zebby_quotes add column if not exists thinking_level text not null default 'low'
  check(thinking_level in ('low','medium','high','xhigh','max'));
