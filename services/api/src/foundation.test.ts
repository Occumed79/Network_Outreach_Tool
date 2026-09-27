import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_TYPE_PROFILES,
  normalizeProviderName
} from '@network-outreach/core';
import {
  nextPreparationStatus,
  shouldRequestAgreement,
  targetReadiness
} from './outreach.js';

test('provider profiles carry routing, capability, and exclusion rules', () => {
  const dental = PROVIDER_TYPE_PROFILES.find((item) => item.id === 'dental');
  const audiology = PROVIDER_TYPE_PROFILES.find((item) => item.id === 'audiology');

  assert.ok(dental);
  assert.ok(audiology);
  assert.equal(dental.agreementTemplateKey, 'dental');
  assert.ok(dental.requiredCapabilities.includes('Bitewing radiographs'));
  assert.ok(dental.excludedEntityKinds.includes('referral network'));
  assert.ok(audiology.requiredCapabilities.includes('Pure-tone audiometry'));
});

test('provider normalization strips legal suffixes without collapsing identity', () => {
  assert.equal(
    normalizeProviderName('Example Dental Centre (Pty) Ltd.'),
    'example dental centre'
  );
});

test('PSA-required targets cannot become export-ready before generation', () => {
  assert.deepEqual(
    targetReadiness(true, 'WAITING_INTEGRATION'),
    { status: 'WAITING_ON_PSA', readyForExport: false }
  );
  assert.deepEqual(
    targetReadiness(true, 'GENERATOR_ERROR'),
    { status: 'WAITING_ON_PSA', readyForExport: false }
  );
});

test('generated or non-required agreements allow export readiness', () => {
  assert.deepEqual(
    targetReadiness(true, 'GENERATED'),
    { status: 'READY', readyForExport: true }
  );
  assert.deepEqual(
    targetReadiness(false, null),
    { status: 'READY', readyForExport: true }
  );
});


test('preparation preserves later outreach lifecycle states', () => {
  assert.equal(nextPreparationStatus('CONTACTED', 'READY'), 'CONTACTED');
  assert.equal(nextPreparationStatus('NEED_FOLLOW_UP', 'READY'), 'NEED_FOLLOW_UP');
  assert.equal(nextPreparationStatus('DECLINED', 'READY'), 'DECLINED');
  assert.equal(nextPreparationStatus('WAITING_ON_PSA', 'READY'), 'READY');
});

test('agreement generation retries every non-generated attempt', () => {
  assert.equal(shouldRequestAgreement(true, 'WAITING_INTEGRATION'), true);
  assert.equal(shouldRequestAgreement(true, 'GENERATOR_ERROR'), true);
  assert.equal(shouldRequestAgreement(true, undefined), true);
  assert.equal(shouldRequestAgreement(true, 'GENERATED'), false);
  assert.equal(shouldRequestAgreement(false, undefined), false);
});
