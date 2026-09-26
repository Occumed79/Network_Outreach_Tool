import {
  PROVIDER_TYPE_PROFILES,
  extractDomain,
  normalizePhone,
  normalizeProviderName,
  type ProviderCandidate
} from '@network-outreach/core';
import { operationalDb, researchDb } from './db.js';
import { evaluateProvider } from './providerGate.js';

export async function listResearchCandidates(runId: string) {
  if (!researchDb) throw new Error('Research database is not configured.');

  const result = await researchDb.query(
    `
      select
        rc.*,
        (select count(*)::int from evidence_sources es where es.candidate_id = rc.id) as evidence_count,
        (select count(*)::int from contact_candidates cc where cc.candidate_id = rc.id) as contact_count,
        (select count(*)::int from service_findings sf where sf.candidate_id = rc.id) as service_count,
        (select count(*)::int from pricing_findings pf where pf.candidate_id = rc.id) as pricing_count
      from research_candidates rc
      where rc.research_run_id = $1
      order by
        case rc.gate_decision
          when 'NEW' then 0
          when 'NEEDS_REVIEW' then 1
          when 'SEEN_BEFORE' then 2
          else 3
        end,
        rc.created_at desc
    `,
    [runId]
  );

  return result.rows;
}

export async function addResearchCandidate(runId: string, candidate: ProviderCandidate) {
  if (!researchDb) throw new Error('Research database is not configured.');

  const inserted = await researchDb.query(
    `
      insert into research_candidates
        (research_run_id, provider_name, normalized_name, provider_type, address, city, country, phone, email, website, website_domain, raw_payload)
      values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      returning *
    `,
    [
      runId,
      candidate.name,
      normalizeProviderName(candidate.name),
      candidate.providerType || null,
      candidate.address || null,
      candidate.city || null,
      candidate.country,
      candidate.phone || null,
      candidate.email || null,
      candidate.website || null,
      extractDomain(candidate.website || candidate.email) || null,
      JSON.stringify(candidate)
    ]
  );

  const candidateId = inserted.rows[0].id;

  if (candidate.sourceUrl) {
    await researchDb.query(
      `
        insert into evidence_sources
          (research_run_id, candidate_id, evidence_type, source_url, source_domain, structured_data, confidence)
        values
          ($1, $2, 'DISCOVERY_SOURCE', $3, $4, $5::jsonb, 0.8)
      `,
      [
        runId,
        candidateId,
        candidate.sourceUrl,
        extractDomain(candidate.sourceUrl),
        JSON.stringify({ providerName: candidate.name })
      ]
    );
  }

  if (candidate.email) {
    await researchDb.query(
      `
        insert into contact_candidates
          (candidate_id, email, email_verified, source_url, confidence, disposition)
        values
          ($1, $2, false, $3, 0.6, 'PENDING')
      `,
      [candidateId, candidate.email, candidate.sourceUrl || null]
    );
  }

  const services = [...new Set((candidate.services || []).map((service) => service.trim()).filter(Boolean))];
  for (const service of services) {
    await researchDb.query(
      `
        insert into service_findings
          (candidate_id, service_name, availability_status, source_url, confidence)
        values
          ($1, $2, 'DOCUMENTED', $3, 0.8)
      `,
      [candidateId, service, candidate.sourceUrl || null]
    );
  }

  const gate = await evaluateProvider(candidate);
  const updated = await researchDb.query(
    `
      update research_candidates
      set gate_decision = $2,
          gate_confidence = $3,
          gate_reasons = $4::jsonb,
          lifecycle_status = case
            when $2 in ('NEW', 'NEEDS_REVIEW', 'SEEN_BEFORE') then 'QUALIFIED_FOR_REVIEW'
            else 'GATED'
          end,
          updated_at = now()
      where id = $1
      returning *
    `,
    [candidateId, gate.decision, gate.confidence, JSON.stringify(gate.reasons)]
  );

  await researchDb.query(
    `
      insert into research_events (research_run_id, candidate_id, event_type, message, metadata)
      values ($1, $2, 'PROVIDER_GATE', $3, $4::jsonb)
    `,
    [
      runId,
      candidateId,
      `Provider Gate decision: ${gate.decision}`,
      JSON.stringify(gate)
    ]
  );

  return { candidate: updated.rows[0], gate };
}

