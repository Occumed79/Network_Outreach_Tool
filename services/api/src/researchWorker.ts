import {
  PROVIDER_TYPE_PROFILES,
  extractDomain,
  normalizeProviderName,
  type ProviderCandidate,
  type ProviderTypeProfile
} from '@network-outreach/core';
import { researchDb } from './db.js';
import { addResearchCandidate } from './research.js';
import {
  configuredSearchSources,
  researchSearchStatus,
  type WebSearchResult
} from './researchSources.js';
import {
  extractProvidersFromSearch,
  researchAiStatus
} from './aiRouter.js';

interface ResearchRunInput {
  prompt: string;
  providerType?: string | null;
  country?: string | null;
  city?: string | null;
}

interface ExecuteOptions {
  maxQueries?: number;
  maxResultsPerQuery?: number;
}

export function buildSearchQueries(
  run: ResearchRunInput,
  profile: ProviderTypeProfile
): string[] {
  const country = run.country || '';
  const city = run.city || '';
  const geography = [city, country].filter(Boolean).join(', ');
  const capabilities = profile.requiredCapabilities;

  const base = [
    `${profile.label} provider ${geography} ${capabilities.join(' ')}`,
    `direct ${profile.label} clinic practice ${country} ${capabilities.slice(0, 2).join(' ')}`,
    `${profile.label} ${geography} pricing services email contact ${capabilities.at(-1) || ''}`,
    `${profile.label} ${country} corporate account practice manager ${capabilities.join(' ')}`
  ];

  if (run.prompt.trim()) base.unshift(run.prompt.trim());

  return [...new Set(
    base
      .map((query) => query.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  )];
}

function normalizeLocation(value?: string | null): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function candidateIdentity(candidate: ProviderCandidate): string {
  const domain = extractDomain(candidate.website || candidate.email);
  const name = normalizeProviderName(candidate.name);
  const country = normalizeLocation(candidate.country);
  const city = normalizeLocation(candidate.city);
  const address = normalizeLocation(candidate.address);

  if (domain && address) {
    return ['domain-address', domain, address, country].join(':');
  }

  if (domain) {
    return ['domain-facility', domain, name, city, country].join(':');
  }

  if (address) {
    return ['name-address', name, address, country].join(':');
  }

  return ['name-location', name, city, country].join(':');
}

function firstValue<T>(a: T | null | undefined, b: T | null | undefined): T | null | undefined {
  return a ?? b;
}

export function dedupeProviderCandidates(
  candidates: ProviderCandidate[]
): ProviderCandidate[] {
  const merged = new Map<string, ProviderCandidate>();

  for (const candidate of candidates) {
    const key = candidateIdentity(candidate);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...candidate,
        services: [...new Set(candidate.services || [])]
      });
      continue;
    }

    merged.set(key, {
      ...existing,
      name: existing.name.length >= candidate.name.length ? existing.name : candidate.name,
      city: firstValue(existing.city, candidate.city),
      address: firstValue(existing.address, candidate.address),
      website: firstValue(existing.website, candidate.website),
      phone: firstValue(existing.phone, candidate.phone),
      email: firstValue(existing.email, candidate.email),
      sourceUrl: firstValue(existing.sourceUrl, candidate.sourceUrl),
      providerType: firstValue(existing.providerType, candidate.providerType),
      services: [...new Set([...(existing.services || []), ...(candidate.services || [])])]
    });
  }

  return [...merged.values()];
}

export function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const json = firstBrace >= 0 && lastBrace > firstBrace
    ? candidate.slice(firstBrace, lastBrace + 1)
    : candidate;
  return JSON.parse(json);
}

