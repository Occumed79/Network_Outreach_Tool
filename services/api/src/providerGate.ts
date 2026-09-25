import {
  extractDomain,
  normalizePhone,
  normalizeProviderName,
  type GateResult,
  type ProviderCandidate
} from '@network-outreach/core';
import { operationalDb } from './db.js';
import { checkInternationalSearch, checkNetworkMap } from './adapters.js';

interface LocalMatch {
  facility_id: string;
  facility_name: string;
  outreach_status: string | null;
  do_not_contact: boolean;
  active_provider: boolean;
  website_domain: string | null;
  phone_normalized: string | null;
  email_normalized: string | null;
}

async function findLocalMatch(candidate: ProviderCandidate): Promise<LocalMatch | null> {
  if (!operationalDb) return null;

  const normalizedName = normalizeProviderName(candidate.name);
  const domain = extractDomain(candidate.website || candidate.email);
  const phone = normalizePhone(candidate.phone);
  const email = candidate.email?.trim().toLowerCase() || '';

  const result = await operationalDb.query<LocalMatch>(
    `
      select
        f.id::text as facility_id,
        f.name as facility_name,
        f.outreach_status,
        f.do_not_contact,
        f.active_provider,
        f.website_domain,
        f.phone_normalized,
        lower(coalesce(c.email, '')) as email_normalized
      from facilities f
      left join contacts c on c.facility_id = f.id and c.is_primary = true
      where
        ($1 <> '' and f.website_domain = $1)
        or ($2 <> '' and f.phone_normalized = $2)
        or ($3 <> '' and lower(coalesce(c.email, '')) = $3)
        or (
          f.normalized_name = $4
          and lower(coalesce(f.country, '')) = lower($5)
          and (
            $6 = ''
            or lower(coalesce(f.city, '')) = lower($6)
          )
        )
      order by
        case
          when $1 <> '' and f.website_domain = $1 then 0
          when $3 <> '' and lower(coalesce(c.email, '')) = $3 then 1
          when $2 <> '' and f.phone_normalized = $2 then 2
          else 3
        end
      limit 1
    `,
    [domain, phone, email, normalizedName, candidate.country, candidate.city || '']
  );

  return result.rows[0] || null;
}

export async function evaluateProvider(candidate: ProviderCandidate): Promise<GateResult> {
  const reasons: string[] = [];

  const local = await findLocalMatch(candidate);
  if (local) {
    if (local.do_not_contact) {
      return {
        decision: 'DO_NOT_CONTACT',
        confidence: 1,
        reasons: ['Matched an operational provider record marked do not contact.'],
        matchedFacilityId: local.facility_id,
        matchedExternalSource: 'outreach'
      };
    }
    if (local.active_provider) {
      return {
        decision: 'ACTIVE_PROVIDER',
        confidence: 1,
        reasons: ['Matched an existing active provider in the outreach database.'],
        matchedFacilityId: local.facility_id,
        matchedExternalSource: 'outreach'
      };
    }
    if (local.outreach_status === 'DECLINED') {
      return {
        decision: 'DECLINED',
        confidence: 1,
        reasons: ['Matched a provider that previously declined.'],
        matchedFacilityId: local.facility_id,
        matchedExternalSource: 'outreach'
      };
    }
    if (['CONTACTED', 'WAITING_ON_PRICING', 'WAITING_ON_PSA', 'NEED_FOLLOW_UP'].includes(local.outreach_status || '')) {
      return {
        decision: local.outreach_status === 'NEED_FOLLOW_UP' ? 'FOLLOW_UP_DUE' : 'PREVIOUSLY_CONTACTED',
        confidence: 0.98,
        reasons: ['Matched prior outreach history.'],
        matchedFacilityId: local.facility_id,
        matchedExternalSource: 'outreach'
      };
    }

    reasons.push('Matched an existing local provider/facility record.');
  }

  const [networkMap, internationalSearch] = await Promise.all([
    checkNetworkMap(candidate),
    checkInternationalSearch(candidate)
  ]);

  if (networkMap.found) {
    return {
      decision: 'EXISTING_NETWORK',
      confidence: networkMap.confidence ?? 0.95,
      reasons: [
        'Network Map reports a matching provider already known to Occu-Med.',
        ...(networkMap.label ? [`Match: ${networkMap.label}`] : [])
      ],
      matchedExternalSource: 'network-map'
    };
  }

  if (internationalSearch.found) {
    return {
      decision: 'SEEN_BEFORE',
      confidence: internationalSearch.confidence ?? 0.9,
      reasons: [
        'International Search reports this provider was previously discovered or investigated.',
        ...(internationalSearch.label ? [`Match: ${internationalSearch.label}`] : [])
      ],
      matchedExternalSource: 'international-search'
    };
  }

  if (local) {
    return {
      decision: 'DUPLICATE',
      confidence: 0.9,
      reasons
    };
  }

  return {
    decision: 'NEW',
    confidence: 0.9,
    reasons: ['No existing provider, prior outreach, or configured external-system match was found.']
  };
}
