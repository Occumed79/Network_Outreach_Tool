import { parse } from 'csv-parse/sync';
import {
  PROVIDER_TYPE_PROFILES,
  extractDomain,
  normalizePhone,
  normalizeProviderName,
  type GateDecision,
  type ProviderCandidate
} from '@network-outreach/core';
import { operationalDb } from './db.js';
import { evaluateProvider } from './providerGate.js';

export interface IntakeProvider extends ProviderCandidate {
  stateRegion?: string | null;
  postalCode?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  sourceSystem?: string | null;
  sourceRecordId?: string | null;
  priority?: string | null;
  psaNeeded?: boolean;
  pricingRequested?: boolean;
  notes?: string | null;
}

export interface IntakeSummary {
  importId: string;
  campaignId: string;
  total: number;
  accepted: number;
  excluded: number;
  review: number;
  errors: number;
  duplicateInput: number;
}

type CampaignDefaults = {
  id: string;
  provider_type: string | null;
  country: string | null;
  city: string | null;
  owner: string;
};

const EXCLUDED_DECISIONS = new Set<GateDecision>([
  'EXISTING_NETWORK',
  'ACTIVE_PROVIDER',
  'DECLINED',
  'DO_NOT_CONTACT',
  'INTERMEDIARY',
  'CLOSED'
]);

const REVIEW_DECISIONS = new Set<GateDecision>([
  'NEEDS_REVIEW'
]);

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function optional(value: unknown): string | null {
  const text = clean(value);
  return text || null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const text = clean(value).toLowerCase();
  if (!text) return fallback;
  if (['true', 'yes', 'y', '1', 'required'].includes(text)) return true;
  if (['false', 'no', 'n', '0', 'not required'].includes(text)) return false;
  return fallback;
}

function normalizePriority(value: unknown): string {
  const priority = clean(value).toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)
    ? priority
    : 'MEDIUM';
}

function normalizeProviderType(value: unknown): string | null {
  const raw = clean(value).toLowerCase();
  if (!raw) return null;

  const normalized = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const exact = PROVIDER_TYPE_PROFILES.find((profile) =>
    profile.id.toLowerCase() === normalized
    || profile.label.toLowerCase() === raw
    || profile.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === normalized
  );

  return exact?.id || normalized;
}

function splitServices(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(clean).filter(Boolean))];
  }

  const text = clean(value);
  if (!text) return [];

  return [...new Set(
    text.split(/[|;]+/).map((item) => clean(item)).filter(Boolean)
  )];
}

function batchIdentity(provider: IntakeProvider): string {
  const domain = extractDomain(provider.website || provider.email);
  const name = normalizeProviderName(provider.name);
  const address = clean(provider.address).toLowerCase();
  const city = clean(provider.city).toLowerCase();
  const country = clean(provider.country).toLowerCase();

  if (address) return ['address', name, address, country].join(':');
  if (domain) return ['domain', domain, name, city, country].join(':');
  return ['name', name, city, country].join(':');
}

function headerKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  const byKey = new Map(
    Object.entries(row).map(([key, value]) => [headerKey(key), value])
  );

  for (const alias of aliases) {
    const value = byKey.get(headerKey(alias));
    if (value !== undefined && clean(value)) return value;
  }
  return undefined;
}

