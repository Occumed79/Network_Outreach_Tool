import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  PROVIDER_TYPE_PROFILES,
  RESEARCH_PRESETS,
  normalizeProviderName,
  type ProviderCandidate
} from '@network-outreach/core';
import { config } from './config.js';
import { databaseHealth, operationalDb, researchDb } from './db.js';
import { evaluateProvider } from './providerGate.js';
import { addResearchCandidate, listResearchCandidates, promoteResearchCandidate } from './research.js';
import { exportReadyQueueCsv, prepareCampaignTarget } from './outreach.js';

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'network-outreach-api',
    databases: await databaseHealth(),
    adapters: {
      existingNetwork: Boolean(config.networkMapApiUrl),
      priorResearch: Boolean(config.internationalSearchApiUrl),
      agreementGenerator: Boolean(config.agreementGeneratorUrl)
    }
  });
});

app.get('/api/provider-types', (_req, res) => {
  res.json({ providerTypes: PROVIDER_TYPE_PROFILES });
});

app.get('/api/research-presets', (_req, res) => {
  res.json({ presets: RESEARCH_PRESETS });
});

const candidateSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  city: z.string().nullish(),
  address: z.string().nullish(),
  website: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  providerType: z.string().nullish(),
  sourceUrl: z.string().url().nullish(),
  services: z.array(z.string().min(1)).max(50).optional()
});

app.post('/api/provider-gate/evaluate', async (req, res) => {
  const parsed = candidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid provider candidate', details: parsed.error.flatten() });
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

const researchRunSchema = z.object({
  prompt: z.string().min(3),
  providerType: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  requestedBy: z.string().default('Alex')
});

app.post('/api/research-runs', async (req, res) => {
  const parsed = researchRunSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid research request', details: parsed.error.flatten() });
    return;
  }

  const request = parsed.data;
  if (!researchDb) {
    res.status(503).json({
      error: 'Research database is not configured.',
      request
    });
    return;
  }

  const result = await researchDb.query(
    `
      insert into research_runs
        (prompt, provider_type, country, city, requested_by, status)
      values ($1, $2, $3, $4, $5, 'QUEUED')
      returning *
    `,
    [request.prompt, request.providerType || null, request.country || null, request.city || null, request.requestedBy]
  );

  res.status(201).json({ run: result.rows[0] });
});

app.get('/api/research-runs', async (_req, res) => {
  if (!researchDb) {
    res.json({ runs: [] });
    return;
  }

  const result = await researchDb.query(
    `
      select
        rr.*,
        (select count(*)::int from research_candidates rc where rc.research_run_id = rr.id) as candidate_count,
        (select count(*)::int from research_candidates rc where rc.research_run_id = rr.id and rc.gate_decision = 'NEW') as new_count,
        (select count(*)::int from research_candidates rc where rc.research_run_id = rr.id and rc.lifecycle_status = 'PROMOTED') as promoted_count
      from research_runs rr
      order by rr.created_at desc
      limit 50
    `
  );
  res.json({ runs: result.rows });
});

app.get('/api/research-runs/:runId/candidates', async (req, res) => {
  try {
    const candidates = await listResearchCandidates(req.params.runId);
    res.json({ candidates });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load research candidates'
    });
  }
});

app.post('/api/research-runs/:runId/candidates', async (req, res) => {
  const parsed = candidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid provider candidate', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await addResearchCandidate(
      req.params.runId,
      parsed.data as ProviderCandidate
    );
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not add research candidate'
    });
  }
});

