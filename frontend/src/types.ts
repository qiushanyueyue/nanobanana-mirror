export type ModelId = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';

export type ImageAssetKind =
  | 'reference-original'
  | 'reference-edited'
  | 'generated'
  | 'legacy-inline';

export type ImageAssetRef = {
  assetId: string;
  kind: ImageAssetKind;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
  model?: ModelId;
  originalAssetId?: string;
  costUsd?: number;
  remainingBalanceUsd?: number;
};

export type PromptPreset = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
};

export type ImageResult = {
  model: ModelId;
  data: string;
  mime_type?: string;
  cost_usd?: number;
  remaining_balance_usd?: number;
  elapsed_seconds?: number;
};

export type GenerateResponse = {
  images: ImageResult[];
  current_balance_usd?: number;
  elapsed_seconds?: number;
};

export type BalanceResponse = {
  current_balance_usd: number;
};

export type ChatMessage = {
  id: number;
  type: 'user' | 'bot' | 'loading' | 'error';
  models?: ModelId[];
  prompt?: string;
  renderedPrompt?: string;
  memoryPrompt?: string;
  refImages?: ImageAssetRef[];
  images?: ImageAssetRef[];
  error?: string;
  aspectRatio?: string;
  resolution?: string;
  usedPresetIds?: string[];
  elapsedSeconds?: number;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  promptPresets: PromptPreset[];
  timestamp: number;
  remainingBalanceUsd: number;
};

export type EditorPoint = {
  x: number;
  y: number;
};

export type EditorStroke = {
  kind: 'stroke';
  color: string;
  points: EditorPoint[];
};

export type EditorTextBox = {
  kind: 'text';
  id: string;
  color: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

export type EditorElement = EditorStroke | EditorTextBox;

export type EditorState = {
  elements: EditorElement[];
  redoStack: EditorElement[];
};
