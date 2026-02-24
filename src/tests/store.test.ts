import { describe, expect, it } from 'vitest';
import { useAppStore } from '../store';

describe('store', () => {
  it('updates ui settings', () => {
    useAppStore.getState().setUiSettings({ theme: 'ocean' });
    expect(useAppStore.getState().ui.theme).toBe('ocean');
  });
});
