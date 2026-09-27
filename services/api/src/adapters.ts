import {
  normalizePhone,
  normalizeProviderName,
  type ProviderCandidate
} from '@network-outreach/core';
import { config } from './config.js';

export interface ExternalMatch {
  found: boolean;
  available: boolean;
  configured: boolean;
  source: 'international-search';
  recordId?: string;
  label?: string;
  confidence?: number;
  details?: Record<string, unknown>;
}

export interface ExistingNetworkProvider {
  id?: string;
  externalId?: number | null;
  providerName?: string | null;
  organizationName?: string | null;
  siteName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  networkStatus?: string | null;
}

function normalizedText(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameVariants(provider: ExistingNetworkProvider): string[] {
  return [
    provider.providerName,
    provider.organizationName,
    provider.siteName
  ]
    .map((value) => normalizeProviderName(value || ''))
    .filter(Boolean);
}

export function scoreExistingNetworkMatch(
  candidate: ProviderCandidate,
  provider: ExistingNetworkProvider
): number {
  const candidateName = normalizeProviderName(candidate.name);
  const providerNames = nameVariants(provider);
  const nameExact = Boolean(
    candidateName && providerNames.some((name) => name === candidateName)
  );
  const nameClose = Boolean(
    candidateName && providerNames.some((name) => {
      const shorter = candidateName.length <= name.length ? candidateName : name;
      const longer = candidateName.length > name.length ? candidateName : name;
      return shorter.length >= 8 && longer.includes(shorter);
    })
  );

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
  const cityExact = Boolean(
    candidate.city
      && provider.city
      && normalizedText(candidate.city) === normalizedText(provider.city)
  );
  const countryExact = Boolean(
    candidate.country
      && provider.country
      && normalizedText(candidate.country) === normalizedText(provider.country)
  );

  if (nameExact && addressExact) return 1;
  if (nameExact && phoneExact) return 0.99;
  if (nameExact && cityExact && countryExact) return 0.97;
  if (nameClose && addressExact) return 0.96;
  if (nameClose && phoneExact && countryExact) return 0.95;

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

export async function checkInternationalSearch(
  candidate: ProviderCandidate
): Promise<ExternalMatch> {
  if (!config.internationalSearchApiUrl) {
    return {
      found: false,
      available: false,
      configured: false,
      source: 'international-search'
    };
  }

  const base = config.internationalSearchApiUrl.replace(/\/$/, '');
  const params = new URLSearchParams({
    q: candidate.name,
    country: candidate.country,
    limit: '200'
  });
  if (candidate.city) params.set('city', candidate.city);

  const result = await getJson<{
    results?: ExistingNetworkProvider[];
    total?: number;
  }>(`${base}/api/network/search?${params.toString()}`);

  if (!result) {
    return {
      found: false,
      available: false,
      configured: true,
      source: 'international-search'
    };
  }

  const providers = result.results || [];
  const ranked = providers
    .map((provider) => ({
      provider,
      score: scoreExistingNetworkMatch(candidate, provider)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.95) {
    return {
      found: false,
      available: true,
      configured: true,
      source: 'international-search',
      details: {
        checked: providers.length,
        total: result.total ?? providers.length
      }
    };
  }

  return {
    found: true,
    available: true,
    configured: true,
    source: 'international-search',
    recordId: best.provider.id,
    label: best.provider.providerName || best.provider.organizationName || undefined,
    confidence: best.score,
    details: {
      provider: best.provider,
      total: result.total ?? providers.length
    }
  };
}
