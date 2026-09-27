-- Network Outreach is an outreach execution system, not a research app.
-- Normalize legacy workflow state from the earlier prototype.

update campaign_targets
set status = 'NOT_STARTED',
    updated_at = now()
where status = 'RESEARCHING';

alter table campaigns
  drop column if exists research_run_id;
