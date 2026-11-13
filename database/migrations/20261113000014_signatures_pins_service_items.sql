-- Signatures and seals on quotations and invoices, service details on their items,
-- pinned chats, and HR no longer planning the content calendar.
--
-- * Whoever prepares quotations or invoices uploads their signature and the company
--   seal once, in My profile, with the title printed under their name. A quotation or
--   invoice can then carry the signature and seal of the person who prepared it.
-- * Each item can say which service (main and sub service) it is, and whether it is a
--   one-time project, monthly or per unit. Picking from the price list fills these in.
-- * Each sub service has a short description, from the website's services page.
-- * Anyone can pin a chat to the top of their own conversation list.

-- ---------------------------------------------------------------------------
-- The content calendar is planned by the Founder and Client Managers only
-- ---------------------------------------------------------------------------

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and rp.permission_key = 'content_calendar.manage'
  and lower(r.name) = 'human resource';

-- ---------------------------------------------------------------------------
-- Company details printed on documents
-- ---------------------------------------------------------------------------

alter table public.finance_settings
  add column website text check (length(website) <= 160);

-- Filled in only where nothing has been entered yet.
update public.finance_settings set
  legal_name = coalesce(legal_name, 'BMU Marketing'),
  address = coalesce(address, E'376, Phase 9, Royal Park Residency Layout,\nJP Nagar 9th Phase, J. P. Nagar,\nBengaluru, Karnataka 560108'),
  state = coalesce(state, 'Karnataka'),
  email = coalesce(email, 'support@bmumarketing.in'),
  phone = coalesce(phone, '+91 81054 91414'),
  website = coalesce(website, 'https://www.bmumarketing.in/');

-- ---------------------------------------------------------------------------
-- Service descriptions and service details on items
-- ---------------------------------------------------------------------------

alter table public.services
  add column description text check (length(description) <= 500);

