-- Run after 20261010_analysis_thinking.sql and before deploying Luna support.
-- Broaden quote metadata validation only. Existing data and balances are retained.
begin;
alter table public.zebby_quotes drop constraint if exists zebby_quotes_thinking_level_check;
alter table public.zebby_quotes add constraint zebby_quotes_thinking_level_check
  check(thinking_level in ('off','low','medium','high','xhigh','max'));
commit;
