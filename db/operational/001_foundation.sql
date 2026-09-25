-- Network Outreach Tool - operational database
-- DATABASE_URL
-- Additive foundation migration. No destructive operations.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  organization_type text,
  parent_organization_id uuid references organizations(id),
  website text,
  website_domain text,
  country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_normalized_name_idx
  on organizations (normalized_name);
create index if not exists organizations_website_domain_idx
  on organizations (website_domain)
  where website_domain is not null;

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  name text not null,
  normalized_name text not null,
  facility_type text,
  provider_type text,
  relationship_type text,
  operator_name text,
  contracting_entity_name text,
  address text,
  city text,
  state_region text,
  postal_code text,
  country text not null,
  latitude double precision,
  longitude double precision,
  phone text,
  phone_normalized text,
  website text,
  website_domain text,
  general_email text,
  network_map_external_id text,
  international_search_external_id text,
  active_provider boolean not null default false,
  do_not_contact boolean not null default false,
  outreach_status text,
  status_reason text,
  current_status text not null default 'CURRENT',
  confidence numeric(5,4),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facilities_normalized_name_country_idx
  on facilities (normalized_name, country);
create index if not exists facilities_website_domain_idx
  on facilities (website_domain)
  where website_domain is not null;
create index if not exists facilities_phone_normalized_idx
  on facilities (phone_normalized)
  where phone_normalized is not null;
create index if not exists facilities_provider_type_idx
  on facilities (provider_type);
create index if not exists facilities_outreach_status_idx
  on facilities (outreach_status);

create table if not exists provider_aliases (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_type text,
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists provider_aliases_normalized_idx
  on provider_aliases (normalized_alias);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  facility_id uuid references facilities(id),
  full_name text,
  title text,
  department text,
  email text,
  email_domain text,
  phone text,
  linkedin_url text,
  contact_type text,
  is_primary boolean not null default false,
  email_verified boolean not null default false,
  email_source_url text,
  source_url text,
  confidence numeric(5,4),
  notes text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_scope_check
    check (organization_id is not null or facility_id is not null)
);

create index if not exists contacts_facility_idx on contacts (facility_id);
create index if not exists contacts_email_lower_idx on contacts (lower(email))
  where email is not null;
create index if not exists contacts_email_domain_idx on contacts (email_domain)
  where email_domain is not null;

create table if not exists service_catalog (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category text,
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists facility_services (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  service_id uuid references service_catalog(id),
  service_name text not null,
  availability_status text not null default 'DOCUMENTED',
  source_url text,
  source_excerpt text,
  confidence numeric(5,4),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (facility_id, service_name)
);

create index if not exists facility_services_facility_idx
  on facility_services (facility_id);

create table if not exists pricing_records (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  service_name text not null,
  amount numeric(14,2),
  currency char(3),
  pricing_type text not null default 'POSTED',
  source_url text,
  source_excerpt text,
  quote_reference text,
  quoted_at timestamptz,
  effective_date date,
  expires_at date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists pricing_records_facility_idx
  on pricing_records (facility_id);
create index if not exists pricing_records_service_idx
  on pricing_records (service_name);

create table if not exists evidence_sources (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  evidence_type text not null,
  source_url text,
  source_title text,
  excerpt text,
  retrieved_at timestamptz not null default now(),
  confidence numeric(5,4),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists evidence_sources_entity_idx
  on evidence_sources (entity_type, entity_id);

create table if not exists exclusion_rules (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  rule_type text not null,
  reason text not null,
  source text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint exclusion_scope_check
    check (facility_id is not null or organization_id is not null)
);

create index if not exists exclusion_rules_facility_idx on exclusion_rules (facility_id);
create index if not exists exclusion_rules_org_idx on exclusion_rules (organization_id);

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  provider_type text,
  name text not null,
  subject_template text not null,
  body_template text not null,
  default_cc text[] not null default array['mcaskey@occu-med.com']::text[],
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists provider_type_profiles (
  id text primary key,
  label text not null,
  agreement_template_key text not null,
  email_template_key text not null,
  required_capabilities jsonb not null default '[]'::jsonb,
  preferred_contact_roles jsonb not null default '[]'::jsonb,
  excluded_entity_kinds jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  provider_type text,
  country text,
  city text,
  original_request text,
  status text not null default 'DRAFT',
  owner text not null default 'Alex',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_status_idx on campaigns (status);

create table if not exists campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  facility_id uuid not null references facilities(id),
  status text not null default 'NOT_STARTED',
  gate_decision text,
  gate_confidence numeric(5,4),
  gate_reasons jsonb not null default '[]'::jsonb,
  priority text not null default 'MEDIUM',
  owner text not null default 'Alex',
  pricing_requested boolean not null default false,
  psa_needed boolean not null default true,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  result_decision text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, facility_id)
);

create index if not exists campaign_targets_status_idx
  on campaign_targets (status);
create index if not exists campaign_targets_follow_up_idx
  on campaign_targets (next_follow_up_at)
  where next_follow_up_at is not null;

create table if not exists agreement_documents (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  campaign_target_id uuid references campaign_targets(id) on delete set null,
  template_key text not null,
  generator_external_id text,
  file_name text,
  storage_url text,
  sha256 text,
  generation_status text not null default 'REQUESTED',
  generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agreement_documents_target_idx
  on agreement_documents (campaign_target_id);

create table if not exists outreach_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_target_id uuid not null references campaign_targets(id) on delete cascade,
  contact_id uuid references contacts(id),
  template_key text,
  to_email text not null,
  cc_emails text[] not null default array['mcaskey@occu-med.com']::text[],
  subject text not null,
  body text not null,
  status text not null default 'READY',
  external_message_id text,
  drafted_at timestamptz,
  sent_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outreach_messages_target_idx
  on outreach_messages (campaign_target_id);
create index if not exists outreach_messages_status_idx
  on outreach_messages (status);

create table if not exists outreach_events (
  id uuid primary key default gen_random_uuid(),
  campaign_target_id uuid not null references campaign_targets(id) on delete cascade,
  outreach_message_id uuid references outreach_messages(id) on delete set null,
  event_type text not null,
  method text,
  outcome text,
  notes text,
  occurred_at timestamptz not null default now(),
  next_follow_up_at timestamptz,
  created_by text not null default 'Alex',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists outreach_events_target_time_idx
  on outreach_events (campaign_target_id, occurred_at desc);
