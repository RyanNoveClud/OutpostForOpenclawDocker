import type { UiSettingsState } from '../store';

const KEY = 'outpost-ui-settings';

function normalizeTheme(theme: unknown): UiSettingsState['theme'] | undefined {
  if (theme === 'nebula' || theme === 'ocean' || theme === 'mono') return theme;
  if (theme === 'dark') return 'nebula';
  if (theme === 'light') return 'ocean';
  return undefined;
}

export function loadUiSettings(): Partial<UiSettingsState> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<UiSettingsState> & { theme?: string };
    return {
      ...parsed,
      theme: normalizeTheme(parsed.theme)
    };
  } catch {
    return {};
  }
}

export function saveUiSettings(settings: UiSettingsState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(settings));
}
