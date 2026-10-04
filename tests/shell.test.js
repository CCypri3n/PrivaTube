const test = require('node:test');
const assert = require('node:assert');
const { Shell } = require('../web/shell.js');

test('messageForFailure: one message per failure reason', async (t) => {
  await t.test('quota_exceeded', () => {
    assert.equal(Shell.messageForFailure({ reason: 'quota_exceeded' }, 'x'),
      "YouTube's daily limit for your API key has been reached. Please try again tomorrow.");
  });
  await t.test('invalid_key', () => {
    assert.equal(Shell.messageForFailure({ reason: 'invalid_key' }, 'x'),
      "Your API key is invalid. Please check it and try again.");
  });
  await t.test('offline', () => {
    assert.equal(Shell.messageForFailure({ reason: 'offline' }, 'x'),
      "You appear to be offline. Please check your connection and try again.");
  });
  await t.test('not_found', () => {
    assert.equal(Shell.messageForFailure({ reason: 'not_found' }, 'x'), 'Not found.');
  });
  await t.test('other reason gives the page fallback', () => {
    assert.equal(Shell.messageForFailure({ reason: 'other' }, 'Could not load.'), 'Could not load.');
  });
  await t.test('unknown reason, plain error, null and undefined give the fallback', () => {
    assert.equal(Shell.messageForFailure({ reason: 'weird' }, 'fb'), 'fb');
    assert.equal(Shell.messageForFailure(new Error('boom'), 'fb'), 'fb');
    assert.equal(Shell.messageForFailure(null, 'fb'), 'fb');
    assert.equal(Shell.messageForFailure(undefined, 'fb'), 'fb');
  });
});
