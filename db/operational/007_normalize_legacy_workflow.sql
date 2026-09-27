-- Normalize legacy prototype workflow state to the outreach-only lifecycle.

update campaign_targets
set status = 'NOT_STARTED',
    updated_at = now()
where status = 'RESEARCHING';

alter table campaigns
  drop column if exists research_run_id;