update public.services s
set description = d.description
from (values
  ('SEO', 'Technical fixes, service pages and content that help the business rank for what customers search.'),
  ('Local SEO', 'Ranking in Google Maps and "near me" searches through the profile, reviews, citations and location pages.'),
  ('Google Business Profile', 'Set-up, verification and monthly upkeep of the Google Business Profile: categories, photos, posts and review replies.'),
  ('Google Business Profile Optimisation', 'Set-up, verification and monthly upkeep of the Google Business Profile: categories, photos, posts and review replies.'),
  ('Google Ads', 'Search, Performance Max and YouTube campaigns aimed at leads and sales, with conversion tracking set up first.'),
  ('Meta Ads', 'Facebook and Instagram ads for leads and sales: audiences, creative testing and lead forms linked to WhatsApp or the CRM.'),
  ('Performance Marketing', 'Paid campaigns across Google, Meta and other platforms, run to a cost-per-lead or ROAS target.'),
  ('AI Search Visibility', 'Getting ChatGPT, Gemini, Perplexity and Google AI Overviews to find and recommend the business.'),
  ('Digital Marketing', 'One monthly plan covering SEO, Google and Meta ads, social media and a single report, run by one team.'),
  ('Content Marketing', 'Blogs, guides, page copy and newsletters that answer customer questions and rank in search and AI answers.'),
  ('Social Media Management', 'Monthly Instagram, Facebook and LinkedIn management: content calendar, reels, design, posting and replies.'),
  ('Social Media Management — Brands', 'Monthly Instagram, Facebook and LinkedIn management: content calendar, reels, design, posting and replies.'),
  ('Social Media Management — Influencers', 'Monthly Instagram, Facebook and LinkedIn management: content calendar, reels, design, posting and replies.'),
  ('Instagram Marketing', 'Instagram growth through profile work, a reels-first calendar, stories, collaborations, DM replies and ads.'),
  ('Personal Branding', 'Positioning, scripted videos and regular posts for founders, doctors and experts on Instagram, YouTube and LinkedIn.'),
  ('LinkedIn Branding', 'Profile rewrite, ghostwritten posts and a company page for founders and B2B companies.'),
  ('UGC Videos', 'Creator-made videos (unboxings, reviews, testimonials) for Meta ads, Instagram and product pages.'),
  ('UGC Content', 'Creator-made videos (unboxings, reviews, testimonials) for Meta ads, Instagram and product pages.'),
  ('UGC Ads', 'Creator-made video ads (unboxings, reviews, testimonials) for Meta ads, Instagram and product pages.'),
  ('Influencer Marketing', 'Instagram and YouTube creator campaigns: matching, briefs, negotiation, disclosure and tracking.'),
  ('Brand Identity Design', 'Logo, colours, typography and brand guidelines, so the business looks consistent everywhere.'),
  ('Complete Branding', 'Logo, colours, typography and brand guidelines, so the business looks consistent everywhere.'),
  ('Logo & Brand Kit', 'Logo, colours, typography and a brand kit, so the business looks consistent everywhere.'),
  ('Packaging Design', 'Packaging for D2C and retail products: boxes, labels, pouches and print-ready dielines.'),
  ('UI/UX Design', 'Design for websites, web apps and mobile apps, from research and wireframes to Figma prototypes and design systems.'),
  ('Pitch Decks', 'Investor and sales pitch decks: story, structure, copy and design.'),
  ('Website Design', 'Layouts that turn visits into enquiries, with call, form and WhatsApp buttons.'),
  ('Website Development', 'Mobile-first websites with service pages, call and WhatsApp buttons, SEO set-up and tracking.'),
  ('Website Design & Development', 'Mobile-first websites with service pages, call and WhatsApp buttons, SEO set-up and tracking.'),
  ('Web App Development', 'Custom web apps such as customer portals, booking systems, dashboards and internal tools.'),
  ('Mobile App Development', 'Android and iOS apps from scope and design through build, store launch and updates.'),
  ('AI Chatbots', 'Website and WhatsApp chatbots that answer from the business''s own information, qualify leads and book appointments.'),
  ('WhatsApp Automation', 'WhatsApp Business API set-up with broadcasts, follow-ups, catalogues and a team inbox.'),
  ('Marketing Automation', 'CRM set-up, lead routing and automated email and WhatsApp follow-ups.'),
  ('Photography', 'Commercial photos of products, food, interiors and teams, ready for ads, websites and marketplaces.'),
  ('Video Production', 'Scripting, shooting and editing for reels, ads, brand films and testimonials.'),
  ('Business Video Shoots', 'Scripting, shooting and editing for reels, ads, brand films and testimonials.'),
  ('Drone Shoots', 'Aerial drone video and photos for real estate, resorts, events and construction, within India''s drone rules.')
) as d (name, description)
where lower(s.name) = lower(d.name) and s.description is null;

alter table public.quotation_items
  add column service_group text check (length(service_group) <= 80),
  add column service_name text check (length(service_name) <= 120),
  add column billing text check (billing in ('monthly', 'one_time', 'per_unit'));

alter table public.invoice_items
  add column service_group text check (length(service_group) <= 80),
  add column service_name text check (length(service_name) <= 120),
  add column billing text check (billing in ('monthly', 'one_time', 'per_unit'));

-- ---------------------------------------------------------------------------
-- Signatures and seals
-- ---------------------------------------------------------------------------

-- Small images, kept in the row so documents print the same on every database. They
-- are resized by the app before saving.
create table public.document_signatures (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  signature_image text check (signature_image ~ '^data:image/(png|webp);base64,[A-Za-z0-9+/=]+$' and length(signature_image) <= 400000),
  seal_image text check (seal_image ~ '^data:image/(png|webp);base64,[A-Za-z0-9+/=]+$' and length(seal_image) <= 400000),
  signatory_title text check (length(trim(signatory_title)) between 2 and 80),
  updated_at timestamptz not null default now()
);

create function public.can_sign_documents()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('invoices.manage') or public.has_permission('quotations.manage')
$$;

