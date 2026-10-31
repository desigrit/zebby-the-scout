-- Allow resume tailoring as a separately quoted task. Existing balances and results stay intact.
begin;
alter table public.zebby_quotes drop constraint if exists zebby_quotes_kind_check;
alter table public.zebby_quotes add constraint zebby_quotes_kind_check check(kind in ('plan','match','resume'));
commit;