export function parseProviderCsv(
  csvText: string,
  defaults: { providerType?: string | null; country?: string | null; city?: string | null } = {}
): IntakeProvider[] {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true
  }) as Array<Record<string, unknown>>;

  return rows.map((row, index) => {
    const name = clean(pick(row, [
      'Provider', 'Provider Name', 'Facility', 'Facility Name',
      'Clinic', 'Clinic Name', 'Practice', 'Practice Name', 'Name'
    ]));

    const country = clean(
      pick(row, ['Country', 'Nation'])
      ?? defaults.country
      ?? ''
    );

    if (!name) {
      throw new Error(`CSV row ${index + 2} is missing a provider/facility name.`);
    }
    if (!country) {
      throw new Error(`CSV row ${index + 2} is missing a country and the campaign has no default country.`);
    }

    const providerType = normalizeProviderType(
      pick(row, ['Provider Type', 'Facility Type', 'Type'])
      ?? defaults.providerType
    );

    return {
      name,
      country,
      city: optional(pick(row, ['City', 'Town']) ?? defaults.city),
      stateRegion: optional(pick(row, ['State', 'Region', 'State/Region', 'Province', 'Admin Area'])),
      postalCode: optional(pick(row, ['Postal Code', 'Postcode', 'ZIP', 'Zip Code'])),
      address: optional(pick(row, ['Address', 'Full Address', 'Street Address'])),
      website: optional(pick(row, ['Website', 'URL', 'Web Site'])),
      phone: optional(pick(row, ['Phone', 'Telephone', 'Tel'])),
      email: optional(pick(row, ['Email', 'To Email', 'Provider Email', 'Facility Email'])),
      contactName: optional(pick(row, ['Contact', 'Contact Name', 'Recipient', 'Recipient / Contact'])),
      contactTitle: optional(pick(row, ['Contact Title', 'Title', 'Role'])),
      providerType,
      sourceUrl: optional(pick(row, ['Source URL', 'Source', 'Evidence URL'])),
      sourceSystem: optional(pick(row, ['Source System', 'Source App'])) || 'CSV',
      sourceRecordId: optional(pick(row, ['Source ID', 'Record ID', 'Provider ID'])),
      priority: normalizePriority(pick(row, ['Priority'])),
      psaNeeded: booleanValue(pick(row, ['PSA Needed', 'Agreement Needed', 'PSA Required']), true),
      pricingRequested: booleanValue(pick(row, ['Pricing Requested', 'Request Pricing']), false),
      notes: optional(pick(row, ['Notes', 'Comments'])),
      services: splitServices(pick(row, ['Services', 'Capabilities', 'Requested Services']))
    };
  });
}

async function campaignDefaults(campaignId: string): Promise<CampaignDefaults> {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const result = await operationalDb.query<CampaignDefaults>(
    `
      select id::text, provider_type, country, city, owner
      from campaigns
      where id = $1
      limit 1
    `,
    [campaignId]
  );

  const campaign = result.rows[0];
  if (!campaign) throw new Error('Campaign was not found.');
  return campaign;
}

async function createImport(
  campaignId: string,
  sourceType: string,
  fileName: string | null,
  createdBy: string
): Promise<string> {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const result = await operationalDb.query(
    `
      insert into campaign_imports
        (campaign_id, source_type, file_name, created_by)
      values
        ($1, $2, $3, $4)
      returning id::text
    `,
    [campaignId, sourceType, fileName, createdBy]
  );

  return result.rows[0].id;
}

async function recordIntakeRow(
  campaignId: string,
  importId: string,
  rowNumber: number,
  provider: IntakeProvider,
  gate: {
    decision?: GateDecision | null;
    confidence?: number | null;
    reasons?: string[];
    matchedFacilityId?: string | null;
  },
  disposition: string,
  targetId: string | null,
  errorMessage: string | null = null
) {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  await operationalDb.query(
    `
      insert into campaign_intake_rows
        (
          campaign_id, import_id, row_number,
          provider_name, normalized_name, provider_type,
          address, city, state_region, postal_code, country,
          website, phone, email, contact_name, contact_title,
          source_system, source_record_id, source_url,
          priority, psa_needed, pricing_requested, notes, services,
          gate_decision, gate_confidence, gate_reasons,
          matched_facility_id, campaign_target_id,
          disposition, error_message, raw_payload
        )
      values
        (
          $1,$2,$3,
          $4,$5,$6,
          $7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,
          $17,$18,$19,
          $20,$21,$22,$23,$24::jsonb,
          $25,$26,$27::jsonb,
          $28,$29,
          $30,$31,$32::jsonb
        )
    `,
    [
      campaignId,
      importId,
      rowNumber,
      provider.name,
      normalizeProviderName(provider.name),
      provider.providerType || null,
      provider.address || null,
      provider.city || null,
      provider.stateRegion || null,
      provider.postalCode || null,
      provider.country,
      provider.website || null,
      provider.phone || null,
      provider.email || null,
      provider.contactName || null,
      provider.contactTitle || null,
      provider.sourceSystem || null,
      provider.sourceRecordId || null,
      provider.sourceUrl || null,
      normalizePriority(provider.priority),
      provider.psaNeeded !== false,
      provider.pricingRequested === true,
      provider.notes || null,
      JSON.stringify(provider.services || []),
      gate.decision || null,
      gate.confidence ?? null,
      JSON.stringify(gate.reasons || []),
      gate.matchedFacilityId || null,
      targetId,
      disposition,
      errorMessage,
      JSON.stringify(provider)
    ]
  );
}

