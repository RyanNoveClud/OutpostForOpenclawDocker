const KEY = 'outpost-task-aliases';

export type TaskAliasMap = Record<string, string>;

export function loadTaskAliases(): TaskAliasMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (row): row is [string, string] => typeof row[0] === 'string' && typeof row[1] === 'string'
      )
    );
  } catch {
    return {};
  }
}

export function saveTaskAliases(map: TaskAliasMap): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function normalizeAlias(alias: string): string {
  return alias.trim();
}
