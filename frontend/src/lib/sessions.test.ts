import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT_PRESETS,
  createChatSession,
  migrateStoredSessions,
} from './sessions';

describe('sessions', () => {
  it('creates new sessions with full default presets', () => {
    const session = createChatSession();

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
    );

    expect(sessions[0].messages[0]).toMatchObject({
      type: 'error',
      error: '上次生成未完成，请重新生成。',
    });
  });
});
