create or replace function public.normalize_inspection_market()
returns trigger language plpgsql set search_path = public as $$
declare m text := lower(trim(coalesce(new.market,'')));
begin
  new.market := case
    when m in ('cl','chile','cli') then 'CL'
    when m in ('mx','mexico','méxico','mex') then 'MX'
    when m in ('pe','peru','perú','per') then 'PE'
    else upper(trim(new.market)) end;
  return new;
end $$;
drop trigger if exists trg_normalize_inspection_market on public.inspections;
create trigger trg_normalize_inspection_market before insert or update of market on public.inspections
for each row execute function public.normalize_inspection_market();
update public.inspections set market = market where upper(trim(market)) not in ('CL','MX','PE') or market <> upper(trim(market));