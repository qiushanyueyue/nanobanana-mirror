import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import axios from 'axios';
import { ImageEditorModal } from './ImageEditorModal';
import { loadObjectUrl, readImageDimensions, saveImageBlob, getImageAsset } from '../lib/imageStore';
import { buildSessionMemoryPrompt, serializePromptInput } from '../lib/memory';
import { base64ToBlob, copyBlobToClipboard, downloadBlob, fileToBase64, compressImageBlob } from '../lib/media';
import type { ChatSession, GenerateResponse, ImageAssetRef, ModelId } from '../types';

interface ImageGeneratorProps {
  session: ChatSession;
  currentBalanceUsd: number;
  aspectRatio: string;
  resolution: string;
  selectedModels: ModelId[];
  onSessionUpdate: (sessionId: string, patch: Partial<ChatSession>) => void;
  appliedPresetRequest: {
    sessionId: string;
    presetId: string;
    text: string;
    nonce: number;
  } | null;
}

type PendingReference = {
  id: string;
  sourceBlob: Blob;
  sourceName: string;
  originalPreviewUrl: string;
  currentBlob: Blob;
  currentPreviewUrl: string;
  mimeType: string;
  edited: boolean;
};

type IncomingReference = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

type LightboxState = {
  src: string;
  title: string;
  onCopy?: () => Promise<void>;
  onDownload?: () => Promise<void>;
} | null;

const MODEL_COLORS: Record<ModelId, string> = {
  'gemini-3-pro-image-preview': '#ff9b3d',
  'gemini-3.1-flash-image-preview': '#2f6fff',
};

const MODEL_LABELS: Record<ModelId, string> = {
  'gemini-3-pro-image-preview': 'Nano Banana Pro',
  'gemini-3.1-flash-image-preview': 'Nano Banana 2',
};

const RATIO_LABEL: Record<string, string> = {
  auto: '自动',
  '1:1': '1:1',
  '9:16': '9:16',
  '16:9': '16:9',
  '3:4': '3:4',
  '4:3': '4:3',
  '3:2': '3:2',
  '2:3': '2:3',
  '5:4': '5:4',
  '4:5': '4:5',
  '21:9': '21:9',
};

const RES_LABEL: Record<string, string> = { '1k': '1K', '2k': '2K', '4k': '4K' };
const ASSET_DRAG_MIME = 'application/x-nananobanana-asset-id';
const REQUEST_TIMEOUT_MS = 195_000;

const createTempId = (): string => `temp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const toCssRatio = (ratio: string): string => (ratio === 'auto' ? '1/1' : ratio.replace(':', '/'));

const withExtension = (fileName: string, nextExtension: string): string => {
  const baseName = fileName.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${baseName}.${nextExtension}`;
};

const uniqueIds = (values: string[]): string[] => Array.from(new Set(values));

