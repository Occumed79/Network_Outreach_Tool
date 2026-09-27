-- Ensure every configured provider type can route to an outreach email template.
-- Specialized templates can later replace these inherited general templates.

insert into email_templates
  (template_key, provider_type, name, subject_template, body_template, default_cc, active, version)
select
  route.template_key,
  route.provider_type,
  route.display_name,
  base.subject_template,
  base.body_template,
  base.default_cc,
  true,
  1
from (
  values
    ('lab-initial', 'laboratory', 'Provider Account Setup - Laboratory'),
    ('cardiology-initial', 'cardiology', 'Provider Account Setup - Cardiology'),
    ('vaccination-initial', 'vaccination', 'Provider Account Setup - Vaccination / Travel Medicine'),
    ('imaging-initial', 'imaging', 'Provider Account Setup - Imaging'),
    ('audiology-initial', 'audiology', 'Provider Account Setup - Audiology')
) as route(template_key, provider_type, display_name)
cross join lateral (
  select subject_template, body_template, default_cc
  from email_templates
  where template_key = 'medical-initial'
  limit 1
) base
on conflict (template_key) do nothing;
