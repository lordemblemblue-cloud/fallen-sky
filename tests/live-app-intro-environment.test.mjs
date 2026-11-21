import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowLiveIntro } from '../src/components/games/liveIntroEnvironment.js';

test('published app includes the cinematic', () => {
  assert.equal(shouldShowLiveIntro({ hostname: 'adam-x-eve-games.base44.app' }), true);
  assert.equal(shouldShowLiveIntro({ hostname: 'games.example.org' }), true);
});

test('local development and embedded editor previews omit the cinematic', () => {
  assert.equal(shouldShowLiveIntro({ hostname: 'localhost', isDevelopment: true }), false);
  assert.equal(shouldShowLiveIntro({ hostname: 'adam-x-eve-games.base44.app', embedded: true }), false);
  assert.equal(shouldShowLiveIntro({ hostname: 'adam-x-eve-games.base44.app', isPreview: true }), false);
});

test('preview hosts and preview-link parameters omit the cinematic', () => {
  assert.equal(shouldShowLiveIntro({ hostname: 'preview--adam-x-eve-games.base44.app' }), false);
  assert.equal(shouldShowLiveIntro({ hostname: 'preview.adam-x-eve-games.base44.app' }), false);
  assert.equal(shouldShowLiveIntro({ hostname: 'sandbox-example.base44.app' }), false);
  assert.equal(shouldShowLiveIntro({ hostname: 'adam-x-eve-games.base44.app', search: '?preview=true' }), false);
  assert.equal(shouldShowLiveIntro({ hostname: 'adam-x-eve-games.base44.app', search: '?editor=1' }), false);
});
