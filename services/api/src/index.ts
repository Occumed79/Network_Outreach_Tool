import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  PROVIDER_TYPE_PROFILES,
  type ProviderCandidate
} from '@network-outreach/core';
import { config } from './config.js';
import { databaseHealth, operationalDb } from './db.js';
import { evaluateProvider } from './providerGate.js';
import {
  campaignIntake,
  ingestProviders,
  parseProviderCsv,
  type IntakeProvider
} from './intake.js';
import {
  exportReadyQueueCsv,
  prepareCampaignBatch,
  prepareCampaignTarget
} from './outreach.js';

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'network-outreach-api',
    database: await databaseHealth(),
    integrations: {
      existingNetworkExclusion: Boolean(config.internationalSearchApiUrl),
      agreementGenerator: Boolean(config.agreementGeneratorUrl),
      networkMapIntake: true
    }
  });
});

app.get('/api/provider-types', (_req, res) => {
  res.json({ providerTypes: PROVIDER_TYPE_PROFILES });
});

const providerSchema = z.object({
  name: z.string().min(1),
  country: z.string().optional().default(''),
  city: z.string().nullish(),
  stateRegion: z.string().nullish(),
  postalCode: z.string().nullish(),
  address: z.string().nullish(),
  website: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  contactName: z.string().nullish(),
  contactTitle: z.string().nullish(),
  providerType: z.string().nullish(),
  sourceUrl: z.string().url().nullish(),
  sourceSystem: z.string().nullish(),
  sourceRecordId: z.string().nullish(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).nullish(),
  psaNeeded: z.boolean().optional(),
  pricingRequested: z.boolean().optional(),
  notes: z.string().nullish(),
  services: z.array(z.string().min(1)).max(100).optional()
});

app.post('/api/provider-gate/evaluate', async (req, res) => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.country) {
    res.status(400).json({
      error: 'Provider name and country are required.',
      details: parsed.success ? undefined : parsed.error.flatten()
    });
    return;
  }

  try {
    const result = await evaluateProvider(parsed.data as ProviderCandidate);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Provider gate failed'
    });
  }
});

const campaignSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(3000).optional(),
  providerType: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  owner: z.string().default('Alex'),
  expectedProviders: z.number().int().positive().max(100000).optional(),
  intakeSource: z.string().max(100).optional()
});

app.post('/api/campaigns', async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid campaign', details: parsed.error.flatten() });
    return;
  }
  if (!operationalDb) {
    res.status(503).json({ error: 'Operational database is not configured.' });
    return;
  }

  const data = parsed.data;
  const result = await operationalDb.query(
    `
      insert into campaigns
        (
          name, description, provider_type, country, city,
          status, owner, provider_count_expected, intake_source
        )
      values
        ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8)
      returning *
    `,
    [
      data.name,
      data.description || null,
      data.providerType || null,
      data.country || null,
      data.city || null,
      data.owner,
      data.expectedProviders || null,
      data.intakeSource || null
    ]
  );

  res.status(201).json({ campaign: result.rows[0] });
});

app.get('/api/campaigns', async (_req, res) => {
  if (!operationalDb) {
    res.json({ campaigns: [] });
    return;
  }

  const result = await operationalDb.query(
    `
      select
        c.*,
        count(distinct ct.id)::int as target_count,
        count(distinct ct.id) filter (where ct.status = 'READY')::int as ready_count,
        count(distinct ct.id) filter (where ct.status = 'NEED_FOLLOW_UP')::int as follow_up_count,
        count(distinct ct.id) filter (where ct.status = 'WAITING_ON_PSA')::int as waiting_psa_count,
        count(distinct cir.id) filter (where cir.disposition in ('EXCLUDED','DUPLICATE_INPUT'))::int as excluded_count,
        count(distinct cir.id) filter (where cir.disposition = 'REVIEW')::int as review_count,
        count(distinct om.id) filter (where om.status = 'SENT')::int as sent_count,
        count(distinct om.id) filter (where om.status = 'BOUNCED')::int as bounced_count,
        count(distinct om.id) filter (where om.replied_at is not null)::int as replied_count
      from campaigns c
      left join campaign_targets ct on ct.campaign_id = c.id
      left join campaign_intake_rows cir on cir.campaign_id = c.id
      left join outreach_messages om on om.campaign_target_id = ct.id
      group by c.id
      order by c.created_at desc
      limit 200
    `
  );

  res.json({ campaigns: result.rows });
});

