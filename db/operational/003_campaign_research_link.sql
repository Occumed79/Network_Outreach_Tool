-- Link operational campaigns to research runs stored in DATABASE_URL_2.
-- No cross-database foreign key is possible; the UUID is an external correlation id.

alter table campaigns
  add column if not exists research_run_id uuid;

create unique index if not exists campaigns_research_run_id_uidx
  on campaigns (research_run_id)
  where research_run_id is not null;
