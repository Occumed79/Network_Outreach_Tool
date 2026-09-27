-- Persist generated agreement artifacts owned by Network Outreach.
-- The Pricing Agreement Generator returns the generated document; this app
-- stores it with the outreach target so export/download remains durable.

alter table agreement_documents
  add column if not exists file_bytes bytea,
  add column if not exists content_type text;

create index if not exists agreement_documents_generated_idx
  on agreement_documents (campaign_target_id, generated_at desc)
  where generation_status = 'GENERATED';