async function createFacility(provider: IntakeProvider): Promise<string> {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const domain = extractDomain(provider.website || provider.email);
  const phone = normalizePhone(provider.phone);

  const result = await operationalDb.query(
    `
      insert into facilities
        (
          name, normalized_name, provider_type,
          address, city, state_region, postal_code, country,
          phone, phone_normalized, website, website_domain, general_email,
          outreach_status, current_status, last_verified_at
        )
      values
        (
          $1,$2,$3,
          $4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,
          'NOT_STARTED','CURRENT',now()
        )
      returning id::text
    `,
    [
      provider.name,
      normalizeProviderName(provider.name),
      provider.providerType || null,
      provider.address || null,
      provider.city || null,
      provider.stateRegion || null,
      provider.postalCode || null,
      provider.country,
      provider.phone || null,
      phone || null,
      provider.website || null,
      domain || null,
      provider.email || null
    ]
  );

  const facilityId = result.rows[0].id as string;

  if (provider.email || provider.contactName) {
    await operationalDb.query(
      `
        insert into contacts
          (
            facility_id, full_name, title, email, email_domain,
            phone, contact_type, is_primary, source_url, last_verified_at
          )
        values
          ($1,$2,$3,$4,$5,$6,'OUTREACH',true,$7,now())
      `,
      [
        facilityId,
        provider.contactName || null,
        provider.contactTitle || null,
        provider.email || null,
        provider.email ? extractDomain(provider.email) : null,
        provider.phone || null,
        provider.sourceUrl || null
      ]
    );
  }

  for (const service of provider.services || []) {
    await operationalDb.query(
      `
        insert into facility_services
          (facility_id, service_name, availability_status, source_url, last_verified_at)
        values
          ($1,$2,'IMPORTED',$3,now())
        on conflict (facility_id, service_name) do nothing
      `,
      [facilityId, service, provider.sourceUrl || null]
    );
  }

  return facilityId;
}

async function enrichFacilityFromIntake(facilityId: string, provider: IntakeProvider) {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  await operationalDb.query(
    `
      update facilities
      set
        provider_type = coalesce(provider_type, $2),
        address = coalesce(address, $3),
        city = coalesce(city, $4),
        state_region = coalesce(state_region, $5),
        postal_code = coalesce(postal_code, $6),
        phone = coalesce(phone, $7),
        phone_normalized = coalesce(phone_normalized, $8),
        website = coalesce(website, $9),
        website_domain = coalesce(website_domain, $10),
        general_email = coalesce(general_email, $11),
        updated_at = now()
      where id = $1
    `,
    [
      facilityId,
      provider.providerType || null,
      provider.address || null,
      provider.city || null,
      provider.stateRegion || null,
      provider.postalCode || null,
      provider.phone || null,
      normalizePhone(provider.phone) || null,
      provider.website || null,
      extractDomain(provider.website || provider.email) || null,
      provider.email || null
    ]
  );

  if (provider.email || provider.contactName) {
    const existing = await operationalDb.query(
      `
        select id
        from contacts
        where facility_id = $1
          and (
            ($2 <> '' and lower(coalesce(email,'')) = lower($2))
            or (
              $3 <> ''
              and lower(coalesce(full_name,'')) = lower($3)
            )
          )
        limit 1
      `,
      [facilityId, provider.email || '', provider.contactName || '']
    );

    if (!existing.rows[0]) {
      await operationalDb.query(
        `
          insert into contacts
            (
              facility_id, full_name, title, email, email_domain,
              phone, contact_type, is_primary, source_url, last_verified_at
            )
          values
            ($1,$2,$3,$4,$5,$6,'OUTREACH',false,$7,now())
        `,
        [
          facilityId,
          provider.contactName || null,
          provider.contactTitle || null,
          provider.email || null,
          provider.email ? extractDomain(provider.email) : null,
          provider.phone || null,
          provider.sourceUrl || null
        ]
      );
    }
  }
}