const createPendingReference = (source: IncomingReference): PendingReference => {
  const normalizedBlob =
    source.blob.type === source.mimeType
      ? source.blob
      : source.blob.slice(0, source.blob.size, source.mimeType);
  const previewUrl = URL.createObjectURL(normalizedBlob);

  return {
    id: createTempId(),
    sourceBlob: normalizedBlob,
    sourceName: source.fileName || `reference_${Date.now()}.png`,
    originalPreviewUrl: previewUrl,
    currentBlob: normalizedBlob,
    currentPreviewUrl: previewUrl,
    mimeType: source.mimeType || normalizedBlob.type || 'image/jpeg',
    edited: false,
  };
};

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({
  session,
  currentBalanceUsd,
  aspectRatio,
  resolution,
  selectedModels,
  onSessionUpdate,
  appliedPresetRequest,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingRefs, setPendingRefs] = useState<PendingReference[]>([]);
  const [lightboxState, setLightboxState] = useState<LightboxState>(null);
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [usedPresetIds, setUsedPresetIds] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lightboxCopySucceeded, setLightboxCopySucceeded] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [assetActionFeedback, setAssetActionFeedback] = useState<Record<string, 'copied' | 'downloaded'>>({});
  const [textCopyFeedback, setTextCopyFeedback] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lightboxImageShellRef = useRef<HTMLDivElement>(null);
  const assetUrlCacheRef = useRef<Record<string, string>>({});
  const lastAppliedPresetNonceRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lightboxCopyTimerRef = useRef<number | null>(null);
  const assetActionTimersRef = useRef<Record<string, number>>({});
  const textCopyTimersRef = useRef<Record<string, number>>({});
  const lightboxDragStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const sessionMessages = session.messages;
  const promptPresets = session.promptPresets;

  const releasePendingRefs = useCallback((refs: PendingReference[]) => {
    refs.forEach((ref) => {
      URL.revokeObjectURL(ref.originalPreviewUrl);
      if (ref.currentPreviewUrl !== ref.originalPreviewUrl) {
        URL.revokeObjectURL(ref.currentPreviewUrl);
      }
    });
  }, []);

  const clearPendingRefs = useCallback(() => {
    setPendingRefs((previousRefs) => {
      releasePendingRefs(previousRefs);
      return [];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [releasePendingRefs]);

  const addPendingReferences = useCallback(async (sources: IncomingReference[]) => {
    if (sources.length === 0) {
      return;
    }

    setPendingRefs((previousRefs) => [...previousRefs, ...sources.map(createPendingReference)]);
  }, []);

  const handleFilesUpload = useCallback(
    async (files: FileList | null) => {
      if (!files) {
        return;
      }

      await addPendingReferences(
        Array.from(files).map((file) => ({
          blob: file,
          fileName: file.name || `reference_${Date.now()}.png`,
          mimeType: file.type || 'image/jpeg',
        })),
      );
    },
    [addPendingReferences],
  );

  const handleAssetDrop = useCallback(
    async (assetIds: string[]) => {
      const assets = await Promise.all(assetIds.map((assetId) => getImageAsset(assetId)));
      const sources = assets
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
        .map((asset) => ({
          blob: asset.blob,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        }));

      await addPendingReferences(sources);
    },
    [addPendingReferences],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages, loading]);

  useEffect(() => {
    if (!loading || !generationStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    setElapsedSeconds(Math.max(1, Math.floor((Date.now() - generationStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.floor((Date.now() - generationStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [generationStartedAt, loading]);

  useEffect(() => {
    setPrompt('');
    setUsedPresetIds([]);
    clearPendingRefs();
  }, [session.id, clearPendingRefs]);

  useEffect(() => {
    if (
      !appliedPresetRequest ||
      appliedPresetRequest.sessionId !== session.id ||
      appliedPresetRequest.nonce === lastAppliedPresetNonceRef.current
    ) {
      return;
    }

    setPrompt((previousPrompt) =>
      previousPrompt.trim()
        ? `${previousPrompt.trim()}\n${appliedPresetRequest.text}`
        : appliedPresetRequest.text,
    );
    setUsedPresetIds((previousPresetIds) =>
      previousPresetIds.includes(appliedPresetRequest.presetId)
        ? previousPresetIds
        : [...previousPresetIds, appliedPresetRequest.presetId],
    );
    lastAppliedPresetNonceRef.current = appliedPresetRequest.nonce;
  }, [appliedPresetRequest, session.id]);

  const persistedAssetIds = useMemo(
    () =>
      uniqueIds(
        sessionMessages.flatMap((message) => [
          ...(message.refImages ?? []).map((image) => image.assetId),
          ...(message.images ?? []).map((image) => image.assetId),
        ]),
      ),
    [sessionMessages],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateAssetUrls = async () => {
      if (persistedAssetIds.length === 0) {
        Object.values(assetUrlCacheRef.current).forEach((url) => URL.revokeObjectURL(url));
        assetUrlCacheRef.current = {};
        setAssetUrls({});
        return;
      }

      const entries = await Promise.all(
        persistedAssetIds.map(async (assetId) => [assetId, await loadObjectUrl(assetId)] as const),
      );

      if (cancelled) {
        entries.forEach(([, url]) => {
          if (url) {
            URL.revokeObjectURL(url);
          }
        });
        return;
      }

      const nextUrls = Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string'),
      );

      Object.entries(assetUrlCacheRef.current).forEach(([assetId, url]) => {
        if (!nextUrls[assetId] || nextUrls[assetId] !== url) {
          URL.revokeObjectURL(url);
        }
      });

      assetUrlCacheRef.current = nextUrls;
      setAssetUrls(nextUrls);
    };

    void hydrateAssetUrls();

    return () => {
      cancelled = true;
    };
  }, [persistedAssetIds]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      if (lightboxCopyTimerRef.current) {
        window.clearTimeout(lightboxCopyTimerRef.current);
      }
      Object.values(assetActionTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      Object.values(textCopyTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      Object.values(assetUrlCacheRef.current).forEach((url) => URL.revokeObjectURL(url));
      releasePendingRefs(pendingRefs);
    },
    [pendingRefs, releasePendingRefs],
  );

  const showLightboxCopySuccess = useCallback(() => {
    setLightboxCopySucceeded(true);
    if (lightboxCopyTimerRef.current) {
      window.clearTimeout(lightboxCopyTimerRef.current);
    }
    lightboxCopyTimerRef.current = window.setTimeout(() => {
      setLightboxCopySucceeded(false);
      lightboxCopyTimerRef.current = null;
    }, 1500);
  }, []);

  const showAssetActionSuccess = useCallback((assetId: string, type: 'copied' | 'downloaded') => {
    setAssetActionFeedback((previous) => ({ ...previous, [assetId]: type }));
    if (assetActionTimersRef.current[assetId]) {
      window.clearTimeout(assetActionTimersRef.current[assetId]);
    }
    assetActionTimersRef.current[assetId] = window.setTimeout(() => {
      setAssetActionFeedback((previous) => {
        const next = { ...previous };
        delete next[assetId];
        return next;
      });
      delete assetActionTimersRef.current[assetId];
    }, 1500);
  }, []);

  const showTextCopySuccess = useCallback((feedbackKey: string) => {
    setTextCopyFeedback((previous) => ({ ...previous, [feedbackKey]: true }));
    if (textCopyTimersRef.current[feedbackKey]) {
      window.clearTimeout(textCopyTimersRef.current[feedbackKey]);
    }
    textCopyTimersRef.current[feedbackKey] = window.setTimeout(() => {
      setTextCopyFeedback((previous) => {
        const next = { ...previous };
        delete next[feedbackKey];
        return next;
      });
      delete textCopyTimersRef.current[feedbackKey];
    }, 1500);
  }, []);

  const hydratePendingReferencesFromAssets = useCallback(async (refImages?: ImageAssetRef[]) => {
    if (!refImages?.length) {
      return [] as PendingReference[];
    }

    const assets = await Promise.all(refImages.map((image) => getImageAsset(image.assetId)));

    return assets
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
      .map((asset) =>
        createPendingReference({
          blob: asset.blob,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        }),
      );
  }, []);

  const removeRefImage = useCallback(
    (refId: string) => {
      setPendingRefs((previousRefs) => {
        const target = previousRefs.find((ref) => ref.id === refId);

        if (target) {
          releasePendingRefs([target]);
        }

        return previousRefs.filter((ref) => ref.id !== refId);
      });
    },
    [releasePendingRefs],
  );

  const handleCopyStoredAsset = async (image: ImageAssetRef, original = false) => {
    const assetId = original && image.originalAssetId ? image.originalAssetId : image.assetId;
    const asset = await getImageAsset(assetId);

    if (!asset) {
      return;
    }

    await copyBlobToClipboard(asset.blob);
  };

  const handleDownloadStoredAsset = async (image: ImageAssetRef, original = false) => {
    const assetId = original && image.originalAssetId ? image.originalAssetId : image.assetId;
    const asset = await getImageAsset(assetId);

    if (!asset) {
      return;
    }

    downloadBlob(asset.blob, asset.fileName);
  };

  const openStoredAssetLightbox = (image: ImageAssetRef, title: string) => {
    const src = assetUrls[image.assetId];

    if (!src) {
      return;
    }

    setLightboxCopySucceeded(false);
    setLightboxZoom(1);
    setLightboxState({
      src,
      title,
      onCopy: () => handleCopyStoredAsset(image),
      onDownload: () => handleDownloadStoredAsset(image, Boolean(image.originalAssetId)),
    });
  };

  const handleCopyText = async (value: string | undefined, feedbackKey?: string) => {
    if (!value?.trim()) {
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      if (feedbackKey) {
        showTextCopySuccess(feedbackKey);
      }
    } catch (err) {
      console.warn('复制失败', err);
    }
  };

  const activeEditingRef = pendingRefs.find((ref) => ref.id === editingRefId) ?? null;

  const findRelatedUserMessage = useCallback(
    (messageIndex: number) => {
      for (let index = messageIndex - 1; index >= 0; index -= 1) {
        const candidate = sessionMessages[index];
        if (candidate?.type === 'user' && candidate.prompt?.trim()) {
          return candidate;
        }
      }
      return null;
    },
    [sessionMessages],
  );

  const runGeneration = async ({
    promptText,
    refs,
    presetIds,
    models,
    ratio,
    res,
    clearMode,
  }: {
    promptText: string;
    refs: PendingReference[];
    presetIds: string[];
    models: ModelId[];
    ratio: string;
    res: string;
    clearMode: 'state' | 'transient';
  }) => {
    if (!promptText.trim() || models.length === 0 || loading) {
      if (clearMode === 'transient') {
        releasePendingRefs(refs);
      }
      return;
    }

    const currentPrompt = promptText.trim();
    const currentRefs = refs;
    const currentPresetIds = [...presetIds];
    const memoryPrompt = buildSessionMemoryPrompt(sessionMessages, promptPresets, currentPresetIds);
    const renderedPrompt = serializePromptInput({
      currentPrompt,
      memoryPrompt,
    });
    let draftMessages = sessionMessages;
    let shouldClearRefs = true;

    setLoading(true);
    setGenerationStartedAt(Date.now());
    setPrompt('');
    setUsedPresetIds([]);

    try {
      const savedRefImages = await Promise.all(
        currentRefs.map(async (ref) => {
          const originalDimensions = await readImageDimensions(ref.originalPreviewUrl);
          const originalAsset = await saveImageBlob({
            sessionId: session.id,
            blob: ref.sourceBlob,
            fileName: ref.sourceName,
            mimeType: (ref.sourceBlob as File).type || ref.mimeType || 'image/jpeg',
            kind: 'reference-original',
            width: originalDimensions.width,
            height: originalDimensions.height,
          });

          if (!ref.edited) {
            return {
              assetId: originalAsset.id,
              kind: originalAsset.kind,
              mimeType: originalAsset.mimeType,
              fileName: originalAsset.fileName,
              width: originalAsset.width,
              height: originalAsset.height,
            } satisfies ImageAssetRef;
          }

          const editedDimensions = await readImageDimensions(ref.currentPreviewUrl);
          const editedAsset = await saveImageBlob({
            sessionId: session.id,
            blob: ref.currentBlob,
            fileName: withExtension(ref.sourceName.replace(/\.[a-zA-Z0-9]+$/, '-edited'), 'png'),
            mimeType: ref.mimeType,
            kind: 'reference-edited',
            originalAssetId: originalAsset.id,
            width: editedDimensions.width,
            height: editedDimensions.height,
          });

          return {
            assetId: editedAsset.id,
            kind: editedAsset.kind,
            mimeType: editedAsset.mimeType,
            fileName: editedAsset.fileName,
            width: editedAsset.width,
            height: editedAsset.height,
            originalAssetId: originalAsset.id,
          } satisfies ImageAssetRef;
        }),
      );

      const userMessage = {
        id: Date.now(),
        type: 'user',
        prompt: currentPrompt,
        renderedPrompt,
        memoryPrompt,
        refImages: savedRefImages,
        aspectRatio: ratio,
        resolution: res,
        usedPresetIds: currentPresetIds,
      } satisfies ChatSession['messages'][number];

      const loadingMessage = {
        id: Date.now() + 1,
        type: 'loading',
        models,
      } satisfies ChatSession['messages'][number];

      const updatedMessages = [...sessionMessages, userMessage, loadingMessage];
      draftMessages = updatedMessages;
      onSessionUpdate(session.id, {
        messages: updatedMessages,
      });

      const imagePayloads = await Promise.all(
        currentRefs.map(async (ref) => {
          // 在转基底数据前进行压缩，限制尺寸和质量，防止触碰服务端/代理 Body 限制导致 400
          const compressedBlob = await compressImageBlob(ref.currentBlob, 1536, 1536, 0.85);
          return {
            data: await fileToBase64(compressedBlob),
            mime_type: 'image/jpeg', // 压缩过程固定输出 jpeg
            file_name: ref.sourceName,
          };
        }),
      );

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await axios.post<GenerateResponse>(
        '/api/generate',
        {
          prompt: renderedPrompt,
          aspect_ratio: ratio,
          resolution: res,
          models,
          images: imagePayloads,
        },
        {
          signal: abortController.signal,
          timeout: REQUEST_TIMEOUT_MS,
        },
      );

      if (!response.data?.images) {
        throw new Error('生成失败，请稍后重试。');
      }

      const savedGeneratedImages = await Promise.all(
        response.data.images.map(async (image, index) => {
          const mimeType = image.mime_type ?? 'image/jpeg';
          const blob = base64ToBlob(image.data, mimeType);
          const asset = await saveImageBlob({
            sessionId: session.id,
            blob,
            fileName: `nananobanana_${image.model}_${Date.now()}_${index + 1}.${mimeType.split('/')[1] ?? 'jpg'}`,
            mimeType,
            kind: 'generated',
            model: image.model,
          });

          return {
            assetId: asset.id,
            kind: asset.kind,
            mimeType: asset.mimeType,
            fileName: asset.fileName,
            model: image.model,
            costUsd: image.cost_usd,
            remainingBalanceUsd: image.remaining_balance_usd,
          } satisfies ImageAssetRef;
        }),
      );

      const botMessage = {
        id: Date.now() + 2,
        type: 'bot',
        images: savedGeneratedImages,
        aspectRatio: ratio,
        resolution: res,
        elapsedSeconds: response.data.elapsed_seconds,
      } satisfies ChatSession['messages'][number];

      onSessionUpdate(session.id, {
        messages: updatedMessages.map((message) => (message.type === 'loading' ? botMessage : message)),
        remainingBalanceUsd: response.data.current_balance_usd ?? currentBalanceUsd,
      });
    } catch (error) {
      const cancelled = axios.isAxiosError(error) && error.code === 'ERR_CANCELED';
      const detail =
        axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object'
          ? (error.response.data as { detail?: string }).detail
          : undefined;
      const timeoutMessage =
        axios.isAxiosError(error) && error.code === 'ECONNABORTED' ? '生成超时，请稍后重试。' : undefined;

      if (cancelled) {
        shouldClearRefs = false;
        setPrompt(currentPrompt);
        setUsedPresetIds(currentPresetIds);
      }

      const errorMessage = {
        id: Date.now() + 2,
        type: 'error',
        error:
          (cancelled ? '已中断本次生成。' : undefined) ??
          detail ??
          timeoutMessage ??
          (error instanceof Error ? error.message : '生成任务执行失败，请稍后重试或尝试简化提示词内容'),
      } satisfies ChatSession['messages'][number];

      onSessionUpdate(session.id, {
        messages: draftMessages.some((message) => message.type === 'loading')
          ? draftMessages.map((message) => (message.type === 'loading' ? errorMessage : message))
          : [...draftMessages, errorMessage],
      });
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setGenerationStartedAt(null);
      if (shouldClearRefs) {
        if (clearMode === 'state') {
          clearPendingRefs();
        } else {
          releasePendingRefs(currentRefs);
        }
      }
    }
  };

  const handleGenerate = async () => {
    await runGeneration({
      promptText: prompt,
      refs: [...pendingRefs],
      presetIds: [...usedPresetIds],
      models: selectedModels,
      ratio: aspectRatio,
      res: resolution,
      clearMode: 'state',
    });
  };

  const handleRedoGeneratedImage = async (messageIndex: number, image: ImageAssetRef) => {
    if (loading) {
      return;
    }

    const requestMessage = findRelatedUserMessage(messageIndex);
    if (!requestMessage?.prompt?.trim()) {
      return;
    }

    const refs = await hydratePendingReferencesFromAssets(requestMessage.refImages);
    await runGeneration({
      promptText: requestMessage.prompt,
      refs,
      presetIds: requestMessage.usedPresetIds ?? [],
      models: image.model ? [image.model] : selectedModels,
      ratio: requestMessage.aspectRatio ?? aspectRatio,
      res: requestMessage.resolution ?? resolution,
      clearMode: 'transient',
    });
  };

  const handleCancelGenerate = () => {
    abortControllerRef.current?.abort();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleGenerate();
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles: IncomingReference[] = [];

    Array.from(event.clipboardData.items).forEach((item, index) => {
      if (!item.type.startsWith('image/')) {
        return;
      }

      const file = item.getAsFile();

      if (!file) {
        return;
      }

      imageFiles.push({
        blob: file,
        fileName:
          file.name || `clipboard_${Date.now()}_${index + 1}.${file.type.split('/')[1] ?? 'png'}`,
        mimeType: file.type || 'image/png',
      });
    });

    if (imageFiles.length > 0) {
      event.preventDefault();
      await addPendingReferences(imageFiles);
      return;
    }

    const pastedText = event.clipboardData.getData('text/plain').trim();

    if (!pastedText.startsWith('data:image/')) {
      return;
    }

    event.preventDefault();
    const response = await fetch(pastedText);
    const blob = await response.blob();
    await addPendingReferences([
      {
        blob,
        fileName: `clipboard_${Date.now()}.${blob.type.split('/')[1] ?? 'png'}`,
        mimeType: blob.type || 'image/png',
      },
    ]);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);

    const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME);

    if (assetId) {
      await handleAssetDrop([assetId]);
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      await handleFilesUpload(event.dataTransfer.files);
    }
  };

  return (
    <div className="canvas">
      <div className="chat-area">
        <div className="chat-container">
          {sessionMessages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">
                <ImageIcon size={24} />
              </div>
              <div className="empty-title">描述你想创作的画面</div>
              <div className="empty-sub">支持文生图 · 图生图 · 会话记忆 · 图片预编辑</div>
            </div>
          )}

          {sessionMessages.map((message, messageIndex) => (
            <div key={message.id}>
              {message.type === 'user' && (
                <div className="chat-msg chat-msg-user">
                  {message.refImages && message.refImages.length > 0 && (
                    <div className="chat-ref-grid">
                      {message.refImages.map((image, index) => {
                        const src = assetUrls[image.assetId];

                        if (!src) {
                          return null;
                        }

                        return (
                          <div key={`${image.assetId}-${index}`} className="chat-ref-card">
                            <img
                              src={src}
                              className="chat-ref-thumb"
                              draggable
                              onClick={() => openStoredAssetLightbox(image, image.fileName)}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'copy';
                                event.dataTransfer.setData(ASSET_DRAG_MIME, image.assetId);
                                event.dataTransfer.setData('text/plain', image.fileName);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="chat-bubble-shell">
                    <div className="chat-bubble-user">{message.prompt}</div>
                    <button
                      type="button"
                      className={`chat-copy-btn ${textCopyFeedback[`user-${message.id}`] ? 'success' : ''}`}
                      aria-label="复制消息"
                      onClick={() => void handleCopyText(message.prompt, `user-${message.id}`)}
                    >
                      {textCopyFeedback[`user-${message.id}`] ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {message.type === 'loading' && (
                <div className="chat-msg chat-msg-bot">
                  <div className="chat-bubble-bot">
                    <div className="skeleton-row">
                      {(message.models ?? selectedModels).map((model) => (
                        <div
                          key={model}
                          className="skeleton"
                          style={{ aspectRatio: toCssRatio(message.aspectRatio ?? aspectRatio), minHeight: 180 }}
                        >
                          <RefreshCw size={18} className="spin" />
                          <span>{MODEL_LABELS[model]} 正在运行 {elapsedSeconds}s...</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {message.type === 'bot' && (
                <div className="chat-msg chat-msg-bot">
                  <div className="chat-bubble-bot">
                    <div className="chat-image-grid">
                      {message.images?.map((image, index) => {
                        const src = assetUrls[image.assetId];

                        if (!src) {
                          return null;
                        }

                        const feedback = assetActionFeedback[image.assetId];

                        return (
                          <div key={`${image.assetId}-${index}`} className="chat-image-card">
                            <div
                              className="chat-image-frame"
                              draggable
                              onClick={() => openStoredAssetLightbox(image, image.fileName)}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'copy';
                                event.dataTransfer.setData(ASSET_DRAG_MIME, image.assetId);
                                event.dataTransfer.setData('text/plain', image.fileName);
                              }}
                            >
                              <img src={src} alt="" />
                            </div>
                            <div className="chat-image-meta">
                              <div className="chat-image-label">
                                <span
                                  className="chat-image-dot"
                                  style={{
                                    background:
                                      MODEL_COLORS[image.model ?? 'gemini-3.1-flash-image-preview'],
                                  }}
                                />
                                {image.model ? MODEL_LABELS[image.model] : '生成结果'}
                                <span className="chat-image-spec">
                                  {RATIO_LABEL[message.aspectRatio ?? 'auto']} ·{' '}
                                  {RES_LABEL[message.resolution ?? '1k']}
                                  {message.elapsedSeconds !== undefined && (
                                    <> · 用时 {message.elapsedSeconds}s</>
                                  )}
                                </span>
                              </div>
                              <div className="chat-image-actions">
                                <button
                                  type="button"
                                  className="chat-image-action-btn"
                                  aria-label="重生成"
                                  title="重生成"
                                  onClick={() => void handleRedoGeneratedImage(messageIndex, image)}
                                >
                                  <RefreshCw size={14} />
                                </button>
                                <button
                                  type="button"
                                  className={`chat-image-action-btn ${feedback === 'copied' ? 'success' : ''}`}
                                  aria-label="复制原图"
                                  title={feedback === 'copied' ? '复制成功' : '复制原图'}
                                  onClick={async () => {
                                    await handleCopyStoredAsset(image, Boolean(image.originalAssetId));
                                    showAssetActionSuccess(image.assetId, 'copied');
                                  }}
                                >
                                  {feedback === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                                <button
                                  type="button"
                                  className={`chat-image-action-btn ${feedback === 'downloaded' ? 'success' : ''}`}
                                  aria-label="下载原图"
                                  title={feedback === 'downloaded' ? '已开始下载' : '下载原图'}
                                  onClick={async () => {
                                    await handleDownloadStoredAsset(image, Boolean(image.originalAssetId));
                                    showAssetActionSuccess(image.assetId, 'downloaded');
                                  }}
                                >
                                  {feedback === 'downloaded' ? <Check size={14} /> : <Download size={14} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {message.type === 'error' && (
                <div className="chat-msg chat-msg-bot">
                  <div className="error-banner-shell">
                    <div className="error-banner">{message.error}</div>
                    <button
                      type="button"
                      className={`chat-copy-btn ${textCopyFeedback[`error-${message.id}`] ? 'success' : ''}`}
                      aria-label="复制错误消息"
                      onClick={() => void handleCopyText(message.error, `error-${message.id}`)}
                    >
                      {textCopyFeedback[`error-${message.id}`] ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="prompt-bar">
        <div className="prompt-outer">
          <div className="composer-main">
            {pendingRefs.length > 0 && (
              <div className="ref-preview-row">
                {pendingRefs.map((ref) => (
                  <div key={ref.id} className="ref-preview-item">
                    <img
                      src={ref.currentPreviewUrl}
                      className="ref-preview-img"
                      onClick={() =>
                        setLightboxState({
                          src: ref.currentPreviewUrl,
                          title: ref.sourceName,
                          onCopy: () => copyBlobToClipboard(ref.currentBlob),
                          onDownload: () => Promise.resolve(downloadBlob(ref.sourceBlob, ref.sourceName)),
                        })
                      }
                    />
                    <div className="ref-preview-actions">
                      <button
                        type="button"
                        className="ref-preview-btn"
                        onClick={() => setEditingRefId(ref.id)}
                        disabled={loading}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="ref-preview-btn"
                        onClick={() => removeRefImage(ref.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`prompt-wrap ${isDragActive ? 'drag-active' : ''}`}
              onDragOver={(event) => {
                if (
                  event.dataTransfer.files.length > 0 ||
                  event.dataTransfer.types.includes(ASSET_DRAG_MIME)
                ) {
                  event.preventDefault();
                  setIsDragActive(true);
                }
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }

                setIsDragActive(false);
              }}
              onDrop={(event) => {
                void handleDrop(event);
              }}
            >
              <textarea
                className="prompt-textarea"
                placeholder={pendingRefs.length > 0 ? '描述你希望如何处理参考图...' : '输入描述词...'}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onPaste={(event) => {
                  void handlePaste(event);
                }}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={3}
              />
              <div className="prompt-footer">
                <div className="prompt-footer-left">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => void handleFilesUpload(event.target.files)}
                  />
                  <button
                    type="button"
                    className={`btn-upload ${pendingRefs.length > 0 ? 'active' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    <Upload size={13} />
                    上传参考图
                  </button>
                  <div className="prompt-balance">
                    当前余额 ${currentBalanceUsd.toFixed(2)} USD
                  </div>
                </div>
                {loading ? (
                  <button type="button" className="btn-generate danger" onClick={handleCancelGenerate}>
                    <Ban size={14} />
                    中断 {elapsedSeconds > 0 ? `${elapsedSeconds}s` : ''}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-generate"
                    onClick={() => void handleGenerate()}
                    disabled={!prompt.trim()}
                  >
                    <Sparkles size={14} />
                    生成
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {lightboxState && (
        <div className="lightbox" onClick={() => setLightboxState(null)}>
          <div className="lightbox-stage" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-toolbar">
              <div className="lightbox-title">{lightboxState.title}</div>
              <div className="lightbox-actions">
                {lightboxState.onCopy && (
                  <button
                    type="button"
                    className={`lightbox-action-btn icon-only ${lightboxCopySucceeded ? 'success' : ''}`}
                    aria-label="复制原图"
                    title={lightboxCopySucceeded ? '复制成功' : '复制原图'}
                    onClick={async () => {
                      await lightboxState.onCopy?.();
                      showLightboxCopySuccess();
                    }}
                  >
                    {lightboxCopySucceeded ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                )}
                {lightboxState.onDownload && (
                  <button
                    type="button"
                    className="lightbox-action-btn"
                    onClick={() => void lightboxState.onDownload?.()}
                  >
                    <Download size={16} />
                    下载原图
                  </button>
                )}
                <button
                  type="button"
                  className="lightbox-close"
                  onClick={() => setLightboxState(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div
              className={`lightbox-image-shell ${lightboxZoom > 1 ? 'zoomed' : ''}`}
              ref={lightboxImageShellRef}
              onWheel={(event) => {
                event.preventDefault();
                setLightboxZoom((previousZoom) => {
                  const delta = event.deltaY < 0 ? 0.16 : -0.16;
                  return Math.min(4, Math.max(1, Number((previousZoom + delta).toFixed(2))));
                });
              }}
              onMouseDown={(event) => {
                if (lightboxZoom <= 1 || !lightboxImageShellRef.current) {
                  return;
                }

                lightboxDragStateRef.current = {
                  active: true,
                  startX: event.clientX,
                  startY: event.clientY,
                  scrollLeft: lightboxImageShellRef.current.scrollLeft,
                  scrollTop: lightboxImageShellRef.current.scrollTop,
                };
              }}
              onMouseMove={(event) => {
                if (!lightboxDragStateRef.current.active || !lightboxImageShellRef.current) {
                  return;
                }

                const deltaX = event.clientX - lightboxDragStateRef.current.startX;
                const deltaY = event.clientY - lightboxDragStateRef.current.startY;
                lightboxImageShellRef.current.scrollLeft = lightboxDragStateRef.current.scrollLeft - deltaX;
                lightboxImageShellRef.current.scrollTop = lightboxDragStateRef.current.scrollTop - deltaY;
              }}
              onMouseUp={() => {
                lightboxDragStateRef.current.active = false;
              }}
              onMouseLeave={() => {
                lightboxDragStateRef.current.active = false;
              }}
              onDragStart={(event) => event.preventDefault()}
            >
              <img
                src={lightboxState.src}
                alt=""
                style={{
                  transform: `scale(${lightboxZoom})`,
                  transformOrigin: lightboxZoom > 1 ? 'top left' : 'center center',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {activeEditingRef && (
        <ImageEditorModal
          imageUrl={activeEditingRef.currentPreviewUrl}
          onClose={() => setEditingRefId(null)}
          onSave={(blob) => {
            const nextPreviewUrl = URL.createObjectURL(blob);
            setPendingRefs((previousRefs) =>
              previousRefs.map((ref) => {
                if (ref.id !== activeEditingRef.id) {
                  return ref;
                }

                if (ref.currentPreviewUrl !== ref.originalPreviewUrl) {
                  URL.revokeObjectURL(ref.currentPreviewUrl);
                }

                return {
                  ...ref,
                  currentBlob: blob,
                  currentPreviewUrl: nextPreviewUrl,
                  mimeType: 'image/png',
                  edited: true,
                };
              }),
            );
            setEditingRefId(null);
          }}
        />
      )}
    </div>
  );
};
