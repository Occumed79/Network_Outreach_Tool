-- Network Outreach Tool - research / AI working database
-- DATABASE_URL_2
-- Additive foundation migration. No destructive operations.

create extension if not exists pgcrypto;

create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  provider_type text,
  country text,
  city text,
  requested_by text not null default 'Alex',
  status text not null default 'QUEUED',
  parameters jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists research_runs_status_idx
  on research_runs (status);
create index if not exists research_runs_created_idx
  on research_runs (created_at desc);

create table if not exists research_candidates (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references research_runs(id) on delete cascade,
  provider_name text not null,
  normalized_name text not null,
  provider_type text,
  organization_name text,
  relationship_type text,
  operator_name text,
  contracting_entity_name text,
  address text,
  city text,
  state_region text,
  country text,
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  website text,
  website_domain text,
  gate_decision text,
  gate_confidence numeric(5,4),
  gate_reasons jsonb not null default '[]'::jsonb,
  lifecycle_status text not null default 'DISCOVERED',
  operational_facility_id uuid,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_candidates_run_idx
  on research_candidates (research_run_id);
create index if not exists research_candidates_normalized_idx
  on research_candidates (normalized_name, country);
create index if not exists research_candidates_domain_idx
  on research_candidates (website_domain)
  where website_domain is not null;
create index if not exists research_candidates_gate_idx
  on research_candidates (gate_decision);

create table if not exists evidence_sources (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid references research_runs(id) on delete cascade,
  candidate_id uuid references research_candidates(id) on delete cascade,
  evidence_type text not null,
  source_url text,
  source_title text,
  source_domain text,
  excerpt text,
  structured_data jsonb not null default '{}'::jsonb,
  retrieved_at timestamptz not null default now(),
  confidence numeric(5,4)
);

create index if not exists research_evidence_candidate_idx
  on evidence_sources (candidate_id);
create index if not exists research_evidence_run_idx
  on evidence_sources (research_run_id);

create table if not exists contact_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references research_candidates(id) on delete cascade,
  full_name text,
  title text,
  department text,
  email text,
  phone text,
  linkedin_url text,
  email_verified boolean not null default false,
  source_url text,
  confidence numeric(5,4),
  disposition text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create index if not exists contact_candidates_candidate_idx
  on contact_candidates (candidate_id);

create table if not exists service_findings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references research_candidates(id) on delete cascade,
  service_name text not null,
  availability_status text not null default 'DOCUMENTED',
  source_url text,
  excerpt text,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);

create index if not exists service_findings_candidate_idx
  on service_findings (candidate_id);

create table if not exists pricing_findings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references research_candidates(id) on delete cascade,
  service_name text not null,
  amount numeric(14,2),
  currency char(3),
  pricing_type text not null default 'POSTED',
  source_url text,
  excerpt text,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);

create index if not exists pricing_findings_candidate_idx
  on pricing_findings (candidate_id);

create table if not exists candidate_matches (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references research_candidates(id) on delete cascade,
  source_system text not null,
  source_record_id text,
  match_type text not null,
  match_score numeric(5,4),
  matched_name text,
  matched_payload jsonb not null default '{}'::jsonb,
  decision text,
  created_at timestamptz not null default now()
);

create index if not exists candidate_matches_candidate_idx
  on candidate_matches (candidate_id);

create table if not exists model_decisions (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid references research_runs(id) on delete cascade,
  candidate_id uuid references research_candidates(id) on delete cascade,
  task_type text not null,
  model_provider text,
  model_name text,
  decision jsonb not null,
  confidence numeric(5,4),
  input_hash text,
  created_at timestamptz not null default now()
);

create index if not exists model_decisions_candidate_idx
  on model_decisions (candidate_id);

create table if not exists research_events (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references research_runs(id) on delete cascade,
  candidate_id uuid references research_candidates(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists research_events_run_idx
  on research_events (research_run_id, created_at);
