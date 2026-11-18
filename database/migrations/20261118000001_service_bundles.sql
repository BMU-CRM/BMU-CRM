-- Bundles in the price list, as the owner asked: a named set of sub services, such as
-- "Brand Launch" (Complete Branding + Graphic Designing + Website Design & Development),
-- with a saving percentage. A bundle's Starter, Growth and Premium prices are worked
-- out by the app from its sub services' prices for that plan, less the saving, so a
-- changed sub service price carries through. A plan is offered only when every sub
-- service in the bundle has a price for it.
--
-- A bundle goes on a quotation or invoice as one item, billed as "bundle".

create table public.service_bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  -- In the order printed on the item, such as "SEO + Social Media Management".
  service_ids uuid[] not null check (cardinality(service_ids) between 2 and 20),
  saving_percent numeric(5, 2) not null default 10 check (saving_percent between 0 and 90),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index service_bundles_name_unique on public.service_bundles (lower(name));

-- Every entry is a sub service in the price list, each once.
create function public.check_service_bundle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(distinct id) from unnest(new.service_ids) as chosen (id)) <> cardinality(new.service_ids) then
    raise exception 'Choose each sub service once.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(new.service_ids) as chosen (id)
    where not exists (select 1 from public.services s where s.id = chosen.id)
  ) then
    raise exception 'Choose sub services from the price list.' using errcode = 'check_violation';
  end if;
  new.name := trim(new.name);
  return new;
end;
$$;

create trigger service_bundles_check before insert or update on public.service_bundles
  for each row execute function public.check_service_bundle();
create trigger service_bundles_set_updated_at before update on public.service_bundles
  for each row execute function public.set_updated_at();
create trigger service_bundles_audit after insert or update or delete on public.service_bundles
  for each row execute function public.audit_row_change();

alter table public.service_bundles enable row level security;

create policy service_bundles_select on public.service_bundles for select to authenticated
  using (public.current_employee_id() is not null);
create policy service_bundles_write on public.service_bundles for all to authenticated
  using (public.permission_scope_for('catalog.manage') = 'organisation')
  with check (public.permission_scope_for('catalog.manage') = 'organisation');

grant select, insert, update, delete on public.service_bundles to authenticated;
revoke truncate on public.service_bundles from authenticated;
revoke all on public.service_bundles from anon;
revoke execute on function public.check_service_bundle() from public, anon;

-- A bundle item on a quotation or invoice is billed as "bundle".
alter table public.quotation_items drop constraint quotation_items_billing_check;
alter table public.quotation_items
  add constraint quotation_items_billing_check check (billing in ('monthly', 'one_time', 'per_unit', 'bundle'));
alter table public.invoice_items drop constraint invoice_items_billing_check;
alter table public.invoice_items
  add constraint invoice_items_billing_check check (billing in ('monthly', 'one_time', 'per_unit', 'bundle'));

-- The company's current bundles, from its website, with a 10% saving each. A sub service
-- missing from the price list (renamed or removed) is left out; a bundle left with fewer
-- than two is not added.
insert into public.service_bundles (name, service_ids, sort_order)
select b.name, ids.service_ids, b.sort_order
from (values
  ('Brand Launch', array['Complete Branding', 'Graphic Designing', 'Website Design & Development'], 10),
  ('Business AI', array['AI Chatbots', 'Website Design & Development', 'Digital Marketing'], 20),
  ('Complete Digital Growth', array['Digital Marketing', 'SEO', 'Complete Branding', 'Website Design & Development',
    'Social Media Management', 'Video Editing', 'UGC Content', 'AI Chatbots'], 30),
  ('Digital Presence', array['Website Design & Development', 'SEO', 'Google Business Profile', 'Social Media Management'], 40),
  ('Founder Brand', array['Personal Branding', 'Business Video Shoots', 'Video Editing', 'Social Media Management'], 50),
  ('Local Business Growth', array['Google Business Profile', 'SEO', 'Social Media Management', 'Business Video Shoots',
    'Graphic Designing'], 60),
  ('Social Growth', array['Social Media Management', 'Graphic Designing', 'Video Editing', 'UGC Content'], 70),
  ('UGC Growth', array['UGC Content', 'UGC Outsourcing', 'UGC Ads', 'UGC Promotions'], 80)
) as b (name, service_names, sort_order)
cross join lateral (
  select array_agg(s.id order by n.position) as service_ids
  from unnest(b.service_names) with ordinality as n (name, position)
  join public.services s on lower(s.name) = lower(n.name)
) as ids
where cardinality(ids.service_ids) >= 2
on conflict do nothing;