app.post('/api/research-runs/:runId/campaign', async (req, res) => {
  if (!researchDb || !operationalDb) {
    res.status(503).json({ error: 'Both databases must be configured.' });
    return;
  }

  const runResult = await researchDb.query(
    'select * from research_runs where id = $1',
    [req.params.runId]
  );
  const run = runResult.rows[0];
  if (!run) {
    res.status(404).json({ error: 'Research run was not found.' });
    return;
  }

  const existing = await operationalDb.query(
    'select * from campaigns where research_run_id = $1 limit 1',
    [run.id]
  );
  if (existing.rows[0]) {
    res.json({ campaign: existing.rows[0], reused: true });
    return;
  }

  const name = [run.country, run.provider_type]
    .filter(Boolean)
    .map((value: string) => value.replaceAll('_', ' '))
    .join(' · ');

  const created = await operationalDb.query(
    `
      insert into campaigns
        (name, description, provider_type, country, city, original_request, status, owner, research_run_id)
      values
        ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8)
      returning *
    `,
    [
      name || `Research ${run.id}`,
      `Campaign created from research run ${run.id}`,
      run.provider_type,
      run.country,
      run.city,
      run.prompt,
      run.requested_by || 'Alex',
      run.id
    ]
  );

  res.status(201).json({ campaign: created.rows[0], reused: false });
});

app.post('/api/research-candidates/:candidateId/promote', async (req, res) => {
  const body = z.object({
    campaignId: z.string().uuid().optional(),
    override: z.boolean().default(false)
  }).safeParse(req.body ?? {});

  if (!body.success) {
    res.status(400).json({ error: 'Invalid promotion request', details: body.error.flatten() });
    return;
  }

  try {
    const result = await promoteResearchCandidate(
      req.params.candidateId,
      body.data.campaignId,
      body.data.override
    );
    res.status(201).json(result);
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Could not promote provider candidate'
    });
  }
});

const campaignSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  providerType: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  originalRequest: z.string().optional(),
  owner: z.string().default('Alex')
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
        (name, description, provider_type, country, city, original_request, status, owner)
      values
        ($1,$2,$3,$4,$5,$6,'ACTIVE',$7)
      returning *
    `,
    [
      data.name,
      data.description || null,
      data.providerType || null,
      data.country || null,
      data.city || null,
      data.originalRequest || null,
      data.owner
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
        count(ct.id)::int as target_count,
        count(ct.id) filter (where ct.status = 'READY')::int as ready_count,
        count(ct.id) filter (where ct.status = 'NEED_FOLLOW_UP')::int as follow_up_count
      from campaigns c
      left join campaign_targets ct on ct.campaign_id = c.id
      group by c.id
      order by c.created_at desc
      limit 100
    `
  );

  res.json({ campaigns: result.rows });
});

app.get('/api/outreach/queue', async (_req, res) => {
  if (!operationalDb) {
    res.json({ targets: [] });
    return;
  }

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
      order by
        case ct.priority
          when 'URGENT' then 0
          when 'HIGH' then 1
          when 'MEDIUM' then 2
          else 3
        end,
        ct.next_follow_up_at nulls last,
        ct.created_at desc
      limit 500
    `
  );

  res.json({ targets: result.rows });
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

app.get('/api/outreach/export.csv', async (_req, res) => {
  try {
    const csv = await exportReadyQueueCsv();
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="network-outreach-ready.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not export outreach queue'
    });
  }
});

app.post('/api/facilities', async (req, res) => {
  const parsed = candidateSchema.extend({
    organizationName: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid facility', details: parsed.error.flatten() });
    return;
  }
  if (!operationalDb) {
    res.status(503).json({ error: 'Operational database is not configured.' });
    return;
  }

  const data = parsed.data;
  const result = await operationalDb.query(
    `
      insert into facilities
        (name, normalized_name, country, city, address, website, website_domain, phone, phone_normalized, provider_type, general_email)
      values
        ($1, $2, $3, $4, $5, $6, nullif(regexp_replace(lower(coalesce($6,'')), '^https?://(www\\.)?|/.*$', '', 'g'), ''), $7, regexp_replace(coalesce($7,''), '[^0-9+]', '', 'g'), $8, $9)
      returning *
    `,
    [
      data.name,
      normalizeProviderName(data.name),
      data.country,
      data.city || null,
      data.address || null,
      data.website || null,
      data.phone || null,
      data.providerType || null,
      data.email || null
    ]
  );

  res.status(201).json({ facility: result.rows[0] });
});

app.listen(config.port, () => {
  console.log(`Network Outreach API listening on http://localhost:${config.port}`);
});
