import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePhone, splitName } from './leadUtils.ts';

test('normalizes US phones', () => {
  assert.equal(normalizePhone('(970) 401-7285'), '+19704017285');
  assert.equal(normalizePhone('1-970-401-7285'), '+19704017285');
});

test('splits caller names for GHL contacts', () => {
  assert.deepEqual(splitName({ caller_name: 'Sam Sandifer', caller_phone: '9704017285', interested: true }), { first: 'Sam', last: 'Sandifer' });
  assert.deepEqual(splitName({ caller_first_name: 'Sam', caller_last_name: 'Sandifer', caller_phone: '9704017285', interested: true }), { first: 'Sam', last: 'Sandifer' });
});