function targetStatus(decision: GateDecision): string {
  if (decision === 'FOLLOW_UP_DUE') return 'NEED_FOLLOW_UP';
  if (decision === 'PREVIOUSLY_CONTACTED') return 'ON_HOLD';
  return 'NOT_STARTED';
}

async function ensureCampaignTarget(
  campaignId: string,
  facilityId: string,
  provider: IntakeProvider,
  gate: {
    decision: GateDecision;
    confidence: number;
    reasons: string[];
  }
): Promise<string> {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const result = await operationalDb.query(
    `
      insert into campaign_targets
        (
          campaign_id, facility_id, status,
          gate_decision, gate_confidence, gate_reasons,
          priority, owner, pricing_requested, psa_needed, notes
        )
      select
        $1,$2,$3,
        $4,$5,$6::jsonb,
        $7,c.owner,$8,$9,$10
      from campaigns c
      where c.id = $1
      on conflict (campaign_id, facility_id) do update set
        gate_decision = excluded.gate_decision,
        gate_confidence = excluded.gate_confidence,
        gate_reasons = excluded.gate_reasons,
        priority = excluded.priority,
        pricing_requested = campaign_targets.pricing_requested or excluded.pricing_requested,
        psa_needed = campaign_targets.psa_needed or excluded.psa_needed,
        notes = coalesce(campaign_targets.notes, excluded.notes),
        updated_at = now()
      returning id::text
    `,
    [
      campaignId,
      facilityId,
      targetStatus(gate.decision),
      gate.decision,
      gate.confidence,
      JSON.stringify(gate.reasons),
      normalizePriority(provider.priority),
      provider.pricingRequested === true,
      provider.psaNeeded !== false,
      provider.notes || null
    ]
  );

  return result.rows[0].id as string;
}

async function processProvider(
  campaignId: string,
  importId: string,
  rowNumber: number,
  provider: IntakeProvider
): Promise<'accepted' | 'excluded' | 'review' | 'error'> {
  try {
    const gate = await evaluateProvider(provider);

    if (EXCLUDED_DECISIONS.has(gate.decision)) {
      await recordIntakeRow(
        campaignId,
        importId,
        rowNumber,
        provider,
        gate,
        'EXCLUDED',
        null
      );
      return 'excluded';
    }

    if (REVIEW_DECISIONS.has(gate.decision)) {
      await recordIntakeRow(
        campaignId,
        importId,
        rowNumber,
        provider,
        gate,
        'REVIEW',
        null
      );
      return 'review';
    }

    let facilityId = gate.matchedFacilityId || null;
    if (!facilityId) {
      facilityId = await createFacility(provider);
    } else {
      await enrichFacilityFromIntake(facilityId, provider);
    }

    const targetId = await ensureCampaignTarget(
      campaignId,
      facilityId,
      provider,
      gate
    );

    await recordIntakeRow(
      campaignId,
      importId,
      rowNumber,
      provider,
      gate,
      gate.matchedFacilityId ? 'REUSED' : 'ACCEPTED',
      targetId
    );

    return 'accepted';
  } catch (error) {
    await recordIntakeRow(
      campaignId,
      importId,
      rowNumber,
      provider,
      {},
      'ERROR',
      null,
      error instanceof Error ? error.message : 'Provider intake failed.'
    );
    return 'error';
  }
}

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index], index);
      }
    }
  );

  await Promise.all(runners);
}

