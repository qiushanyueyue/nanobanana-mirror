import type { ImageAssetKind, ModelId } from '../types';

const DB_NAME = 'nananobanana-mirror';
const DB_VERSION = 1;
const STORE_NAME = 'image-assets';

export type StoredImageAsset = {
  id: string;
  sessionId: string;
  kind: ImageAssetKind;
  fileName: string;
  mimeType: string;
  model?: ModelId;
  originalAssetId?: string;
  width?: number;
  height?: number;
  createdAt: number;
  blob: Blob;
};

const openDatabase = async (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });

        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> => {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };

    callback(store, resolve, reject);
  });
};

export const createAssetId = (): string =>
  `asset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const putImageAsset = async (asset: StoredImageAsset): Promise<StoredImageAsset> =>
  withStore('readwrite', (store, resolve, reject) => {
    const request = store.put(asset);
    request.onsuccess = () => resolve(asset);
    request.onerror = () => reject(request.error);
  });

export const getImageAsset = async (id: string): Promise<StoredImageAsset | undefined> =>
  withStore('readonly', (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as StoredImageAsset | undefined);
    request.onerror = () => reject(request.error);
  });

export const deleteImageAsset = async (id: string): Promise<void> =>
  withStore('readwrite', (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

export const deleteImageAssets = async (ids: string[]): Promise<void> => {
  await Promise.all(ids.map((id) => deleteImageAsset(id)));
};

export const saveImageBlob = async ({
  sessionId,
  blob,
  fileName,
  mimeType,
  kind,
  model,
  originalAssetId,
  width,
  height,
}: Omit<StoredImageAsset, 'id' | 'createdAt'>): Promise<StoredImageAsset> => {
  const asset: StoredImageAsset = {
    id: createAssetId(),
    sessionId,
    blob,
    fileName,
    mimeType,
    kind,
    model,
    originalAssetId,
    width,
    height,
    createdAt: Date.now(),
  };

  return putImageAsset(asset);
};

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const loadObjectUrl = async (assetId: string): Promise<string | null> => {
  const asset = await getImageAsset(assetId);

  if (!asset) {
    return null;
  }

  return URL.createObjectURL(asset.blob);
};

export const readImageDimensions = (source: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = reject;
    image.src = source;
  });
