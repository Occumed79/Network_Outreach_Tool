-- Seed baseline service capabilities used by provider-type profiles.
-- These are global capability definitions, not geography-specific campaign data.

insert into service_catalog (canonical_name, category, aliases)
values
  ('Comprehensive dental examination', 'Dental', array['comprehensive dental exam', 'comprehensive oral evaluation']),
  ('Bitewing radiographs', 'Dental', array['bitewings', 'bitewing x-rays', 'bitewing xrays']),
  ('Panoramic radiograph', 'Dental', array['panoramic x-ray', 'panorex', 'OPG']),
  ('Physical examination', 'Occupational Health', array['medical examination', 'occupational physical']),
  ('Specimen collection', 'Laboratory', array['blood draw', 'phlebotomy', 'sample collection']),
  ('Vaccination', 'Vaccination / Travel Medicine', array['immunization', 'vaccine administration']),
  ('Pure-tone audiometry', 'Audiology', array['pure tone audiogram', 'hearing test'])
on conflict (canonical_name) do update set
  category = excluded.category,
  aliases = excluded.aliases,
  active = true;
