import { describe, expect, it } from 'vitest';
import { buildSessionMemoryPrompt, serializePromptInput } from './memory';
import type { ChatMessage, PromptPreset } from '../types';

const messages: ChatMessage[] = [
  {
    id: 1,
    type: 'user',
    prompt: '保留建筑轮廓',
  },
  {
    id: 2,
    type: 'bot',
    images: [],
  },
  {
    id: 3,
    type: 'user',
    prompt: '增强天空层次',
  },
];

const presets: PromptPreset[] = [
  {
    id: 'preset-1',
    text: '保持角度不变',
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: 10,
  },
  {
    id: 'preset-2',
    text: '根据标记修改',
    createdAt: 2,
    updatedAt: 2,
  },
];

describe('memory', () => {
  it('builds session memory from recent user prompts and used presets', () => {
    expect(buildSessionMemoryPrompt(messages, presets, ['preset-1'])).toBe(
      '对话记忆：保留建筑轮廓；增强天空层次；已用提示词：保持角度不变',
    );
  });

  it('serializes memory and current prompt into final request text', () => {
    expect(
      serializePromptInput({
        currentPrompt: '把海报改成暖色',
        memoryPrompt: '对话记忆：保留建筑轮廓；增强天空层次',
      }),
    ).toBe('对话记忆：保留建筑轮廓；增强天空层次\n\n当前任务：把海报改成暖色');
  });
});
