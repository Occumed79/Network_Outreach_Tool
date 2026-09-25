-- Seed core provider profiles and the approved master provider-account email.

insert into provider_type_profiles
  (id, label, agreement_template_key, email_template_key, required_capabilities, preferred_contact_roles, excluded_entity_kinds)
values
  ('dental', 'Dental', 'dental', 'dental-initial',
   '["Comprehensive dental examination","Bitewing radiographs","Panoramic radiograph"]',
   '["Practice Manager","Owner","Operations Manager","Corporate Accounts"]',
   '["referral network","insurance network","third-party administrator"]'),
  ('occupational_health', 'Occupational Health', 'overseas-medical', 'medical-initial',
   '["Physical examination"]',
   '["Occupational Health Manager","Operations Manager","Corporate Accounts","Provider Relations"]',
   '["workers compensation network","third-party administrator","referral network"]'),
  ('hospital', 'Hospital / Multispecialty', 'overseas-medical', 'medical-initial',
   '[]',
   '["Business Development","Corporate Relations","Operations","International Business"]',
   '["referral network"]'),
  ('laboratory', 'Laboratory', 'overseas-medical', 'lab-initial',
   '["Specimen collection"]',
   '["Corporate Accounts","Lab Manager","Business Development"]',
   '["lab ordering marketplace"]'),
  ('cardiology', 'Cardiology', 'cardiovascular', 'cardiology-initial',
   '[]',
   '["Practice Manager","Operations Manager","Business Development"]',
   '["referral network"]'),
  ('vaccination', 'Vaccination / Travel Medicine', 'overseas-medical', 'vaccination-initial',
   '["Vaccination"]',
   '["Clinic Manager","Travel Medicine Manager","Operations"]',
   '["coupon site","directory"]'),
  ('imaging', 'Imaging', 'overseas-medical', 'imaging-initial',
   '[]',
   '["Center Manager","Operations Manager","Corporate Accounts"]',
   '["referral network"]'),
  ('audiology', 'Audiology', 'overseas-medical', 'audiology-initial',
   '["Pure-tone audiometry"]',
   '["Clinic Manager","Audiology Lead","Operations Manager"]',
   '["hearing-aid directory"])
on conflict (id) do update set
  label = excluded.label,
  agreement_template_key = excluded.agreement_template_key,
  email_template_key = excluded.email_template_key,
  required_capabilities = excluded.required_capabilities,
  preferred_contact_roles = excluded.preferred_contact_roles,
  excluded_entity_kinds = excluded.excluded_entity_kinds,
  updated_at = now();

insert into email_templates
  (template_key, provider_type, name, subject_template, body_template, default_cc)
values
  (
    'medical-initial',
    'occupational_health',
    'Provider Account Setup - Medical / Occupational Health',
    'Provider Account Setup – Occu-Med | {{facility_name}}',
    $BODY$
Hello {{contact_or_team}},

I hope you are doing well.

My name is Alex, and I am reaching out on behalf of Occu-Med, a healthcare and human resources consultancy headquartered in Fresno, California. We coordinate occupational-health examinations and related medical services for civilian employees and contractors working internationally, including individuals supporting U.S. Department of Defense and Department of State operations.

We are currently looking to establish a direct provider account with your facility so that Occu-Med can refer individuals to you for occupational and periodic medical evaluations as needed. Occu-Med would be responsible for payment for all services we authorize.

Based on the services offered by your facility, I wanted to contact you directly to learn what would be required to establish the account and begin referring individuals to you.

For context, these evaluations are performed for assessment and documentation purposes. Your clinicians would perform the requested services and document the individual's current health status, examination findings, and any relevant or concerning findings identified during the evaluation. Your providers would not be responsible for making the final U.S. employment or deployment clearance decision.

Once the evaluation is completed, the results would be forwarded to Occu-Med, where our medical review team would review the documentation against the applicable guidelines and the requesting employer's specific requirements.

Each referral would be coordinated with your facility in advance and accompanied by an authorization identifying the exact examinations, laboratory testing, imaging, vaccinations, or other services requested. Occu-Med would pay your facility directly for all authorized services, without the use of insurance or third-party payers.

I have attached Occu-Med's standard service agreement and pricing form for your review. The form allows your facility to indicate the services you are able to provide and the rates at which you would bill Occu-Med when those services are rendered.

If your facility has its own standard employer, corporate, or occupational-health agreement that you would prefer us to complete, we would be very happy to review and execute your documentation instead.

Please let me know if you have any questions or require any additional information from our end.

Thank you very much for your time and consideration. We look forward to the opportunity to work with you.

Thank You!

Best Regards,
Alex Ayvazian
Network Management Analyst
Occu-Med, Ltd.
$BODY$,
    array['mcaskey@occu-med.com']::text[]
  ),
  (
    'dental-initial',
    'dental',
    'Provider Account Setup - Dental',
    'Provider Account Setup – Occu-Med | {{facility_name}}',
    $BODY$
Hello {{contact_or_team}},

I hope you are doing well.

My name is Alex, and I am reaching out on behalf of Occu-Med, a healthcare and human resources consultancy headquartered in Fresno, California. We coordinate required medical and dental evaluations for civilian employees and contractors working internationally.

We are currently looking to establish a direct provider account with your practice so that Occu-Med can refer individuals to you for dental evaluations and related diagnostic services as needed. Occu-Med would be responsible for payment for all services we authorize.

For these referrals, the examining dentist would be asked to document the individual's current oral health, identify any treatment that is recommended, and complete the documentation supplied by Occu-Med. The provider would not be responsible for making an employment or deployment clearance decision.

Each referral would be coordinated with your practice in advance and accompanied by an authorization identifying the exact evaluation and imaging requested. Occu-Med would pay your practice directly for all authorized services, without the use of insurance or third-party payers.

I have attached Occu-Med's standard dental service agreement and pricing form for your review. If your practice has its own employer or corporate account documentation that you would prefer us to complete, we would be happy to review and execute it instead.

Please let me know if you have any questions or require any additional information from our end.

Thank you very much for your time and consideration. We look forward to the opportunity to work with you.

Thank You!

Best Regards,
Alex Ayvazian
Network Management Analyst
Occu-Med, Ltd.
$BODY$,
    array['mcaskey@occu-med.com']::text[]
  )
on conflict (template_key) do update set
  provider_type = excluded.provider_type,
  name = excluded.name,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  default_cc = excluded.default_cc,
  version = email_templates.version + 1,
  updated_at = now();
