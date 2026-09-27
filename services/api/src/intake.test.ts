import test from 'node:test';
import assert from 'node:assert/strict';

import { parseProviderCsv } from './intake.js';

test('CSV intake accepts common provider outreach headers', () => {
  const rows = parseProviderCsv(
    [
      'Facility Name,Country,City,Email,Contact Name,Provider Type,Priority,PSA Needed,Pricing Requested,Services',
      'Example Clinic,Example Country,Example City,ops@example.test,Jane Smith,dental,HIGH,Yes,Yes,"Service A; Service B"'
    ].join('\n')
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Example Clinic');
  assert.equal(rows[0].email, 'ops@example.test');
  assert.equal(rows[0].contactName, 'Jane Smith');
  assert.equal(rows[0].priority, 'HIGH');
  assert.equal(rows[0].psaNeeded, true);
  assert.equal(rows[0].pricingRequested, true);
  assert.deepEqual(rows[0].services, ['Service A', 'Service B']);
});

test('CSV intake uses campaign geography/provider defaults', () => {
  const rows = parseProviderCsv(
    'Provider Name,Email\nExample Clinic,info@example.test',
    {
      country: 'Example Country',
      city: 'Example City',
      providerType: 'hospital'
    }
  );

  assert.equal(rows[0].country, 'Example Country');
  assert.equal(rows[0].city, 'Example City');
  assert.equal(rows[0].providerType, 'hospital');
});

test('CSV intake rejects rows without a provider name', () => {
  assert.throws(
    () => parseProviderCsv('Provider Name,Country\n,Example Country'),
    /missing a provider\/facility name/
  );
});
