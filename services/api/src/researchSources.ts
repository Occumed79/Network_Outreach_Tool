import type { ProviderCandidate, ProviderTypeProfile } from '@network-outreach/core';
import { config } from './config.js';

export interface WebSearchResult {
  source: string;
  query: string;
  title: string;
  url: string;
  content: string;
  score?: number | null;
}

interface SearchSource {
  id: string;
  search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timeout)
  };
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const tavily: SearchSource = {
  id: 'tavily',
  async search(query, maxResults) {
    if (!config.tavilyApiKey) return [];

    const request = timeoutSignal(20000);
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: config.tavilyApiKey,
          query,
          search_depth: 'advanced',
          max_results: Math.min(Math.max(maxResults, 1), 20),
          include_raw_content: false,
          include_images: false,
          topic: 'general'
        }),
        signal: request.signal
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with HTTP ${response.status}`);
      }

      const body = await response.json() as { results?: unknown[] };
      return (body.results || [])
        .map((item) => item as Record<string, unknown>)
        .filter((item) => asText(item.url))
        .map((item) => ({
          source: 'tavily',
          query,
          title: asText(item.title),
          url: asText(item.url),
          content: asText(item.content),
          score: asNumber(item.score)
        }));
    } finally {
      request.done();
    }
  }
};

const exa: SearchSource = {
  id: 'exa',
  async search(query, maxResults) {
    if (!config.exaApiKey) return [];

    const request = timeoutSignal(20000);
    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.exaApiKey}`
        },
        body: JSON.stringify({
          query,
          type: 'auto',
          numResults: Math.min(Math.max(maxResults, 1), 20),
          contents: {
            text: { maxCharacters: 2500 }
          }
        }),
        signal: request.signal
      });

      if (!response.ok) {
        throw new Error(`Exa search failed with HTTP ${response.status}`);
      }

      const body = await response.json() as { results?: unknown[] };
      return (body.results || [])
        .map((item) => item as Record<string, unknown>)
        .filter((item) => asText(item.url))
        .map((item) => ({
          source: 'exa',
          query,
          title: asText(item.title),
          url: asText(item.url),
          content: asText(item.text) || asText(item.highlight),
          score: asNumber(item.score)
        }));
    } finally {
      request.done();
    }
  }
};

export interface StructuredProviderResult {
  candidate: ProviderCandidate;
  evidenceText?: string | null;
  sourceType?: string | null;
  confidence?: number | null;
  raw: Record<string, unknown>;
}

interface StructuredDiscoveryContext {
  prompt: string;
  providerType?: string | null;
  country?: string | null;
  city?: string | null;
}

interface NetworkMapProvider {
  id?: string;
  name?: string;
  address?: string | null;
  city?: string | null;
  admin_area?: string | null;
  country?: string | null;
  phone?: string | null;
  website?: string | null;
  source_url?: string | null;
  source?: string | null;
  source_kind?: string | null;
  clinic_type?: string | null;
  services?: unknown;
  categories?: unknown;
  confidence_score?: number | null;
  status?: string | null;
}

function textArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asText(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[|,;]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export async function discoverViaNetworkMap(
  context: StructuredDiscoveryContext,
  profile: ProviderTypeProfile
): Promise<StructuredProviderResult[]> {
  if (!config.networkMapApiUrl) return [];

  const request = timeoutSignal(30000);
  try {
    const params = new URLSearchParams({
      q: profile.label,
      includeLive: 'false',
      includeStored: 'true',
      includeSaved: 'false',
      includeCandidates: 'true',
      mode: 'records',
      page: '1',
      limit: '500'
    });
    if (context.country) params.set('country', context.country);
    if (context.city) params.set('city', context.city);

    const response = await fetch(
      `${config.networkMapApiUrl.replace(/\/$/, '')}/api/provider-explorer?${params.toString()}`,
      { signal: request.signal }
    );

    if (!response.ok) {
      throw new Error(
        `Network Map discovery failed with HTTP ${response.status}`
      );
    }

    const body = await response.json() as {
      providers?: NetworkMapProvider[];
      records?: NetworkMapProvider[];
      partial?: boolean;
      warnings?: string[];
    };

    const providers = body.providers || body.records || [];
    return providers
      .filter((provider) => asText(provider.name))
      .map((provider) => {
        const services = [
          ...textArray(provider.services),
          ...textArray(provider.categories)
        ];
        const sourceUrl =
          asText(provider.source_url)
          || asText(provider.website)
          || null;
        const evidenceText = [
          provider.name,
          provider.address,
          provider.city,
          provider.admin_area,
          provider.country,
          provider.clinic_type,
          services.join(', '),
          provider.source,
          provider.source_kind,
          provider.status
        ].filter(Boolean).join(' | ');

        return {
          candidate: {
            name: asText(provider.name),
            country: asText(provider.country) || context.country || '',
            city: asText(provider.city) || null,
            address: asText(provider.address) || null,
            website: asText(provider.website) || null,
            phone: asText(provider.phone) || null,
            email: null,
            providerType: context.providerType || null,
            sourceUrl,
            services
          },
          evidenceText,
          sourceType: `network-map:${asText(provider.source_kind) || 'provider'}`,
          confidence: asNumber(provider.confidence_score) ?? 0.75,
          raw: {
            ...provider,
            networkMapPartial: Boolean(body.partial),
            networkMapWarnings: body.warnings || []
          }
        };
      });
  } finally {
    request.done();
  }
}

export function structuredResearchStatus() {
  return {
    networkMap: Boolean(config.networkMapApiUrl)
  };
}

export function configuredSearchSources(): SearchSource[] {
  const available = new Map<string, SearchSource>();
  if (config.tavilyApiKey) available.set(tavily.id, tavily);
  if (config.exaApiKey) available.set(exa.id, exa);

  const requested = config.researchSearchProviders.length > 0
    ? config.researchSearchProviders
    : ['tavily', 'exa'];

  return requested
    .map((id) => available.get(id))
    .filter((source): source is SearchSource => Boolean(source));
}

export function researchSearchStatus() {
  return {
    configured: configuredSearchSources().map((source) => source.id),
    requested: config.researchSearchProviders,
    structured: structuredResearchStatus()
  };
}
