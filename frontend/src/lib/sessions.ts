import type {
  ChatMessage,
  ChatSession,
  ImageAssetRef,
  ImageResult,
  PromptPreset,
} from '../types';
import { base64ToBlob } from './media';
import { saveImageBlob } from './imageStore';

export const STORAGE_KEY = 'nananobanana_sessions';

export const DEFAULT_PROMPT_PRESETS: PromptPreset[] = [
  '保持角度和建筑轮廓不变',
  '根据标记进行设计',
  '去掉所有的标记',
  '4K 超高清，增强清晰度和锐度，补充细节',
].map((text, index) => ({
  id: `default-${index + 1}`,
  text,
  createdAt: index + 1,
  updatedAt: index + 1,
}));

export const createChatSession = (): ChatSession => ({
  id: Date.now().toString(),
  title: '新对话',
  messages: [],
  promptPresets: DEFAULT_PROMPT_PRESETS.map((preset) => ({ ...preset })),
  timestamp: Date.now(),
});

export const deriveSessionTitle = (messages: ChatMessage[], fallbackTitle: string): string => {
  const promptSource = messages
    .filter((message) => message.type === 'user' && message.prompt)
    .map((message) => message.prompt!.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');

  if (!promptSource) {
    return fallbackTitle;
  }

  const normalized = promptSource
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?,，]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const summary = normalized.length > 18 ? `${normalized.slice(0, 18).trim()}...` : normalized;

  return summary || fallbackTitle;
};

const isAssetRef = (value: unknown): value is ImageAssetRef =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'assetId' in value &&
      typeof (value as { assetId: unknown }).assetId === 'string',
  );

const migrateRefImages = async (
  sessionId: string,
  refImages: unknown,
): Promise<ImageAssetRef[] | undefined> => {
  if (!Array.isArray(refImages) || refImages.length === 0) {
    return undefined;
  }

  if (refImages.every((item) => isAssetRef(item))) {
    return refImages as ImageAssetRef[];
  }

  const migrated = await Promise.all(
    refImages.map(async (value, index) => {
      if (typeof value !== 'string') {
        return null;
      }

      const blob = await fetch(value).then((response) => response.blob());
      const asset = await saveImageBlob({
        sessionId,
        blob,
        mimeType: blob.type || 'image/png',
        fileName: `legacy_reference_${index + 1}.${(blob.type || 'image/png').split('/')[1] ?? 'png'}`,
        kind: 'legacy-inline',
      });

      return {
        assetId: asset.id,
        kind: asset.kind,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      } satisfies ImageAssetRef;
    }),
  );

  return migrated.filter((value): value is NonNullable<typeof value> => Boolean(value));
};

const migrateGeneratedImages = async (
  sessionId: string,
  images: unknown,
): Promise<ImageAssetRef[] | undefined> => {
  if (!Array.isArray(images) || images.length === 0) {
    return undefined;
  }

  if (images.every((item) => isAssetRef(item))) {
    return images as ImageAssetRef[];
  }

  const migrated = await Promise.all(
    images.map(async (value, index) => {
      const image = value as ImageResult;

      if (!image?.data || !image?.model) {
        return null;
      }

      const mimeType = image.mime_type ?? 'image/jpeg';
      const blob = base64ToBlob(image.data, mimeType);
      const asset = await saveImageBlob({
        sessionId,
        blob,
        mimeType,
        fileName: `legacy_generated_${index + 1}.${mimeType.split('/')[1] ?? 'jpg'}`,
        kind: 'generated',
        model: image.model,
      });

      return {
        assetId: asset.id,
        kind: asset.kind,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        model: asset.model,
      } satisfies ImageAssetRef;
    }),
  );

  return migrated.filter((value): value is NonNullable<typeof value> => Boolean(value));
};

export const migrateStoredSessions = async (
  rawValue: string | null,
): Promise<ChatSession[]> => {
  if (!rawValue) {
    return [createChatSession()];
  }

  try {
    const parsed = JSON.parse(rawValue) as Array<Partial<ChatSession>>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createChatSession()];
    }

    return Promise.all(
      parsed.map(async (session) => {
        const sessionId = session.id || Date.now().toString();
        const messages = await Promise.all(
          (session.messages ?? []).map(async (message) => {
            const normalizedMessage =
              message.type === 'loading'
                ? {
                    ...message,
                    type: 'error' as const,
                    error: '上次生成未完成，请重新生成。',
                    images: undefined,
                  }
                : message;

            return {
              ...normalizedMessage,
              refImages: await migrateRefImages(sessionId, normalizedMessage.refImages),
              images: await migrateGeneratedImages(sessionId, normalizedMessage.images),
            };
          }),
        );

        return {
          id: sessionId,
          title: session.title || '新对话',
          timestamp: session.timestamp || Date.now(),
          messages,
          promptPresets:
            session.promptPresets && session.promptPresets.length > 0
              ? session.promptPresets
              : DEFAULT_PROMPT_PRESETS.map((preset) => ({ ...preset })),
        } satisfies ChatSession;
      }),
    );
  } catch {
    return [createChatSession()];
  }
};
