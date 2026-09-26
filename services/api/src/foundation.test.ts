import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESEARCH_PRESETS,
  normalizeProviderName
} from '@network-outreach/core';
import {
  nextPreparationStatus,
  shouldRequestAgreement,
  targetReadiness
} from './outreach.js';

test('South Africa dental preset preserves required capabilities and exclusions', () => {
  const preset = RESEARCH_PRESETS.find((item) => item.id === 'south-africa-dental');

  assert.ok(preset);
  assert.equal(preset.country, 'South Africa');
  assert.equal(preset.providerType, 'dental');
  assert.deepEqual(preset.requiredCapabilities, [
    'Comprehensive dental examination',
    'Bitewing radiographs',
    'Panoramic radiograph'
  ]);
  assert.ok(preset.exclusionRules.some((rule) => rule.includes('already-known')));
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
