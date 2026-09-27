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
      name: 'Example Dental Centre',
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


test('candidate dedupe keeps separate facilities that share a corporate domain', () => {
  const input: ProviderCandidate[] = [
    {
      name: 'Example Health - Central',
      country: 'Example Country',
      city: 'Central City',
      address: '1 Main Street',
      website: 'https://example.test/central',
      services: ['Capability Alpha']
    },
    {
      name: 'Example Health - North',
      country: 'Example Country',
      city: 'North City',
      address: '99 North Road',
      website: 'https://example.test/north',
      services: ['Capability Beta']
    }
  ];

  const result = dedupeProviderCandidates(input);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((candidate) => candidate.city).sort(),
    ['Central City', 'North City']
  );
});

test('JSON extraction parser accepts fenced model output', () => {
  const parsed = parseJsonObject('Here is the result:\n\`\`\`json\n{"providers":[{"name":"Example"}]}\n\`\`\`');
  assert.deepEqual(parsed, { providers: [{ name: 'Example' }] });
});
