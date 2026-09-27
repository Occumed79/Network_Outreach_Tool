import test from 'node:test';
import assert from 'node:assert/strict';

import type { ProviderCandidate, ProviderTypeProfile } from '@network-outreach/core';
import {
  buildSearchQueries,
  dedupeProviderCandidates,
  parseJsonObject
} from './researchWorker.js';

test('research queries carry arbitrary geography and profile capabilities', () => {
  const profile: ProviderTypeProfile = {
    id: 'test-specialty',
    label: 'Specialty Care',
    agreementTemplateKey: 'test-agreement',
    emailTemplateKey: 'test-email',
    requiredCapabilities: ['Capability Alpha', 'Capability Beta', 'Capability Gamma'],
    preferredContactRoles: ['Practice Manager'],
    excludedEntityKinds: ['directory']
  };

  const queries = buildSearchQueries({
    prompt: 'Find specialty providers matching my requirements',
    providerType: profile.id,
    country: 'Example Country',
    city: 'Example City'
  }, profile);

  assert.ok(queries.length >= 3);
  assert.ok(queries.some((query) => query.includes('Example Country')));
  assert.ok(queries.some((query) => query.includes('Example City')));
  assert.ok(queries.some((query) => query.includes('Capability Alpha')));
  assert.ok(queries.some((query) => query.includes('Capability Gamma')));
});

test('candidate dedupe merges services for the same website domain', () => {
  const input: ProviderCandidate[] = [
    {
      name: 'Example Dental Centre',
      country: 'Example Country',
      city: 'Example City',
      website: 'https://example.test/dental',
      services: ['Bitewing radiographs']
    },
    {
      name: 'Example Dental',
      country: 'Example Country',
      city: 'Example City',
      website: 'https://www.example.test/contact',
      email: 'accounts@example.test',
      services: ['Panoramic radiograph']
    }
  ];

  const result = dedupeProviderCandidates(input);

  assert.equal(result.length, 1);
  assert.equal(result[0].email, 'accounts@example.test');
  assert.deepEqual(new Set(result[0].services), new Set([
    'Bitewing radiographs',
    'Panoramic radiograph'
  ]));
});

test('JSON extraction parser accepts fenced model output', () => {
  const parsed = parseJsonObject('Here is the result:\n\`\`\`json\n{"providers":[{"name":"Example"}]}\n\`\`\`');
  assert.deepEqual(parsed, { providers: [{ name: 'Example' }] });
});