async function ensureCampaignTarget(campaignId: string, facilityId: string, candidate: Record<string, unknown>) {
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const targetResult = await operationalDb.query(
    `
      insert into campaign_targets
        (campaign_id, facility_id, status, gate_decision, gate_confidence, gate_reasons)
      values
        ($1,$2,'RESEARCHING',$3,$4,$5::jsonb)
      on conflict (campaign_id, facility_id) do update set
        gate_decision = excluded.gate_decision,
        gate_confidence = excluded.gate_confidence,
        gate_reasons = excluded.gate_reasons,
        updated_at = now()
      returning *
    `,
    [
      campaignId,
      facilityId,
      candidate.gate_decision,
      candidate.gate_confidence,
      JSON.stringify(candidate.gate_reasons || [])
    ]
  );

  return targetResult.rows[0];
}

export async function promoteResearchCandidate(candidateId: string, campaignId?: string, override = false) {
  if (!researchDb) throw new Error('Research database is not configured.');
  if (!operationalDb) throw new Error('Operational database is not configured.');

  const source = await researchDb.query(
    'select * from research_candidates where id = $1',
    [candidateId]
  );
  const candidate = source.rows[0];
  if (!candidate) throw new Error('Research candidate was not found.');

  const allowed = ['NEW', 'NEEDS_REVIEW'];
  if (!override && !allowed.includes(candidate.gate_decision)) {
    throw new Error(`Candidate is gated as ${candidate.gate_decision}; explicit override is required to promote it.`);
  }

  const profile = PROVIDER_TYPE_PROFILES.find((item) => item.id === candidate.provider_type);
  const requiredCapabilities = profile?.requiredCapabilities || [];
  if (!override && requiredCapabilities.length > 0) {
    const findings = await researchDb.query(
      'select service_name from service_findings where candidate_id = $1',
      [candidateId]
    );
    const documented = new Set(
      findings.rows.map((row) => String(row.service_name).trim().toLowerCase())
    );
    const missing = requiredCapabilities.filter(
      (capability) => !documented.has(capability.toLowerCase())
    );
    if (missing.length > 0) {
      throw new Error(`Required capabilities not yet documented: ${missing.join(', ')}`);
    }
  }

  if (candidate.operational_facility_id) {
    const existing = await operationalDb.query(
      'select * from facilities where id = $1',
      [candidate.operational_facility_id]
    );
    const facility = existing.rows[0];
    if (!facility) throw new Error('Candidate points to an operational facility that no longer exists.');

    const target = campaignId
      ? await ensureCampaignTarget(campaignId, facility.id, candidate)
      : null;

    return { facility, target, reused: true };
  }

  const facilityResult = await operationalDb.query(
    `
      insert into facilities
        (name, normalized_name, facility_type, provider_type, relationship_type, operator_name, contracting_entity_name,
         address, city, state_region, country, latitude, longitude, phone, phone_normalized, website, website_domain,
         general_email, outreach_status, confidence, last_verified_at)
      values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'RESEARCHING',$19,now())
      returning *
    `,
    [
      candidate.provider_name,
      candidate.normalized_name,
      null,
      candidate.provider_type,
      candidate.relationship_type,
      candidate.operator_name,
      candidate.contracting_entity_name,
      candidate.address,
      candidate.city,
      candidate.state_region,
      candidate.country,
      candidate.latitude,
      candidate.longitude,
      candidate.phone,
      normalizePhone(candidate.phone),
      candidate.website,
      candidate.website_domain,
      candidate.email,
      candidate.gate_confidence
    ]
  );

  const facility = facilityResult.rows[0];

  if (candidate.email) {
    await operationalDb.query(
      `
        insert into contacts
          (facility_id, full_name, email, email_domain, contact_type, is_primary, email_verified, confidence, last_verified_at)
        values
          ($1, null, $2, $3, 'GENERAL', true, false, $4, now())
      `,
      [
        facility.id,
        candidate.email,
        extractDomain(candidate.email),
        candidate.gate_confidence
      ]
    );
  }

  const target = campaignId
    ? await ensureCampaignTarget(campaignId, facility.id, candidate)
    : null;

  await researchDb.query(
    `
      update research_candidates
      set operational_facility_id = $2,
          lifecycle_status = 'PROMOTED',
          updated_at = now()
      where id = $1
    `,
    [candidateId, facility.id]
  );

  return { facility, target, reused: false };
}
