-- A short project overview, up to three lines, printed under "Quotation to" and
-- "Invoice to", as the owner asked. Changed only while the document is a draft, like
-- the rest of its content. An invoice made from a quotation starts with its overview.

alter table public.quotations
  add column overview text check (length(overview) <= 400 and array_length(regexp_split_to_array(overview, E'\n'), 1) <= 3);
alter table public.invoices
  add column overview text check (length(overview) <= 400 and array_length(regexp_split_to_array(overview, E'\n'), 1) <= 3);

create function public.guard_document_overview()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.overview is distinct from old.overview and old.status::text <> 'draft' then
    raise exception 'The project overview can only be changed on a draft.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger quotations_overview_guard before update of overview on public.quotations
  for each row execute function public.guard_document_overview();
create trigger invoices_overview_guard before update of overview on public.invoices
  for each row execute function public.guard_document_overview();

-- An invoice made from a quotation takes its overview.
create function public.copy_quotation_overview()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.quotation_id is not null and new.overview is null then
    select overview into new.overview from public.quotations where id = new.quotation_id;
  end if;
  return new;
end;
$$;

create trigger invoices_copy_quotation_overview before insert on public.invoices
  for each row execute function public.copy_quotation_overview();

revoke execute on all functions in schema public from public, anon;
