import { describe, expect, it } from 'vitest';

import * as catalogModule from '../src/client/catalog.js';

describe('Client Skill catalog', () => {
  it('shares one in-flight request per session and publishes the hot result', async () => {
    let resolveCatalog!: (
      value: readonly catalogModule.ClientSkillEntry[],
    ) => void;
    let requests = 0;
    const fetchCatalog = () => {
      requests += 1;
      return new Promise<readonly catalogModule.ClientSkillEntry[]>((resolve) => {
        resolveCatalog = resolve;
      });
    };

    expect(typeof catalogModule.createSkillCatalog).toBe('function');
    const catalog = catalogModule.createSkillCatalog?.(fetchCatalog);
    if (!catalog) throw new Error('expected catalog');
    let notifications = 0;
    catalog.subscribe('session-1', () => {
      notifications += 1;
    });

    const first = catalog.fetch('session-1');
    const second = catalog.fetch('session-1');
    expect(requests).toBe(1);
    resolveCatalog([
      {
        name: 'discuss-first',
        description: 'Discuss first.',
        modelInvocable: false,
      },
    ]);

    await expect(first).resolves.toHaveLength(1);
    await expect(second).resolves.toHaveLength(1);
    expect(catalog.hot('session-1')).toEqual([
      {
        name: 'discuss-first',
        description: 'Discuss first.',
        modelInvocable: false,
      },
    ]);
    expect(notifications).toBe(1);
  });
});
