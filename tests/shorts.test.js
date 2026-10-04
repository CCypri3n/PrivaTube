const test = require('node:test');
const assert = require('node:assert');
const {
  parseDuration,
  SHORTS_MAX_SECONDS,
  isShort,
  isListable
} = require('../web/shorts.js');

test('parseDuration', async (t) => {
  await t.test('PT45S = 45', () => {
    assert.equal(parseDuration('PT45S'), 45);
  });

  await t.test('PT2M30S = 150', () => {
    assert.equal(parseDuration('PT2M30S'), 150);
  });

  await t.test('PT1H2M3S = 3723', () => {
    assert.equal(parseDuration('PT1H2M3S'), 3723);
  });

  await t.test('PT1H = 3600', () => {
    assert.equal(parseDuration('PT1H'), 3600);
  });

  await t.test('P0D no-throw = 0', () => {
    assert.equal(parseDuration('P0D'), 0);
  });

  await t.test('empty string = 0', () => {
    assert.equal(parseDuration(''), 0);
  });

  await t.test('invalid string = 0', () => {
    assert.equal(parseDuration('invalid'), 0);
  });

  await t.test('null = 0', () => {
    assert.equal(parseDuration(null), 0);
  });
});

test('isShort', async (t) => {
  await t.test('90s no tag -> short', () => {
    const video = { duration: 'PT1M30S', title: 'Test Video', description: 'A test' };
    assert.equal(isShort(video), true);
  });

  await t.test('181s kept (not short)', () => {
    const video = { duration: 'PT3M1S', title: 'Test Video', description: 'A test' };
    assert.equal(isShort(video), false);
  });

  await t.test('4h kept (not short)', () => {
    const video = { duration: 'PT4H', title: 'Test Video', description: 'A test' };
    assert.equal(isShort(video), false);
  });

  await t.test('#shorts tagged long video is short', () => {
    const video = { duration: 'PT1H', title: '#Shorts Test', description: 'A test' };
    assert.equal(isShort(video), true);
  });

  await t.test('#shorts in description makes it short', () => {
    const video = { duration: 'PT2H', title: 'Long Video', description: 'Check out my #Shorts' };
    assert.equal(isShort(video), true);
  });

  await t.test('case-insensitive tag check', () => {
    const video = { duration: 'PT5H', title: '#SHORTS', description: 'Test' };
    assert.equal(isShort(video), true);
  });

  await t.test('180s exactly is short', () => {
    const video = { duration: 'PT3M', title: 'Test', description: 'Test' };
    assert.equal(isShort(video), true);
  });

  await t.test('0 seconds (livestream) is not short', () => {
    const video = { duration: 'P0D', title: 'Test', description: 'Test' };
    assert.equal(isShort(video), false);
  });
});

test('isListable', async (t) => {
  await t.test('livestream P0D not listable', () => {
    const video = { duration: 'P0D', title: 'Live Stream', description: 'Live' };
    assert.equal(isListable(video), false);
  });

  await t.test('short video not listable', () => {
    const video = { duration: 'PT1M', title: 'Short Video', description: 'Short one' };
    assert.equal(isListable(video), false);
  });

  await t.test('regular 10 minute video is listable', () => {
    const video = { duration: 'PT10M', title: 'Regular Video', description: 'A normal video' };
    assert.equal(isListable(video), true);
  });

  await t.test('long video is listable', () => {
    const video = { duration: 'PT1H30M', title: 'Long Video', description: 'A longer video' };
    assert.equal(isListable(video), true);
  });

  await t.test('#shorts tagged video not listable even if long', () => {
    const video = { duration: 'PT5H', title: '#Shorts Challenge', description: 'Test' };
    assert.equal(isListable(video), false);
  });
});