export async function ingestProviders(
  campaignId: string,
  providers: IntakeProvider[],
  options: {
    sourceType?: string;
    fileName?: string | null;
    createdBy?: string;
  } = {}
): Promise<IntakeSummary> {
  if (!operationalDb) throw new Error('Operational database is not configured.');
  if (providers.length === 0) throw new Error('No providers were supplied.');
  if (providers.length > 5000) throw new Error('A single intake batch may contain at most 5,000 providers.');

  const campaign = await campaignDefaults(campaignId);
  const prepared = providers.map((provider) => ({
    ...provider,
    providerType: normalizeProviderType(provider.providerType || campaign.provider_type),
    country: clean(provider.country || campaign.country || ''),
    city: provider.city || campaign.city || null,
    priority: normalizePriority(provider.priority),
    sourceSystem: provider.sourceSystem || options.sourceType || 'MANUAL'
  }));

  for (const [index, provider] of prepared.entries()) {
    if (!clean(provider.name)) {
      throw new Error(`Provider row ${index + 1} is missing a name.`);
    }
    if (!clean(provider.country)) {
      throw new Error(`Provider row ${index + 1} is missing a country.`);
    }
  }

  const importId = await createImport(
    campaignId,
    options.sourceType || 'MANUAL',
    options.fileName || null,
    options.createdBy || campaign.owner || 'Alex'
  );

  const unique = new Map<string, { provider: IntakeProvider; rowNumber: number }>();
  const duplicateRows: Array<{ provider: IntakeProvider; rowNumber: number }> = [];

  prepared.forEach((provider, index) => {
    const key = batchIdentity(provider);
    if (unique.has(key)) {
      duplicateRows.push({ provider, rowNumber: index + 1 });
    } else {
      unique.set(key, { provider, rowNumber: index + 1 });
    }
  });

  for (const duplicate of duplicateRows) {
    await recordIntakeRow(
      campaignId,
      importId,
      duplicate.rowNumber,
      duplicate.provider,
      {
        decision: 'DUPLICATE',
        confidence: 1,
        reasons: ['Duplicate provider row within this intake batch.']
      },
      'DUPLICATE_INPUT',
      null
    );
  }

  const stats = {
    accepted: 0,
    excluded: duplicateRows.length,
    review: 0,
    errors: 0
  };

  const uniqueRows = [...unique.values()];
  await withConcurrency(uniqueRows, 8, async ({ provider, rowNumber }) => {
    const result = await processProvider(campaignId, importId, rowNumber, provider);
    if (result === 'accepted') stats.accepted += 1;
    if (result === 'excluded') stats.excluded += 1;
    if (result === 'review') stats.review += 1;
    if (result === 'error') stats.errors += 1;
  });

  await operationalDb.query(
    `
      update campaign_imports
      set
        total_rows = $2,
        accepted_rows = $3,
        excluded_rows = $4,
        review_rows = $5,
        error_rows = $6
      where id = $1
    `,
    [
      importId,
      prepared.length,
      stats.accepted,
      stats.excluded,
      stats.review,
      stats.errors
    ]
  );

  return {
    importId,
    campaignId,
    total: prepared.length,
    accepted: stats.accepted,
    excluded: stats.excluded,
    review: stats.review,
    errors: stats.errors,
    duplicateInput: duplicateRows.length
  };
}

export async function campaignIntake(campaignId: string) {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const result = await operationalDb.query(
    `
      select
        cir.id,
        cir.provider_name,
        cir.provider_type,
        cir.city,
        cir.country,
        cir.email,
        cir.contact_name,
        cir.priority,
        cir.psa_needed,
        cir.pricing_requested,
        cir.gate_decision,
        cir.gate_confidence,
        cir.gate_reasons,
        cir.disposition,
        cir.error_message,
        cir.campaign_target_id,
        cir.created_at
      from campaign_intake_rows cir
      where cir.campaign_id = $1
      order by cir.created_at desc, cir.row_number
      limit 5000
    `,
    [campaignId]
  );

  return result.rows;
}
