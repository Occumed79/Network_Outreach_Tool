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
    requested: config.researchSearchProviders
  };
}