async function storeSearchEvidence(runId: string, results: WebSearchResult[]) {
  if (!researchDb) throw new Error('Research database is not configured.');

  for (const result of results) {
    await researchDb.query(
      `
        insert into evidence_sources
          (research_run_id, candidate_id, evidence_type, source_url, source_title, source_domain, excerpt, structured_data, confidence)
        values
          ($1, null, 'SEARCH_RESULT', $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        runId,
        result.url,
        result.title || null,
        extractDomain(result.url),
        result.content.slice(0, 5000) || null,
        JSON.stringify({
          searchSource: result.source,
          query: result.query,
          score: result.score ?? null
        }),
        typeof result.score === 'number' ? Math.max(0, Math.min(1, result.score)) : 0.65
      ]
    );
  }
}

async function findExistingCandidateId(runId: string, candidate: ProviderCandidate): Promise<string | null> {
  if (!researchDb) throw new Error('Research database is not configured.');

  const domain = extractDomain(candidate.website || candidate.email);
  const normalizedName = normalizeProviderName(candidate.name);
  const city = candidate.city || '';
  const address = candidate.address || '';

  const result = await researchDb.query(
    `
      select id
      from research_candidates
      where research_run_id = $1
        and lower(coalesce(country, '')) = lower($4)
        and (
          (
            $2 <> ''
            and website_domain = $2
            and (
              ($6 <> '' and lower(coalesce(address, '')) = lower($6))
              or (
                normalized_name = $3
                and ($5 = '' or lower(coalesce(city, '')) = lower($5))
              )
            )
          )
          or (
            normalized_name = $3
            and ($5 = '' or lower(coalesce(city, '')) = lower($5))
            and ($6 = '' or lower(coalesce(address, '')) = lower($6))
          )
        )
      limit 1
    `,
    [runId, domain, normalizedName, candidate.country, city, address]
  );

  return result.rows[0]?.id || null;
}

async function enrichExistingCandidate(
  runId: string,
  candidateId: string,
  candidate: ProviderCandidate
) {
  if (!researchDb) throw new Error('Research database is not configured.');

  await researchDb.query(
    `
      update research_candidates
      set
        address = coalesce(nullif($2, ''), address),
        city = coalesce(nullif($3, ''), city),
        phone = coalesce(nullif($4, ''), phone),
        email = coalesce(nullif($5, ''), email),
        website = coalesce(nullif($6, ''), website),
        website_domain = coalesce(nullif($7, ''), website_domain),
        raw_payload = raw_payload || $8::jsonb,
        updated_at = now()
      where id = $1
    `,
    [
      candidateId,
      candidate.address || '',
      candidate.city || '',
      candidate.phone || '',
      candidate.email || '',
      candidate.website || '',
      extractDomain(candidate.website || candidate.email),
      JSON.stringify(candidate)
    ]
  );

  if (candidate.sourceUrl) {
    await researchDb.query(
      `
        insert into evidence_sources
          (research_run_id, candidate_id, evidence_type, source_url, source_domain, structured_data, confidence)
        select
          $1, $2, 'DISCOVERY_SOURCE', $3, $4, $5::jsonb, 0.8
        where not exists (
          select 1
          from evidence_sources
          where candidate_id = $2
            and source_url = $3
            and evidence_type = 'DISCOVERY_SOURCE'
        )
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
        select
          $1, $2, false, $3, 0.6, 'PENDING'
        where not exists (
          select 1
          from contact_candidates
          where candidate_id = $1
            and lower(coalesce(email, '')) = lower($2)
        )
      `,
      [candidateId, candidate.email, candidate.sourceUrl || null]
    );
  }

  for (const service of [...new Set(candidate.services || [])]) {
    await researchDb.query(
      `
        insert into service_findings
          (candidate_id, service_name, availability_status, source_url, confidence)
        select
          $1, $2, 'DOCUMENTED', $3, 0.8
        where not exists (
          select 1
          from service_findings
          where candidate_id = $1
            and lower(service_name) = lower($2)
        )
      `,
      [candidateId, service, candidate.sourceUrl || null]
    );
  }
}

async function recordRunEvent(
  runId: string,
  eventType: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  if (!researchDb) return;
  await researchDb.query(
    `
      insert into research_events
        (research_run_id, event_type, message, metadata)
      values
        ($1, $2, $3, $4::jsonb)
    `,
    [runId, eventType, message, JSON.stringify(metadata)]
  );
}

export function researchWorkerStatus() {
  return {
    search: researchSearchStatus(),
    ai: researchAiStatus()
  };
}

export async function executeResearchRun(
  runId: string,
  options: ExecuteOptions = {}
) {
  if (!researchDb) throw new Error('Research database is not configured.');

  const runResult = await researchDb.query(
    'select * from research_runs where id = $1',
    [runId]
  );
  const run = runResult.rows[0];
  if (!run) throw new Error('Research run was not found.');

  const profile = PROVIDER_TYPE_PROFILES.find((item) => item.id === run.provider_type);
  if (!profile) {
    throw new Error(`Provider type profile not found: ${run.provider_type || 'missing'}`);
  }

  const sources = configuredSearchSources();
  const ai = researchAiStatus();

  if (sources.length === 0) {
    await researchDb.query(
      `
        update research_runs
        set status = 'WAITING_FOR_SEARCH',
            error_message = 'No web search provider is configured.'
        where id = $1
      `,
      [runId]
    );
    return {
      status: 'WAITING_FOR_SEARCH',
      searchResults: 0,
      extractedCandidates: 0,
      newCandidates: 0
    };
  }

  await researchDb.query(
    `
      update research_runs
      set status = 'RUNNING',
          started_at = coalesce(started_at, now()),
          error_message = null
      where id = $1
    `,
    [runId]
  );

  const maxQueries = Math.min(Math.max(options.maxQueries || 4, 1), 8);
  const maxResults = Math.min(Math.max(options.maxResultsPerQuery || 8, 1), 20);
  const queries = buildSearchQueries({
    prompt: run.prompt,
    providerType: run.provider_type,
    country: run.country,
    city: run.city
  }, profile).slice(0, maxQueries);

  const allResults: WebSearchResult[] = [];
  const sourceErrors: Array<{ source: string; query: string; error: string }> = [];
  const totalSearchRequests = queries.length * sources.length;
  let successfulSearchRequests = 0;

  for (const query of queries) {
    for (const source of sources) {
      try {
        const results = await source.search(query, maxResults);
        successfulSearchRequests += 1;
        allResults.push(...results);
        await recordRunEvent(
          runId,
          'SEARCH_COMPLETE',
          `${source.id} returned ${results.length} results.`,
          { source: source.id, query, resultCount: results.length }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown search error';
        sourceErrors.push({ source: source.id, query, error: message });
        await recordRunEvent(
          runId,
          'SEARCH_ERROR',
          message,
          { source: source.id, query }
        );
      }
    }
  }

  if (totalSearchRequests > 0 && successfulSearchRequests === 0) {
    const message = `All ${totalSearchRequests} configured search requests failed.`;
    await researchDb.query(
      `
        update research_runs
        set status = 'ERROR',
            error_message = $2,
            summary = $3::jsonb,
            completed_at = now()
        where id = $1
      `,
      [
        runId,
        message,
        JSON.stringify({
          queryCount: queries.length,
          searchSources: sources.map((source) => source.id),
          sourceErrors
        })
      ]
    );
    await recordRunEvent(runId, 'RESEARCH_ERROR', message, { sourceErrors });
    throw new Error(message);
  }

  const uniqueSearchResults = [...new Map(
    allResults
      .filter((result) => result.url)
      .map((result) => [result.url, result])
  ).values()];

  await storeSearchEvidence(runId, uniqueSearchResults);

  if (!ai.configured) {
    const summary = {
      searchResults: uniqueSearchResults.length,
      searchSources: sources.map((source) => source.id),
      sourceErrors
    };
    await researchDb.query(
      `
        update research_runs
        set status = 'WAITING_FOR_AI',
            summary = $2::jsonb,
            error_message = 'Search evidence collected, but no research AI endpoint is configured.'
        where id = $1
      `,
      [runId, JSON.stringify(summary)]
    );
    return {
      status: 'WAITING_FOR_AI',
      searchResults: uniqueSearchResults.length,
      extractedCandidates: 0,
      newCandidates: 0,
      sourceErrors
    };
  }

  try {
    const extracted = await extractProvidersFromSearch({
      prompt: run.prompt,
      providerType: run.provider_type,
      country: run.country,
      city: run.city
    }, profile, uniqueSearchResults);

    const candidates = dedupeProviderCandidates(
      extracted.map((candidate) => ({
        ...candidate,
        providerType: run.provider_type
      }))
    );

    let added = 0;
    let enriched = 0;
    for (const candidate of candidates) {
      const existingCandidateId = await findExistingCandidateId(runId, candidate);
      if (existingCandidateId) {
        await enrichExistingCandidate(runId, existingCandidateId, candidate);
        enriched += 1;
        continue;
      }

      await addResearchCandidate(runId, candidate);
      added += 1;
    }

    const summary = {
      queryCount: queries.length,
      searchResults: uniqueSearchResults.length,
      extractedCandidates: candidates.length,
      newCandidates: added,
      enrichedCandidates: enriched,
      searchSources: sources.map((source) => source.id),
      aiProvider: ai.provider,
      aiModel: ai.model,
      sourceErrors
    };

    await researchDb.query(
      `
        update research_runs
        set status = 'COMPLETE',
            summary = $2::jsonb,
            error_message = null,
            completed_at = now()
        where id = $1
      `,
      [runId, JSON.stringify(summary)]
    );

    await recordRunEvent(
      runId,
      'RESEARCH_COMPLETE',
      `Research completed with ${added} new and ${enriched} enriched provider candidates.`,
      summary
    );

    return { status: 'COMPLETE', ...summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research worker failed.';
    await researchDb.query(
      `
        update research_runs
        set status = 'ERROR',
            error_message = $2,
            completed_at = now()
        where id = $1
      `,
      [runId, message]
    );
    await recordRunEvent(runId, 'RESEARCH_ERROR', message);
    throw error;
  }
}
