import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-connection/client';
// SessionId and the client `sessions` service live in different packages since
// 0.2: the id brand belongs to the connection contract, the service to the
// session controller. The old `dsh-client-runtime` barrel no longer exists.
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { InputTriggerController } from '@deepseek-ai/dsh-client-ui-input-trigger/client';

import { createSkillCatalog } from './catalog.js';
import { installInputTriggerCompat } from './compat.js';
import { createSkillMentionSource } from './source.js';

interface InputTriggerRegistry {
  registerSource(source: unknown): () => void;
}

export const inject = [
  'remote',
  'connection',
  'sessions',
  'inputTriggers',
];

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection');
  // Host and Client rc.6 both augment `Context.sessions` with different
  // services. This package type-checks both halves together, so narrow the
  // injected Client service at this boundary instead of relying on the merged
  // property selected by TypeScript.
  const sessions = ctx.get('sessions') as unknown as ISessions;
  const inputTriggers = ctx.get('inputTriggers') as unknown as InputTriggerRegistry;
  const catalog = createSkillCatalog(async (rawSessionId, signal) => {
    const sessionId = rawSessionId as SessionId;
    if (sessions.subagentAddress(sessionId) !== undefined) return [];
    const { result } = await connection.api.skills.list({ sessionId }, signal);
    if (!result.ok) {
      throw new Error(
        `skill.list failed: ${result.error.code}: ${result.error.message}`,
      );
    }
    return result.value.skills;
  });

  ctx.remote.$on('agent-preset/selected', (sessionId) => {
    catalog.invalidate(sessionId);
  });
  ctx.on('connection/reset', () => {
    catalog.clear();
  });
  ctx.effect(() => {
    const restoreController = installInputTriggerCompat(InputTriggerController);
    const unregisterDollar = inputTriggers.registerSource(
      createSkillMentionSource({
        trigger: '$',
        catalog,
        userOnlyLabel: 'User only',
      }),
    );
    const unregisterRenminbi = inputTriggers.registerSource(
      createSkillMentionSource({
        trigger: '￥',
        catalog,
        userOnlyLabel: 'User only',
      }),
    );

    return () => {
      unregisterRenminbi();
      unregisterDollar();
      restoreController();
      catalog.clear();
    };
  }, 'dsh-composer-skill-mention: sources');
}
