import { z } from 'zod';
import type { ProviderCandidate, ProviderTypeProfile } from '@network-outreach/core';
import { config } from './config.js';
import type { WebSearchResult } from './researchSources.js';

const extractedProviderSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  sourceUrl: z.string().url(),
  services: z.array(z.string()).default([])
});

const extractionSchema = z.object({
  providers: z.array(extractedProviderSchema).max(100)
});

interface ResearchContext {
  prompt: string;
  providerType?: string | null;
  country?: string | null;
  city?: string | null;
}

interface AiEndpoint {
  id: string;
  baseUrl: string;
  token: string;
  model: string;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl: string): string {
  const base = cleanBaseUrl(baseUrl);
  return base.endsWith('/v1')
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}

function configuredEndpoint(): AiEndpoint | null {
  if (
    config.neonAiGatewayBaseUrl
    && config.neonAiGatewayToken
    && config.aiResearchModel
  ) {
    return {
      id: 'neon-ai-gateway',
      baseUrl: config.neonAiGatewayBaseUrl,
      token: config.neonAiGatewayToken,
      model: config.aiResearchModel
    };
  }

  if (
    config.openAiCompatBaseUrl
    && config.openAiCompatApiKey
    && config.aiResearchModel
  ) {
    return {
      id: 'openai-compatible',
      baseUrl: config.openAiCompatBaseUrl,
      token: config.openAiCompatApiKey,
      model: config.aiResearchModel
    };
  }

  return null;
}

function stripFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function parseProviderExtraction(value: string): ProviderCandidate[] {
  const parsed = extractionSchema.parse(JSON.parse(stripFences(value)));
  return parsed.providers.map((provider) => ({
    ...provider,
    city: provider.city || null,
    address: provider.address || null,
    website: provider.website || null,
    phone: provider.phone || null,
    email: provider.email || null
  }));
}

export function researchAiStatus() {
  const endpoint = configuredEndpoint();
  return endpoint
    ? { configured: true, provider: endpoint.id, model: endpoint.model }
    : { configured: false, provider: null, model: config.aiResearchModel || null };
}

export async function extractProvidersFromSearch(
  context: ResearchContext,
  profile: ProviderTypeProfile,
  results: WebSearchResult[]
): Promise<ProviderCandidate[]> {
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    throw new Error('No research AI endpoint is configured.');
  }

  const allowedUrls = new Set(results.map((result) => result.url));
  const payload = results.slice(0, 35).map((result) => ({
    title: result.title,
    url: result.url,
    content: result.content.slice(0, 4500),
    searchSource: result.source,
    query: result.query
  }));

  const system = [
    'You extract direct healthcare-provider facilities from web search evidence.',
    'Return JSON only, with one top-level key named providers.',
    'Do not invent any fact. Use null when evidence does not provide a field.',
    'A provider must be an actual physical care provider or practice, not a directory, referral network, insurer, aggregator, marketplace, blog, or consulting intermediary.',
    'sourceUrl must be one of the URLs supplied in the evidence.',
    'Only list a service when the supplied evidence directly supports that service.',
    'Do not infer that a provider offers all requested services merely because it is the right specialty.',
    'Preserve the facility/practice name actually supported by the evidence.',
    'If no direct provider is supported, return {"providers":[]}.'
  ].join(' ');

  const user = JSON.stringify({
    task: context.prompt,
    providerType: profile.label,
    country: context.country,
    city: context.city,
    requiredCapabilities: profile.requiredCapabilities,
    excludedEntityKinds: profile.excludedEntityKinds,
    evidence: payload,
    outputShape: {
      providers: [{
        name: 'string',
        country: 'string',
        city: 'string|null',
        address: 'string|null',
        website: 'string|null',
        phone: 'string|null',
        email: 'string|null',
        sourceUrl: 'one supplied evidence URL',
        services: ['only directly documented requested capabilities']
      }]
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(chatCompletionsUrl(endpoint.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${endpoint.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: endpoint.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Research AI request failed with HTTP ${response.status}`);
    }

    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('Research AI returned no content.');

    const candidates = parseProviderExtraction(content);
    return candidates.filter((candidate) => allowedUrls.has(candidate.sourceUrl || ''));
  } finally {
    clearTimeout(timeout);
  }
}
