import test from 'node:test';
import assert from 'node:assert/strict';

import { PROVIDER_TYPE_PROFILES, type ProviderCandidate } from '@network-outreach/core';
import {
  buildSearchQueries,
  dedupeProviderCandidates,
  parseJsonObject
} from './researchWorker.js';

test('dental research queries carry location and required capabilities', () => {
  const profile = PROVIDER_TYPE_PROFILES.find((item) => item.id === 'dental');
  assert.ok(profile);

  const queries = buildSearchQueries({
    prompt: 'Find dental providers in South Africa',
    providerType: 'dental',
    country: 'South Africa',
    city: 'Cape Town'
  }, profile);

  assert.ok(queries.length >= 3);
  assert.ok(queries.every((query) => query.includes('South Africa')));
  assert.ok(queries.some((query) => query.toLowerCase().includes('bitewing')));
  assert.ok(queries.some((query) => query.toLowerCase().includes('panoramic')));
  assert.ok(queries.some((query) => query.includes('Cape Town')));
});

test('candidate dedupe merges services for the same website domain', () => {
  const input: ProviderCandidate[] = [
    {
      name: 'Example Dental Centre',
      country: 'South Africa',
      city: 'Cape Town',
      website: 'https://example.co.za/dental',
      services: ['Bitewing radiographs']
    },
    {
      name: 'Example Dental',
      country: 'South Africa',
      city: 'Cape Town',
      website: 'https://www.example.co.za/contact',
      email: 'accounts@example.co.za',
      services: ['Panoramic radiograph']
    }
  ];

  const result = dedupeProviderCandidates(input);

  assert.equal(result.length, 1);
  assert.equal(result[0].email, 'accounts@example.co.za');
  assert.deepEqual(new Set(result[0].services), new Set([
    'Bitewing radiographs',
    'Panoramic radiograph'
  ]));
});

test('JSON extraction parser accepts fenced model output', () => {
  const parsed = parseJsonObject('Here is the result:\n\`\`\`json\n{"providers":[{"name":"Example"}]}\n\`\`\`');
  assert.deepEqual(parsed, { providers: [{ name: 'Example' }] });
});
