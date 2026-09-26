import { config } from './config.js';
import { operationalDb } from './db.js';

function replaceTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceTemplate(`{{${key}}}`, value);
  }
  return result;
}

async function requestAgreement(payload: Record<string, unknown>) {
  if (!config.agreementGeneratorUrl) {
    return {
      status: 'WAITING_INTEGRATION',
      externalId: null,
      fileName: null,
      storageUrl: null,
      sha256: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${config.agreementGeneratorUrl.replace(/\/$/, '')}/api/outreach/generate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      return {
        status: 'GENERATOR_ERROR',
        externalId: null,
        fileName: null,
        storageUrl: null,
        sha256: null
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      status: typeof data.status === 'string' ? data.status : 'GENERATED',
      externalId: typeof data.id === 'string' ? data.id : null,
      fileName: typeof data.fileName === 'string' ? data.fileName : null,
      storageUrl: typeof data.storageUrl === 'string' ? data.storageUrl : null,
      sha256: typeof data.sha256 === 'string' ? data.sha256 : null
    };
  } catch {
    return {
      status: 'GENERATOR_ERROR',
      externalId: null,
      fileName: null,
      storageUrl: null,
      sha256: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function targetReadiness(psaNeeded: boolean, agreementStatus?: string | null) {
  if (!psaNeeded) return { status: 'READY', readyForExport: true } as const;
  if (agreementStatus === 'GENERATED') return { status: 'READY', readyForExport: true } as const;
  return { status: 'WAITING_ON_PSA', readyForExport: false } as const;
}

export async function prepareCampaignTarget(targetId: string) {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const detail = await operationalDb.query(
    `
      select
        ct.id as target_id,
        ct.status as target_status,
        ct.psa_needed,
        f.id as facility_id,
        f.name as facility_name,
        f.address,
        f.city,
        f.state_region,
        f.postal_code,
        f.country,
        f.provider_type,
        f.general_email,
        p.agreement_template_key,
        p.email_template_key,
        t.subject_template,
        t.body_template,
        t.default_cc,
        c.id as contact_id,
        c.full_name as contact_name,
        c.email as contact_email
      from campaign_targets ct
      join facilities f on f.id = ct.facility_id
      left join provider_type_profiles p on p.id = f.provider_type
      left join email_templates t on t.template_key = p.email_template_key and t.active = true
      left join contacts c on c.facility_id = f.id and c.is_primary = true
      where ct.id = $1
      limit 1
    `,
    [targetId]
  );

  const row = detail.rows[0];
  if (!row) throw new Error('Campaign target was not found.');
  if (!row.email_template_key || !row.subject_template || !row.body_template) {
    throw new Error('No active email template is configured for this provider type.');
  }

  const toEmail = String(row.contact_email || row.general_email || '').trim();
  if (!toEmail) {
    throw new Error('No usable provider email is available for this target.');
  }

  const greeting = row.contact_name ? String(row.contact_name) : 'Team';
  const subject = replaceTemplate(String(row.subject_template), {
    facility_name: String(row.facility_name),
    contact_or_team: greeting
  });
  const body = replaceTemplate(String(row.body_template), {
    facility_name: String(row.facility_name),
    contact_or_team: greeting
  });

  const existing = await operationalDb.query(
    `
      select *
      from outreach_messages
      where campaign_target_id = $1
        and status in ('READY', 'DRAFTED', 'SENT')
      order by created_at desc
      limit 1
    `,
    [targetId]
  );

  let message = existing.rows[0] || null;
  if (!message) {
    const inserted = await operationalDb.query(
      `
        insert into outreach_messages
          (campaign_target_id, contact_id, template_key, to_email, cc_emails, subject, body, status)
        values
          ($1, $2, $3, $4, $5, $6, $7, 'READY')
        returning *
      `,
      [
        targetId,
        row.contact_id || null,
        row.email_template_key,
        toEmail,
        row.default_cc || ['mcaskey@occu-med.com'],
        subject,
        body
      ]
    );
    message = inserted.rows[0];
  }

  const currentAgreement = await operationalDb.query(
    `
      select *
      from agreement_documents
      where campaign_target_id = $1
      order by created_at desc
      limit 1
    `,
    [targetId]
  );

  let agreement = currentAgreement.rows[0] || null;
  if (!agreement && row.psa_needed) {
    const address = [
      row.address,
      row.city,
      row.state_region,
      row.postal_code,
      row.country
    ].filter(Boolean).join(', ');

    const generated = await requestAgreement({
      campaignTargetId: targetId,
      facilityId: row.facility_id,
      providerName: row.facility_name,
      providerType: row.provider_type,
      address,
      country: row.country,
      templateKey: row.agreement_template_key
    });

    const inserted = await operationalDb.query(
      `
        insert into agreement_documents
          (facility_id, campaign_target_id, template_key, generator_external_id, file_name, storage_url, sha256, generation_status, generated_at)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, case when $8 = 'GENERATED' then now() else null end)
        returning *
      `,
      [
        row.facility_id,
        targetId,
        row.agreement_template_key,
        generated.externalId,
        generated.fileName,
        generated.storageUrl,
        generated.sha256,
        generated.status
      ]
    );
    agreement = inserted.rows[0];
  }

  const readiness = targetReadiness(Boolean(row.psa_needed), agreement?.generation_status);

  await operationalDb.query(
    `
      update campaign_targets
      set status = $2,
          updated_at = now()
      where id = $1
    `,
    [targetId, readiness.status]
  );

  return { message, agreement, ...readiness };
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceTemplate('"', '""')}"`;
  return text;
}

export async function exportReadyQueueCsv(): Promise<string> {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const result = await operationalDb.query(
    `
      select
        om.id as outreach_message_id,
        ct.id as campaign_target_id,
        c.name as campaign,
        f.name as provider,
        f.city,
        f.country,
        coalesce(pc.full_name, '') as contact_name,
        om.to_email,
        array_to_string(om.cc_emails, '; ') as cc_email,
        om.subject,
        om.body,
        coalesce(ad.file_name, '') as agreement_file,
        coalesce(ad.storage_url, '') as agreement_url,
        om.status
      from outreach_messages om
      join campaign_targets ct on ct.id = om.campaign_target_id
      join campaigns c on c.id = ct.campaign_id
      join facilities f on f.id = ct.facility_id
      left join contacts pc on pc.id = om.contact_id
      left join lateral (
        select file_name, storage_url
        from agreement_documents
        where campaign_target_id = ct.id
        order by created_at desc
        limit 1
      ) ad on true
      where om.status = 'READY'
        and ct.status = 'READY'
        and (ct.psa_needed = false or ad.generation_status = 'GENERATED')
      order by c.created_at, f.country, f.city, f.name
    `
  );

  const headers = [
    'Outreach Message ID',
    'Campaign Target ID',
    'Campaign',
    'Provider',
    'City',
    'Country',
    'Contact Name',
    'To Email',
    'CC Email',
    'Subject',
    'Email Body',
    'Agreement File',
    'Agreement URL',
    'Status'
  ];

  const rows = result.rows.map((row) => [
    row.outreach_message_id,
    row.campaign_target_id,
    row.campaign,
    row.provider,
    row.city,
    row.country,
    row.contact_name,
    row.to_email,
    row.cc_email,
    row.subject,
    row.body,
    row.agreement_file,
    row.agreement_url,
    row.status
  ]);

  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
}
