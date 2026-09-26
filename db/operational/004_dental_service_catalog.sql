-- Seed the first vertical slice's required dental capabilities.

insert into service_catalog (canonical_name, category, aliases)
values
  ('Comprehensive dental examination', 'Dental', array['comprehensive dental exam', 'comprehensive oral evaluation']),
  ('Bitewing radiographs', 'Dental', array['bitewings', 'bitewing x-rays', 'bitewing xrays']),
  ('Panoramic radiograph', 'Dental', array['panoramic x-ray', 'panorex', 'OPG'])
on conflict (canonical_name) do update set
  category = excluded.category,
  aliases = excluded.aliases,
  active = true;
