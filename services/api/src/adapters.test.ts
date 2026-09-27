import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreNetworkMapMatch } from './adapters.js';

test('exact facility name and address is a definitive existing-network match', () => {
  const score = scoreNetworkMapMatch(
    {
      name: 'Example Medical Centre Ltd',
      country: 'Example Country',
      city: 'Example City',
      address: '10 Main Street',
      website: 'https://example.test'
    },
    {
      id: 'provider-1',
      name: 'Example Medical Centre',
      country: 'Example Country',
      city: 'Example City',
      address: '10 Main Street',
      website: 'https://example.test'
    }
  );

  assert.equal(score, 1);
});

test('shared corporate domain alone does not collapse different facilities', () => {
  const score = scoreNetworkMapMatch(
    {
      name: 'Example Health North',
      country: 'Example Country',
      city: 'North City',
      address: '9 North Road',
      website: 'https://example.test/north'
    },
    {
      id: 'provider-2',
      name: 'Example Health Central',
      country: 'Example Country',
      city: 'Central City',
      address: '1 Main Street',
      website: 'https://example.test/central'
    }
  );

  assert.equal(score, 0);
});

test('same facility name and geography can match even when the source lacks a website', () => {
  const score = scoreNetworkMapMatch(
    {
      name: 'Direct Care Clinic',
      country: 'Example Country',
      city: 'Example City'
    },
    {
      id: 'provider-3',
      name: 'Direct Care Clinic',
      country: 'Example Country',
      city: 'Example City'
    }
  );

  assert.equal(score, 0.96);
});
