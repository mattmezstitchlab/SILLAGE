import { isThemeDirty, getThemeCleanupIds } from './theme';
import { EventTheme } from '@workspace/api-client-react';

// Basic mock data
const saved: EventTheme = {
  mode: 'studio',
  imageId: null,
  imageUrl: null,
  focalX: 50,
  focalY: 50,
  overlay: 0.5,
  guestImageConsent: false,
  revision: 1
};

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(e);
    process.exit(1);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

runTest('isThemeDirty - identical', () => {
  const draft = { ...saved };
  assert(isThemeDirty(saved, draft) === false, 'should not be dirty');
});

runTest('isThemeDirty - mode changed', () => {
  const draft = { ...saved, mode: 'editorial' as const };
  assert(isThemeDirty(saved, draft) === true, 'should be dirty');
});

runTest('isThemeDirty - ignores imageUrl', () => {
  const draft = { ...saved, imageUrl: 'http://example.com/changed.jpg' };
  assert(isThemeDirty(saved, draft) === false, 'should ignore imageUrl');
});

runTest('isThemeDirty - imageId changed', () => {
  const draft = { ...saved, imageId: '12345' };
  assert(isThemeDirty(saved, draft) === true, 'should detect imageId change');
});

runTest('getThemeCleanupIds - no changes', () => {
  const draft = { ...saved };
  const ids = getThemeCleanupIds(saved, draft);
  assert(ids.length === 0, 'should clean nothing');
});

runTest('getThemeCleanupIds - new unpersisted image', () => {
  const draft = { ...saved, imageId: 'new-id-123' };
  const ids = getThemeCleanupIds(saved, draft);
  assert(ids.length === 1 && ids[0] === 'new-id-123', 'should return unpersisted image id');
});

runTest('getThemeCleanupIds - removing previously saved image (should NOT clean)', () => {
  const savedWithImg = { ...saved, imageId: 'saved-id-456' };
  const draft = { ...saved, imageId: null };
  const ids = getThemeCleanupIds(savedWithImg, draft);
  assert(ids.length === 0, 'should not clean saved image');
});

runTest('getThemeCleanupIds - replacing previously saved image with unpersisted image', () => {
  const savedWithImg = { ...saved, imageId: 'saved-id-456' };
  const draft = { ...saved, imageId: 'new-id-123' };
  const ids = getThemeCleanupIds(savedWithImg, draft);
  assert(ids.length === 1 && ids[0] === 'new-id-123', 'should only clean unpersisted image id');
});

console.log('All theme pure helper tests passed.');