app.get('/api/campaigns/:campaignId', async (req, res) => {
  if (!operationalDb) {
    res.status(503).json({ error: 'Operational database is not configured.' });
    return;
  }

  const result = await operationalDb.query(
    `
      select
        c.*,
        count(distinct ct.id)::int as target_count,
        count(distinct ct.id) filter (where ct.status = 'NOT_STARTED')::int as not_started_count,
        count(distinct ct.id) filter (where ct.status = 'READY')::int as ready_count,
        count(distinct ct.id) filter (where ct.status = 'WAITING_ON_PSA')::int as waiting_psa_count,
        count(distinct ct.id) filter (where ct.status = 'NEED_FOLLOW_UP')::int as follow_up_count,
        count(distinct cir.id) filter (where cir.disposition in ('EXCLUDED','DUPLICATE_INPUT'))::int as excluded_count,
        count(distinct cir.id) filter (where cir.disposition = 'REVIEW')::int as review_count,
        count(distinct cir.id) filter (where cir.disposition = 'ERROR')::int as error_count,
        count(distinct om.id) filter (where om.status = 'SENT')::int as sent_count,
        count(distinct om.id) filter (where om.status = 'BOUNCED')::int as bounced_count,
        count(distinct om.id) filter (where om.replied_at is not null)::int as replied_count
      from campaigns c
      left join campaign_targets ct on ct.campaign_id = c.id
      left join campaign_intake_rows cir on cir.campaign_id = c.id
      left join outreach_messages om on om.campaign_target_id = ct.id
      where c.id = $1
      group by c.id
      limit 1
    `,
    [req.params.campaignId]
  );

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Campaign was not found.' });
    return;
  }

  const imports = await operationalDb.query(
    `
      select *
      from campaign_imports
      where campaign_id = $1
      order by created_at desc
      limit 50
    `,
    [req.params.campaignId]
  );

  res.json({ campaign: result.rows[0], imports: imports.rows });
});

app.get('/api/dashboard', async (_req, res) => {
  if (!operationalDb) {
    res.json({
      activeCampaigns: 0,
      providersInOutreach: 0,
      ready: 0,
      sent: 0,
      followUpDue: 0,
      replies: 0,
      bounced: 0,
      needsReview: 0
    });
    return;
  }

  const result = await operationalDb.query(
    `
      select
        (select count(*)::int from campaigns where status = 'ACTIVE') as active_campaigns,
        (select count(*)::int from campaign_targets) as providers_in_outreach,
        (select count(*)::int from campaign_targets where status = 'READY') as ready,
        (select count(*)::int from campaign_targets where status = 'NEED_FOLLOW_UP') as follow_up_due,
        (select count(*)::int from campaign_intake_rows where disposition = 'REVIEW') as needs_review,
        (select count(*)::int from outreach_messages where status = 'SENT') as sent,
        (select count(*)::int from outreach_messages where status = 'BOUNCED') as bounced,
        (select count(*)::int from outreach_messages where replied_at is not null) as replies
    `
  );

  const row = result.rows[0];
  res.json({
    activeCampaigns: row.active_campaigns,
    providersInOutreach: row.providers_in_outreach,
    ready: row.ready,
    sent: row.sent,
    followUpDue: row.follow_up_due,
    replies: row.replies,
    bounced: row.bounced,
    needsReview: row.needs_review
  });
});

app.post('/api/campaigns/:campaignId/providers', async (req, res) => {
  const parsed = z.object({
    providers: z.array(providerSchema).min(1).max(5000),
    sourceType: z.string().max(100).optional(),
    fileName: z.string().max(500).nullish(),
    createdBy: z.string().max(120).optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid provider intake', details: parsed.error.flatten() });
    return;
  }

  try {
    const summary = await ingestProviders(
      req.params.campaignId,
      parsed.data.providers as IntakeProvider[],
      {
        sourceType: parsed.data.sourceType || 'MANUAL',
        fileName: parsed.data.fileName || null,
        createdBy: parsed.data.createdBy || 'Alex'
      }
    );
    res.status(201).json(summary);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Provider intake failed'
    });
  }
});

