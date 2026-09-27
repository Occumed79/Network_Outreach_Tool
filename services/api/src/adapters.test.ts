import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreExistingNetworkMatch } from './adapters.js';

test('International Search existing-network match is definitive on facility name and address', () => {
  const score = scoreExistingNetworkMatch(
    {
      name: 'Example Medical Centre Ltd',
      country: 'Example Country',
      city: 'Example City',
      address: '10 Main Street'
    },
    {
      id: 'network-1',
      providerName: 'Example Medical Centre',
      country: 'Example Country',
      city: 'Example City',
      address: '10 Main Street'
    }
  );

  assert.equal(score, 1);
});

test('same organization does not collapse different facilities without facility evidence', () => {
  const score = scoreExistingNetworkMatch(
    {
      name: 'Example Health North',
      country: 'Example Country',
      city: 'North City',
      address: '9 North Road'
    },
    {
      id: 'network-2',
      providerName: 'Example Health Central',
      organizationName: 'Example Health',
      country: 'Example Country',
      city: 'Central City',
      address: '1 Main Street'
    }
  );

  assert.equal(score, 0);
});

test('same facility name and geography matches an existing-network record', () => {
  const score = scoreExistingNetworkMatch(
    {
      name: 'Direct Care Clinic',
      country: 'Example Country',
      city: 'Example City'
    },
    {
      id: 'network-3',
      providerName: 'Direct Care Clinic',
      country: 'Example Country',
      city: 'Example City'
    }
  );

  assert.equal(score, 0.97);
});