alter table public.document_signatures enable row level security;

-- Your own, and anyone's who may see quotations or invoices, as they print on them.
create policy document_signatures_select on public.document_signatures for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or public.has_permission('invoices.view')
    or public.has_permission('quotations.view')
  );
create policy document_signatures_insert on public.document_signatures for insert to authenticated
  with check (employee_id = public.current_employee_id() and public.can_sign_documents());
create policy document_signatures_update on public.document_signatures for update to authenticated
  using (employee_id = public.current_employee_id() and public.can_sign_documents())
  with check (employee_id = public.current_employee_id() and public.can_sign_documents());
create policy document_signatures_delete on public.document_signatures for delete to authenticated
  using (employee_id = public.current_employee_id());

create trigger document_signatures_set_updated_at before update on public.document_signatures
  for each row execute function public.set_updated_at();

-- The audit log says what changed, without copying the images into it.
create function public.audit_document_signature()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_row public.document_signatures := coalesce(new, old);
  v_name text;
  v_changes text[] := '{}';
begin
  if tg_op = 'DELETE' then
    v_changes := array['signature and seal removed'];
  else
    if new.signature_image is distinct from (case when tg_op = 'UPDATE' then old.signature_image end) then
      v_changes := array_append(v_changes, case when new.signature_image is null then 'signature removed' else 'signature uploaded' end);
    end if;
    if new.seal_image is distinct from (case when tg_op = 'UPDATE' then old.seal_image end) then
      v_changes := array_append(v_changes, case when new.seal_image is null then 'seal removed' else 'seal uploaded' end);
    end if;
    if new.signatory_title is distinct from (case when tg_op = 'UPDATE' then old.signatory_title end) then
      v_changes := array_append(v_changes, 'title set to ' || coalesce(new.signatory_title, 'none'));
    end if;
  end if;
  if cardinality(v_changes) = 0 then
    return null;
  end if;

  select full_name into v_actor_name from public.employees where id = v_actor;
  select full_name into v_name from public.employees where id = v_row.employee_id;
  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (
    v_actor, coalesce(v_actor_name, 'System'),
    case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
    'document_signatures', v_row.employee_id::text,
    jsonb_build_object('label', coalesce(v_name, 'Signature'), 'summary', array_to_string(v_changes, ', '))
  );
  return null;
end;
$$;

create trigger document_signatures_audit after insert or update or delete on public.document_signatures
  for each row execute function public.audit_document_signature();

alter table public.quotations
  add column signed_by uuid references public.employees (id) on delete set null,
  add column show_seal boolean not null default false;
alter table public.invoices
  add column signed_by uuid references public.employees (id) on delete set null,
  add column show_seal boolean not null default false;

-- Only you can put your signature on a document, and only once you have uploaded it.
create function public.guard_document_signer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.finance_internal_write() then
    return new;
  end if;
  if new.signed_by is not null
     and (tg_op = 'INSERT' or new.signed_by is distinct from old.signed_by)
     and new.signed_by is distinct from public.current_employee_id() then
    raise exception 'You can only sign with your own signature.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger quotations_guard_signer before insert or update of signed_by on public.quotations
  for each row execute function public.guard_document_signer();
create trigger invoices_guard_signer before insert or update of signed_by on public.invoices
  for each row execute function public.guard_document_signer();

