import type { ChatMessage, PromptPreset } from '../types';

const RECENT_USER_PROMPT_LIMIT = 4;

export const buildSessionMemoryPrompt = (
  messages: ChatMessage[],
  presets: PromptPreset[],
  usedPresetIds: string[],
): string => {
  const recentPrompts = messages
    .filter((message) => message.type === 'user' && message.prompt)
    .slice(-RECENT_USER_PROMPT_LIMIT)
    .map((message) => message.prompt!.trim())
    .filter(Boolean);

  const usedPresetTexts = usedPresetIds
    .map((presetId) => presets.find((preset) => preset.id === presetId)?.text.trim())
    .filter((value): value is string => Boolean(value));

  const parts: string[] = [];

  if (recentPrompts.length > 0) {
    parts.push(recentPrompts.join('；'));
  }

  if (usedPresetTexts.length > 0) {
    parts.push(`已用提示词：${usedPresetTexts.join('；')}`);
  }

  return parts.length > 0 ? `对话记忆：${parts.join('；')}` : '';
};

export const serializePromptInput = ({
  currentPrompt,
  memoryPrompt,
}: {
  currentPrompt: string;
  memoryPrompt: string;
}): string => {
  const cleanPrompt = currentPrompt.trim();

  if (!memoryPrompt.trim()) {
    return cleanPrompt;
  }

  return `${memoryPrompt.trim()}\n\n当前任务：${cleanPrompt}`;
};
