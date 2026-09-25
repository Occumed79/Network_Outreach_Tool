import { extractDomain, normalizePhone, normalizeProviderName, type ProviderCandidate } from '@network-outreach/core';
import { operationalDb, researchDb } from './db.js';
import { evaluateProvider } from './providerGate.js';

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

  const gate = await evaluateProvider(candidate);
  const updated = await researchDb.query(
    `
      update research_candidates
      set gate_decision = $2,
          gate_confidence = $3,
          gate_reasons = $4::jsonb,
          lifecycle_status = case when $2 = 'NEW' then 'QUALIFIED_FOR_REVIEW' else 'GATED' end,
          updated_at = now()
      where id = $1
      returning *
    `,
    [inserted.rows[0].id, gate.decision, gate.confidence, JSON.stringify(gate.reasons)]
  );

  await researchDb.query(
    `
      insert into research_events (research_run_id, candidate_id, event_type, message, metadata)
      values ($1, $2, 'PROVIDER_GATE', $3, $4::jsonb)
    `,
    [
      runId,
      inserted.rows[0].id,
      `Provider Gate decision: ${gate.decision}`,
      JSON.stringify(gate)
    ]
  );

  return { candidate: updated.rows[0], gate };
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

  const allowed = ['NEW', 'NEEDS_REVIEW', 'SEEN_BEFORE'];
  if (!override && !allowed.includes(candidate.gate_decision)) {
    throw new Error(`Candidate is gated as ${candidate.gate_decision}; explicit override is required to promote it.`);
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

  let target = null;
  if (campaignId) {
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
        facility.id,
        candidate.gate_decision,
        candidate.gate_confidence,
        JSON.stringify(candidate.gate_reasons || [])
      ]
    );
    target = targetResult.rows[0];
  }

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

  return { facility, target };
}