-- Signs a saved document as the person saving it, leaves it as it was, or removes the
-- signature. "keep" also keeps the seal choice unless one is given.
create function public.apply_document_signature(p_signature text, p_show_seal boolean, p_current uuid, p_current_seal boolean)
returns table (signed_by uuid, show_seal boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_signer uuid;
begin
  v_signer := case coalesce(p_signature, 'keep')
    when 'mine' then v_actor
    when 'none' then null
    else p_current
  end;
  if p_signature = 'mine' and not exists (
    select 1 from public.document_signatures s where s.employee_id = v_actor and s.signature_image is not null
  ) then
    raise exception 'Upload your signature in My profile first.' using errcode = 'check_violation';
  end if;
  return query select v_signer, v_signer is not null and coalesce(p_show_seal, p_current_seal, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saving documents, now with service details and the signature
-- ---------------------------------------------------------------------------

-- As before. Items may also carry "service_group", "service_name" and "billing", and
-- the values "signature" ('mine', 'keep' or 'none') and "show_seal".
create or replace function public.save_quotation(p_quotation uuid, p_values jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.quotations;
  v_id uuid := p_quotation;
  v_client uuid := (p_values ->> 'client_id')::uuid;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
  v_signer uuid;
  v_seal boolean;
begin
  if public.current_employee_id() is null then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  v_items := public.normalize_items(p_items);
  select coalesce(sum(l.taxable_amount), 0), coalesce(sum(l.tax_amount), 0)
    into v_subtotal, v_tax
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'on', true);

  if v_id is null then
    if not public.finance_reach('quotations.manage', v_client, null) then
      raise exception 'You cannot prepare quotations for this client.' using errcode = 'insufficient_privilege';
    end if;
    select a.signed_by, a.show_seal into v_signer, v_seal
    from public.apply_document_signature(p_values ->> 'signature', (p_values ->> 'show_seal')::boolean, null, false) as a;
    insert into public.quotations (
      client_id, project_id, title, issue_date, valid_until, bill_to_name, bill_to_address,
      client_gstin, place_of_supply, notes, terms, subtotal, tax_total, signed_by, show_seal
    ) values (
      v_client, (p_values ->> 'project_id')::uuid, p_values ->> 'title',
      coalesce((p_values ->> 'issue_date')::date, public.india_today()), (p_values ->> 'valid_until')::date,
      p_values ->> 'bill_to_name', p_values ->> 'bill_to_address', p_values ->> 'client_gstin',
      p_values ->> 'place_of_supply', p_values ->> 'notes', p_values ->> 'terms', v_subtotal, v_tax, v_signer, v_seal
    )
    returning id into v_id;
  else
    select * into v_existing from public.quotations where id = v_id for update;
    if not found or not public.can_manage_quotation_row(v_existing) then
      raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
    end if;
    if v_existing.status not in ('draft', 'sent') then
      raise exception 'Only a draft or sent quotation can be changed. Revise it first.' using errcode = 'check_violation';
    end if;
    select a.signed_by, a.show_seal into v_signer, v_seal
    from public.apply_document_signature(p_values ->> 'signature', (p_values ->> 'show_seal')::boolean, v_existing.signed_by, v_existing.show_seal) as a;
    update public.quotations set
      client_id = v_client,
      project_id = (p_values ->> 'project_id')::uuid,
      title = p_values ->> 'title',
      issue_date = coalesce((p_values ->> 'issue_date')::date, issue_date),
      valid_until = (p_values ->> 'valid_until')::date,
      bill_to_name = p_values ->> 'bill_to_name',
      bill_to_address = p_values ->> 'bill_to_address',
      client_gstin = p_values ->> 'client_gstin',
      place_of_supply = p_values ->> 'place_of_supply',
      notes = p_values ->> 'notes',
      terms = p_values ->> 'terms',
      subtotal = v_subtotal,
      tax_total = v_tax,
      signed_by = v_signer,
      show_seal = v_seal
    where id = v_id;
    delete from public.quotation_items where quotation_id = v_id;
  end if;

  insert into public.quotation_items (
    quotation_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount,
    service_group, service_name, billing
  )
  select v_id, l.position, l.description, l.hsn_sac, l.quantity, l.unit_price, l.tax_rate, l.taxable_amount, l.tax_amount,
    nullif(trim(x.item ->> 'service_group'), ''), nullif(trim(x.item ->> 'service_name'), ''), nullif(x.item ->> 'billing', '')
  from public.item_lines(v_items) as l
  join jsonb_array_elements(p_items) with ordinality as x (item, position) on x.position = l.position;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

create or replace function public.save_invoice(p_invoice uuid, p_values jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.invoices;
  v_id uuid := p_invoice;
  v_client uuid := (p_values ->> 'client_id')::uuid;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
  v_signer uuid;
  v_seal boolean;
begin
  if public.current_employee_id() is null then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  v_items := public.normalize_items(p_items);
  select coalesce(sum(l.taxable_amount), 0), coalesce(sum(l.tax_amount), 0)
    into v_subtotal, v_tax
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'on', true);

  if v_id is null then
    if not public.finance_reach('invoices.manage', v_client, null) then
      raise exception 'You cannot bill this client.' using errcode = 'insufficient_privilege';
    end if;
    select a.signed_by, a.show_seal into v_signer, v_seal
    from public.apply_document_signature(p_values ->> 'signature', (p_values ->> 'show_seal')::boolean, null, false) as a;
    insert into public.invoices (
      client_id, project_id, title, issue_date, due_date, bill_to_name, bill_to_address,
      client_gstin, place_of_supply, notes, terms, subtotal, tax_total, signed_by, show_seal
    ) values (
      v_client, (p_values ->> 'project_id')::uuid, p_values ->> 'title',
      coalesce((p_values ->> 'issue_date')::date, public.india_today()), (p_values ->> 'due_date')::date,
      p_values ->> 'bill_to_name', p_values ->> 'bill_to_address', p_values ->> 'client_gstin',
      p_values ->> 'place_of_supply', p_values ->> 'notes', p_values ->> 'terms', v_subtotal, v_tax, v_signer, v_seal
    )
    returning id into v_id;
  else
    select * into v_existing from public.invoices where id = v_id for update;
    if not found or not public.can_manage_invoice_row(v_existing) then
      raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'An issued invoice cannot be changed. Cancel it and issue a new one if something is wrong.'
        using errcode = 'check_violation';
    end if;
    select a.signed_by, a.show_seal into v_signer, v_seal
    from public.apply_document_signature(p_values ->> 'signature', (p_values ->> 'show_seal')::boolean, v_existing.signed_by, v_existing.show_seal) as a;
    update public.invoices set
      client_id = v_client,
      project_id = (p_values ->> 'project_id')::uuid,
      title = p_values ->> 'title',
      issue_date = coalesce((p_values ->> 'issue_date')::date, issue_date),
      due_date = (p_values ->> 'due_date')::date,
      bill_to_name = p_values ->> 'bill_to_name',
      bill_to_address = p_values ->> 'bill_to_address',
      client_gstin = p_values ->> 'client_gstin',
      place_of_supply = p_values ->> 'place_of_supply',
      notes = p_values ->> 'notes',
      terms = p_values ->> 'terms',
      subtotal = v_subtotal,
      tax_total = v_tax,
      signed_by = v_signer,
      show_seal = v_seal
    where id = v_id;
    delete from public.invoice_items where invoice_id = v_id;
  end if;

  insert into public.invoice_items (
    invoice_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount,
    service_group, service_name, billing
  )
  select v_id, l.position, l.description, l.hsn_sac, l.quantity, l.unit_price, l.tax_rate, l.taxable_amount, l.tax_amount,
    nullif(trim(x.item ->> 'service_group'), ''), nullif(trim(x.item ->> 'service_name'), ''), nullif(x.item ->> 'billing', '')
  from public.item_lines(v_items) as l
  join jsonb_array_elements(p_items) with ordinality as x (item, position) on x.position = l.position;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

-- As before, and the items keep their service details. The invoice is not signed:
-- whoever prepares it signs it when they edit it.
create or replace function public.create_invoice_from_quotation(p_quotation uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_quotation public.quotations;
  v_id uuid;
begin
  select * into v_quotation from public.quotations where id = p_quotation for update;
  if not found or not public.can_view_quotation_row(v_quotation) then
    raise exception 'Quotation not found.' using errcode = 'insufficient_privilege';
  end if;
  if v_quotation.status <> 'accepted' then
    raise exception 'Only an accepted quotation can be turned into an invoice.' using errcode = 'check_violation';
  end if;
  if v_quotation.invoice_id is not null then
    raise exception 'This quotation already has an invoice.' using errcode = 'check_violation';
  end if;
  if not public.finance_reach('invoices.manage', v_quotation.client_id, null) then
    raise exception 'You cannot bill this client.' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.finance_internal', 'on', true);

  insert into public.invoices (
    client_id, project_id, quotation_id, title, bill_to_name, bill_to_address, client_gstin,
    place_of_supply, notes, subtotal, tax_total
  ) values (
    v_quotation.client_id, v_quotation.project_id, v_quotation.id, v_quotation.title,
    v_quotation.bill_to_name, v_quotation.bill_to_address, v_quotation.client_gstin,
    v_quotation.place_of_supply, v_quotation.notes, v_quotation.subtotal, v_quotation.tax_total
  )
  returning id into v_id;

  insert into public.invoice_items (
    invoice_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount,
    service_group, service_name, billing
  )
  select v_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount,
    service_group, service_name, billing
  from public.quotation_items where quotation_id = p_quotation;

  update public.quotations set invoice_id = v_id where id = p_quotation;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pinned chats
-- ---------------------------------------------------------------------------

create table public.conversation_pins (
  employee_id uuid not null references public.employees (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (employee_id, conversation_id)
);
create index conversation_pins_conversation_idx on public.conversation_pins (conversation_id);

alter table public.conversation_pins enable row level security;

create policy conversation_pins_select on public.conversation_pins for select to authenticated
  using (employee_id = public.current_employee_id());
create policy conversation_pins_insert on public.conversation_pins for insert to authenticated
  with check (
    employee_id = public.current_employee_id()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and public.is_conversation_participant(c, public.current_employee_id())
    )
  );
create policy conversation_pins_delete on public.conversation_pins for delete to authenticated
  using (employee_id = public.current_employee_id());

-- As before, plus whether the chat is pinned. Pinned chats come first, the most
-- recently pinned at the top.
drop function public.get_my_conversations();
create function public.get_my_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  title text,
  department_name text,
  project_name text,
  client_name text,
  other_person_id uuid,
  other_person_name text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_author text,
  unread_count bigint,
  is_pinned boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or not public.has_permission('messages.use') then
    return;
  end if;

  return query
  select
    c.id, c.kind, c.title, d.name, p.name, cl.company_name,
    other.id, other.full_name,
    c.last_message_at,
    last_message.body,
    last_message.author_name,
    (
      select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.author_id is distinct from v_actor
        and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    ),
    pin.pinned_at is not null
  from public.conversations c
  left join public.departments d on d.id = c.department_id
  left join public.projects p on p.id = c.project_id
  left join public.clients cl on cl.id = c.client_id
  left join public.conversation_reads r on r.conversation_id = c.id and r.employee_id = v_actor
  left join public.conversation_pins pin on pin.conversation_id = c.id and pin.employee_id = v_actor
  left join lateral (
    select e.id, e.full_name from public.conversation_members m
    join public.employees e on e.id = m.employee_id
    where c.kind = 'direct' and m.conversation_id = c.id and m.employee_id <> v_actor
    limit 1
  ) other on true
  left join lateral (
    select public.message_preview(m) as body, e.full_name as author_name
    from public.messages m
    left join public.employees e on e.id = m.author_id
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_message on true
  where public.is_conversation_participant(c, v_actor)
  order by pin.pinned_at desc nulls last, c.last_message_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.document_signatures to authenticated;
grant select, insert, delete on public.conversation_pins to authenticated;
revoke truncate on public.document_signatures, public.conversation_pins from authenticated;
grant execute on function public.get_my_conversations() to authenticated;
grant execute on function public.can_sign_documents() to authenticated;
grant execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_invoice(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.create_invoice_from_quotation(uuid) to authenticated;
