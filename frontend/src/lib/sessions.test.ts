import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT_PRESETS,
  createChatSession,
  migrateStoredSessions,
} from './sessions';

describe('sessions', () => {
  it('creates new sessions with the current balance and full default presets', () => {
    const session = createChatSession(172.3456);

    expect(session.remainingBalanceUsd).toBe(172.3456);
    expect(session.promptPresets.map((preset) => preset.text)).toEqual(
      DEFAULT_PROMPT_PRESETS.map((preset) => preset.text),
    );
  });

  it('migrates stale loading messages into retryable errors', async () => {
    const sessions = await migrateStoredSessions(
      JSON.stringify([
        {
          id: 'session-1',
          title: '旧会话',
          timestamp: 1,
          messages: [
            {
              id: 1,
              type: 'loading',
            },
          ],
        },
      ]),
      183.25,
    );

    expect(sessions[0].remainingBalanceUsd).toBe(183.25);
    expect(sessions[0].messages[0]).toMatchObject({
      type: 'error',
      error: '上次生成未完成，请重新生成。',
    });
  });
});