app.post(
  '/api/campaigns/:campaignId/import.csv',
  express.text({ type: ['text/csv', 'text/plain', 'application/csv'], limit: '10mb' }),
  async (req, res) => {
    if (!operationalDb) {
      res.status(503).json({ error: 'Operational database is not configured.' });
      return;
    }

    try {
      const campaignResult = await operationalDb.query(
        'select provider_type, country, city from campaigns where id = $1 limit 1',
        [req.params.campaignId]
      );
      const campaign = campaignResult.rows[0];
      if (!campaign) {
        res.status(404).json({ error: 'Campaign was not found.' });
        return;
      }

      const providers = parseProviderCsv(String(req.body || ''), {
        providerType: campaign.provider_type,
        country: campaign.country,
        city: campaign.city
      });

      const summary = await ingestProviders(
        req.params.campaignId,
        providers,
        {
          sourceType: String(req.query.sourceType || 'CSV'),
          fileName: String(req.query.fileName || 'provider-import.csv'),
          createdBy: String(req.query.createdBy || 'Alex')
        }
      );

      res.status(201).json(summary);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'CSV import failed'
      });
    }
  }
);

app.get('/api/intake/template.csv', (_req, res) => {
  const template = [
    'Provider Name,Country,City,State/Region,Address,Website,Phone,Email,Contact Name,Contact Title,Provider Type,Priority,PSA Needed,Pricing Requested,Services,Source URL,Source System,Source ID,Notes',
    'Example Clinic,Country,City,Region,123 Main St,https://example.com,+1 555 555 5555,contact@example.com,Jane Smith,Practice Manager,dental,HIGH,Yes,Yes,"Comprehensive dental examination; Bitewing radiographs",https://example.com,Network Map,provider-123,'
  ].join('\n');

  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="network-outreach-provider-import-template.csv"');
  res.send(template);
});

app.get('/api/campaigns/:campaignId/intake', async (req, res) => {
  try {
    res.json({ rows: await campaignIntake(req.params.campaignId) });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load campaign intake'
    });
  }
});

app.get('/api/campaigns/:campaignId/targets', async (req, res) => {
  if (!operationalDb) {
    res.json({ targets: [] });
    return;
  }

  const result = await operationalDb.query(
    `
      select
        ct.id,
        ct.campaign_id,
        f.id as facility_id,
        f.name as facility_name,
        f.city,
        f.country,
        f.provider_type,
        f.general_email,
        ct.status,
        ct.gate_decision,
        ct.priority,
        ct.owner,
        ct.pricing_requested,
        ct.psa_needed,
        ct.last_contact_at,
        ct.next_follow_up_at,
        ct.notes,
        coalesce(pc.full_name, '') as primary_contact,
        coalesce(pc.title, '') as contact_title,
        coalesce(pc.email, f.general_email, '') as primary_email,
        ad.id as agreement_id,
        ad.storage_url as agreement_url,
        ad.generation_status as agreement_status,
        om.status as message_status,
        om.sent_at,
        om.replied_at,
        om.bounced_at
      from campaign_targets ct
      join facilities f on f.id = ct.facility_id
      left join contacts pc on pc.facility_id = f.id and pc.is_primary = true
      left join lateral (
        select id, storage_url, generation_status
        from agreement_documents
        where campaign_target_id = ct.id
        order by created_at desc
        limit 1
      ) ad on true
      left join lateral (
        select status, sent_at, replied_at, bounced_at
        from outreach_messages
        where campaign_target_id = ct.id
        order by created_at desc
        limit 1
      ) om on true
      where ct.campaign_id = $1
      order by
        case ct.priority
          when 'URGENT' then 0
          when 'HIGH' then 1
          when 'MEDIUM' then 2
          else 3
        end,
        f.country,
        f.city,
        f.name
      limit 5000
    `,
    [req.params.campaignId]
  );

  res.json({ targets: result.rows });
});

app.post('/api/campaigns/:campaignId/prepare', async (req, res) => {
  const parsed = z.object({
    targetIds: z.array(z.string().uuid()).max(5000).optional()
  }).safeParse(req.body ?? {});

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid preparation request', details: parsed.error.flatten() });
    return;
  }

  try {
    const summary = await prepareCampaignBatch(
      req.params.campaignId,
      parsed.data.targetIds
    );
    res.json(summary);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Campaign preparation failed'
    });
  }
});

app.post('/api/campaign-targets/:targetId/prepare', async (req, res) => {
  try {
    const result = await prepareCampaignTarget(req.params.targetId);
    res.json(result);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Could not prepare outreach target'
    });
  }
});

const statusSchema = z.object({
  status: z.enum([
    'NOT_STARTED',
    'READY',
    'CONTACTED',
    'WAITING_ON_PRICING',
    'WAITING_ON_PSA',
    'NEED_FOLLOW_UP',
    'READY_TO_USE',
    'NO_FIT',
    'ON_HOLD',
    'COMPLETED',
    'DECLINED',
    'BOUNCED'
  ]),
  notes: z.string().max(5000).optional(),
  nextFollowUpAt: z.string().datetime().nullish()
});

