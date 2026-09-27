-- Large-scale outreach intake.
-- Providers arrive here after they have already been identified elsewhere.
-- This app does not research for providers.

create table if not exists campaign_imports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  source_type text not null default 'CSV',
  file_name text,
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  excluded_rows integer not null default 0,
  review_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by text not null default 'Alex',
  created_at timestamptz not null default now()
);

create index if not exists campaign_imports_campaign_idx
  on campaign_imports (campaign_id, created_at desc);

create table if not exists campaign_intake_rows (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  import_id uuid references campaign_imports(id) on delete set null,
  row_number integer,
  provider_name text not null,
  normalized_name text not null,
  provider_type text,
  address text,
  city text,
  state_region text,
  postal_code text,
  country text not null,
  website text,
  phone text,
  email text,
  contact_name text,
  contact_title text,
  source_system text,
  source_record_id text,
  source_url text,
  priority text not null default 'MEDIUM',
  psa_needed boolean not null default true,
  pricing_requested boolean not null default false,
  notes text,
  services jsonb not null default '[]'::jsonb,
  gate_decision text,
  gate_confidence numeric(5,4),
  gate_reasons jsonb not null default '[]'::jsonb,
  matched_facility_id uuid references facilities(id) on delete set null,
  campaign_target_id uuid references campaign_targets(id) on delete set null,
  disposition text not null default 'PENDING',
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_intake_rows_campaign_idx
  on campaign_intake_rows (campaign_id, created_at desc);

create index if not exists campaign_intake_rows_disposition_idx
  on campaign_intake_rows (campaign_id, disposition);

create index if not exists campaign_intake_rows_gate_idx
  on campaign_intake_rows (campaign_id, gate_decision);

create index if not exists campaign_intake_rows_source_idx
  on campaign_intake_rows (source_system, source_record_id)
  where source_system is not null and source_record_id is not null;

alter table campaigns
  add column if not exists intake_source text,
  add column if not exists provider_count_expected integer,
  add column if not exists completed_at timestamptz;
