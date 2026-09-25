import { config } from './config.js';
import type { ProviderCandidate } from '@network-outreach/core';

interface ExternalMatch {
  found: boolean;
  source: 'network-map' | 'international-search';
  recordId?: string;
  label?: string;
  confidence?: number;
  details?: Record<string, unknown>;
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

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

  const result = await postJson<Record<string, unknown>>(
    `${config.networkMapApiUrl.replace(/\/$/, '')}/api/outreach-match`,
    candidate
  );

  if (!result) return { found: false, source: 'network-map' };

  return {
    found: Boolean(result.found),
    source: 'network-map',
    recordId: typeof result.recordId === 'string' ? result.recordId : undefined,
    label: typeof result.label === 'string' ? result.label : undefined,
    confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
    details: result
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