app.patch('/api/campaign-targets/:targetId/status', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status update', details: parsed.error.flatten() });
    return;
  }
  if (!operationalDb) {
    res.status(503).json({ error: 'Operational database is not configured.' });
    return;
  }

  const data = parsed.data;
  const result = await operationalDb.query(
    `
      update campaign_targets
      set
        status = $2,
        notes = coalesce($3, notes),
        next_follow_up_at = $4,
        last_contact_at = case
          when $2 in ('CONTACTED','WAITING_ON_PRICING','WAITING_ON_PSA','NEED_FOLLOW_UP')
          then coalesce(last_contact_at, now())
          else last_contact_at
        end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      req.params.targetId,
      data.status,
      data.notes || null,
      data.nextFollowUpAt || null
    ]
  );

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Campaign target was not found.' });
    return;
  }

  await operationalDb.query(
    `
      insert into outreach_events
        (campaign_target_id, event_type, method, outcome, notes, next_follow_up_at)
      values
        ($1, 'STATUS_CHANGE', 'NETWORK_OUTREACH', $2, $3, $4)
    `,
    [
      req.params.targetId,
      data.status,
      data.notes || null,
      data.nextFollowUpAt || null
    ]
  );

  res.json({ target: result.rows[0] });
});

app.get('/api/outreach/queue', async (req, res) => {
  if (!operationalDb) {
    res.json({ targets: [] });
    return;
  }

  const campaignId = typeof req.query.campaignId === 'string'
    ? req.query.campaignId
    : null;

  const result = await operationalDb.query(
    `
      select
        ct.id,
        ct.campaign_id,
        c.name as campaign_name,
        f.name as facility_name,
        f.city,
        f.country,
        f.provider_type,
        ct.status,
        ct.priority,
        ct.owner,
        ct.pricing_requested,
        ct.psa_needed,
        ct.last_contact_at,
        ct.next_follow_up_at,
        coalesce(pc.email, f.general_email, '') as primary_email,
        coalesce(pc.full_name, '') as primary_contact,
        ad.storage_url as agreement_url,
        ad.generation_status as agreement_status,
        om.status as message_status
      from campaign_targets ct
      join campaigns c on c.id = ct.campaign_id
      join facilities f on f.id = ct.facility_id
      left join contacts pc on pc.facility_id = f.id and pc.is_primary = true
      left join lateral (
        select storage_url, generation_status
        from agreement_documents
        where campaign_target_id = ct.id
        order by created_at desc
        limit 1
      ) ad on true
      left join lateral (
        select status
        from outreach_messages
        where campaign_target_id = ct.id
        order by created_at desc
        limit 1
      ) om on true
      where ($1::uuid is null or ct.campaign_id = $1::uuid)
      order by
        case ct.priority
          when 'URGENT' then 0
          when 'HIGH' then 1
          when 'MEDIUM' then 2
          else 3
        end,
        ct.next_follow_up_at nulls last,
        ct.created_at desc
      limit 5000
    `,
    [campaignId]
  );

  res.json({ targets: result.rows });
});

app.get('/api/agreements/:agreementId/download', async (req, res) => {
  if (!operationalDb) {
    res.status(503).json({ error: 'Operational database is not configured.' });
    return;
  }

  const result = await operationalDb.query(
    `
      select file_name, content_type, file_bytes, generation_status
      from agreement_documents
      where id = $1
      limit 1
    `,
    [req.params.agreementId]
  );

  const document = result.rows[0];
  if (!document || document.generation_status !== 'GENERATED' || !document.file_bytes) {
    res.status(404).json({ error: 'Generated agreement was not found.' });
    return;
  }

  const fileName = String(document.file_name || 'provider-agreement.docx')
    .replace(/[\r\n"]/g, '');
  res.setHeader('content-type', document.content_type || 'application/octet-stream');
  res.setHeader('content-disposition', `attachment; filename="${fileName}"`);
  res.send(document.file_bytes);
});

app.get('/api/outreach/export.csv', async (req, res) => {
  try {
    const campaignId = typeof req.query.campaignId === 'string'
      ? req.query.campaignId
      : undefined;
    const csv = await exportReadyQueueCsv(campaignId);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="network-outreach-ready.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not export outreach queue'
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(here, '../../../apps/web/dist');

  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    console.warn(`[web] production web bundle not found at ${webDist}`);
  }
}

app.listen(config.port, () => {
  console.log(`Network Outreach API listening on http://localhost:${config.port}`);
});
