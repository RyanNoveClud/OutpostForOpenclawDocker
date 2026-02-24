import { describe, expect, it } from 'vitest';
import { filterLogs } from '../pages/logs-utils';

describe('utils', () => {
  it('filters logs by source', () => {
    const out = filterLogs(
      [
        { id: '1', source: 'outpost', level: 'info', message: 'a', timestamp: 't' },
        { id: '2', source: 'docker', level: 'info', message: 'b', timestamp: 't' }
      ],
      { source: 'docker', level: 'all', keyword: '' }
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('2');
  });
});
