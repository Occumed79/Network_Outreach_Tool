import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  PROVIDER_TYPE_PROFILES,
  normalizeProviderName,
  type ProviderCandidate
} from '@network-outreach/core';
import { config } from './config.js';
import { databaseHealth, operationalDb, researchDb } from './db.js';
import { evaluateProvider } from './providerGate.js';

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'network-outreach-api',
    databases: await databaseHealth(),
    adapters: {
      networkMap: Boolean(config.networkMapApiUrl),
      internationalSearch: Boolean(config.internationalSearchApiUrl),
      agreementGenerator: Boolean(config.agreementGeneratorUrl)
    }
  });
});

app.get('/api/provider-types', (_req, res) => {
  res.json({ providerTypes: PROVIDER_TYPE_PROFILES });
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
  sourceUrl: z.string().url().nullish()
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
    'select * from research_runs order by created_at desc limit 50'
  );
  res.json({ runs: result.rows });
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
        coalesce(pc.email, '') as primary_email,
        coalesce(pc.full_name, '') as primary_contact,
        ad.storage_url as agreement_url
      from campaign_targets ct
      join campaigns c on c.id = ct.campaign_id
      join facilities f on f.id = ct.facility_id
      left join contacts pc on pc.facility_id = f.id and pc.is_primary = true
      left join lateral (
        select storage_url
        from agreement_documents
        where campaign_target_id = ct.id
        order by created_at desc
        limit 1
      ) ad on true
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
        (name, normalized_name, country, city, address, website, website_domain, phone, phone_normalized, provider_type)
      values
        ($1, $2, $3, $4, $5, $6, nullif(regexp_replace(lower(coalesce($6,'')), '^https?://(www\\.)?|/.*$', '', 'g'), ''), $7, regexp_replace(coalesce($7,''), '[^0-9+]', '', 'g'), $8)
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
      data.providerType || null
    ]
  );

  res.status(201).json({ facility: result.rows[0] });
});

app.listen(config.port, () => {
  console.log(`Network Outreach API listening on http://localhost:${config.port}`);
});
