import {
  extractDomain,
  normalizePhone,
  normalizeProviderName,
  type ProviderCandidate
} from '@network-outreach/core';
import { config } from './config.js';

interface ExternalMatch {
  found: boolean;
  source: 'network-map' | 'international-search';
  recordId?: string;
  label?: string;
  confidence?: number;
  details?: Record<string, unknown>;
}

interface NetworkMapProvider {
  id?: string;
  name?: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  source?: string | null;
  source_kind?: string | null;
  status?: string | null;
}

function normalizedText(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameGeo(a?: string | null, b?: string | null): boolean {
  const left = normalizedText(a);
  const right = normalizedText(b);
  return Boolean(left && right && left === right);
}

export function scoreNetworkMapMatch(
  candidate: ProviderCandidate,
  provider: NetworkMapProvider
): number {
  const candidateName = normalizeProviderName(candidate.name);
  const providerName = normalizeProviderName(provider.name || '');
  const nameExact = Boolean(candidateName && providerName && candidateName === providerName);
  const nameClose = Boolean(
    candidateName
      && providerName
      && Math.min(candidateName.length, providerName.length) >= 8
      && (candidateName.includes(providerName) || providerName.includes(candidateName))
  );

  const candidateDomain = extractDomain(candidate.website || candidate.email);
  const providerDomain = extractDomain(provider.website);
  const domainExact = Boolean(candidateDomain && providerDomain && candidateDomain === providerDomain);

  const candidatePhone = normalizePhone(candidate.phone).replace(/\D/g, '');
  const providerPhone = normalizePhone(provider.phone).replace(/\D/g, '');
  const phoneExact = Boolean(
    candidatePhone.length >= 7
      && providerPhone.length >= 7
      && candidatePhone.slice(-10) === providerPhone.slice(-10)
  );

  const addressExact = Boolean(
    candidate.address
      && provider.address
      && normalizedText(candidate.address) === normalizedText(provider.address)
  );
  const cityExact = sameGeo(candidate.city, provider.city);
  const countryExact = sameGeo(candidate.country, provider.country);

  if (nameExact && addressExact) return 1;
  if (nameExact && phoneExact) return 0.99;
  if (domainExact && addressExact) return 0.99;
  if (domainExact && nameExact && cityExact) return 0.98;
  if (nameExact && cityExact && countryExact) return 0.96;
  if (phoneExact && cityExact && countryExact) return 0.95;
  if (domainExact && nameClose && cityExact && countryExact) return 0.94;
  if (nameClose && addressExact) return 0.94;

  return 0;
}

async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkNetworkMap(candidate: ProviderCandidate): Promise<ExternalMatch> {
  if (!config.networkMapApiUrl) return { found: false, source: 'network-map' };

  const base = config.networkMapApiUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    q: candidate.name,
    includeLive: 'false',
    includeStored: 'true',
    includeSaved: 'true',
    includeCandidates: 'true',
    mode: 'records',
    page: '1',
    limit: '100'
  });
  if (candidate.country) params.set('country', candidate.country);
  if (candidate.city) params.set('city', candidate.city);

  const result = await getJson<{
    providers?: NetworkMapProvider[];
    records?: NetworkMapProvider[];
    partial?: boolean;
    warnings?: string[];
    databaseProjects?: string[];
  }>(`${base}/api/provider-explorer?${params.toString()}`);

  if (!result) return { found: false, source: 'network-map' };

  const providers = result.providers || result.records || [];
  const ranked = providers
    .map((provider) => ({ provider, score: scoreNetworkMapMatch(candidate, provider) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.94) {
    return {
      found: false,
      source: 'network-map',
      details: {
        checked: providers.length,
        partial: Boolean(result.partial),
        warnings: result.warnings || []
      }
    };
  }

  return {
    found: true,
    source: 'network-map',
    recordId: best.provider.id,
    label: best.provider.name,
    confidence: best.score,
    details: {
      provider: best.provider,
      partial: Boolean(result.partial),
      warnings: result.warnings || [],
      databaseProjects: result.databaseProjects || []
    }
  };
}

export async function checkInternationalSearch(candidate: ProviderCandidate): Promise<ExternalMatch> {
  if (!config.internationalSearchApiUrl) return { found: false, source: 'international-search' };

  const result = await postJson<Record<string, unknown>>(
    `${config.internationalSearchApiUrl.replace(/\/$/, '')}/api/outreach-match`,
    candidate
  );

  if (!result) return { found: false, source: 'international-search' };

  return {
    found: Boolean(result.found),
    source: 'international-search',
    recordId: typeof result.recordId === 'string' ? result.recordId : undefined,
    label: typeof result.label === 'string' ? result.label : undefined,
    confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
    details: result
  };
}
