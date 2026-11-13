-- Prices for each sub service: how it is billed, and the Starter, Growth and Premium
-- plan prices (in rupees, before GST). Quotations and invoices fill an item's
-- description and rate from these when a sub service and plan are picked.
--
-- The list is replaced with the company's current price list. Sub services that are
-- not on it are hidden, not deleted: clients that already have them keep them, and
-- an administrator can show them again in Settings, Services and industries.

alter table public.services
  add column billing text not null default 'monthly' check (billing in ('monthly', 'one_time', 'per_unit')),
  add column starter_price numeric(14, 2) check (starter_price >= 0),
  add column growth_price numeric(14, 2) check (growth_price >= 0),
  add column premium_price numeric(14, 2) check (premium_price >= 0);

do $$
declare
  v_item record;
  v_group uuid;
  v_service uuid;
  v_kept uuid[] := '{}';
begin
  for v_item in
    select *
    from (values
      ('Marketing & Visibility', 'ChatGPT Ads', 'monthly', 20000, 40000, 75000, null),
      ('Marketing & Visibility', 'Digital Marketing', 'monthly', 25000, 50000, 100000, null),
      ('Marketing & Visibility', 'Google Business Profile', 'monthly', 7500, 15000, 25000, 'Google Business Profile Optimisation'),
      ('Marketing & Visibility', 'SEO', 'monthly', 15000, 30000, 60000, 'SEO (Search Engine Optimisation)'),
      ('Social & Personal Brand', 'Personal Branding', 'monthly', 20000, 40000, 75000, null),
      ('Social & Personal Brand', 'Social Media Management', 'monthly', 25000, 45000, 65000, null),
      ('Social & Personal Brand', 'Social Media Management — Brands', 'monthly', 25000, 45000, 65000, null),
      ('Social & Personal Brand', 'Social Media Management — Influencers', 'monthly', 25000, 45000, 65000, null),
      ('UGC & Creator Marketing', 'Brand Collaborations', 'per_unit', 25000, 40000, 80000, null),
      ('UGC & Creator Marketing', 'Experiential Ads', 'per_unit', 25000, 50000, 100000, null),
      ('UGC & Creator Marketing', 'UGC Ads', 'monthly', 15000, 30000, 60000, null),
      ('UGC & Creator Marketing', 'UGC Content', 'monthly', 15000, 30000, 60000, 'UGC Videos'),
      ('UGC & Creator Marketing', 'UGC Outsourcing', 'monthly', 10000, 20000, 40000, null),
      ('UGC & Creator Marketing', 'UGC Promotions', 'monthly', 25000, 40000, 80000, null),
      ('Brand & Design', 'Complete Branding', 'one_time', 40000, 75000, 150000, null),
      ('Brand & Design', 'Graphic Designing', 'monthly', 10000, 20000, 40000, null),
      ('Brand & Design', 'Logo & Brand Kit', 'one_time', 15000, 30000, 60000, null),
      ('Web & AI', 'AI Chatbots', 'one_time', 10000, 25000, 50000, null),
      ('Web & AI', 'Website Design & Development', 'one_time', 25000, 60000, 125000, 'Website Design'),
      ('Content & Production', 'Business Video Shoots', 'per_unit', 12000, 25000, 50000, null),
      ('Content & Production', 'Podcast Shoots', 'per_unit', 15000, 30000, 50000, null),
      ('Content & Production', 'Video Editing', 'monthly', 12000, 25000, 50000, null)
    ) as s (group_name, name, billing, starter, growth, premium, old_name)
  loop
    -- The group, made visible, or added if it was removed.
    select id into v_group from public.service_groups where lower(name) = lower(v_item.group_name);
    if v_group is null then
      insert into public.service_groups (name, sort_order) values (v_item.group_name, 1000) returning id into v_group;
    else
      update public.service_groups set is_active = true where id = v_group and not is_active;
    end if;

    -- The sub service by its new name, else by its old name (renamed), else a new one.
    select id into v_service from public.services where lower(name) = lower(v_item.name);
    if v_service is null and v_item.old_name is not null then
      select id into v_service from public.services where lower(name) = lower(v_item.old_name);
    end if;

    if v_service is null then
      insert into public.services (group_id, name, billing, starter_price, growth_price, premium_price)
      values (v_group, v_item.name, v_item.billing, v_item.starter, v_item.growth, v_item.premium)
      returning id into v_service;
    else
      update public.services
      set name = v_item.name, group_id = v_group, is_active = true, billing = v_item.billing,
          starter_price = v_item.starter, growth_price = v_item.growth, premium_price = v_item.premium
      where id = v_service;
    end if;

    v_kept := v_kept || v_service;
  end loop;

  update public.services set is_active = false where is_active and not (id = any (v_kept));

  -- Clients' current services show the new names; ended ones keep theirs as history.
  update public.client_services cs
  set service_name = s.name
  from public.services s
  where cs.service_id = s.id and cs.status <> 'ended' and cs.service_name <> s.name;
end;
$$;
