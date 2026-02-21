import type { Bitrix24Client } from './client.js';
import type { DiskFile, MediaAttachment } from './types.js';

// Cache storage ID per domain to avoid repeated lookups
const storageCache = new Map<string, number>();

/**
 * Send a file to a Bitrix24 chat.
 *
 * Two-step process (requires scopes: disk + im):
 *   1. disk.storage.uploadfile — upload to Bitrix24 Disk
 *   2. im.disk.file.commit — publish the file into the chat
 */
export async function sendFile(
  client: Bitrix24Client,
  params: {
    chatId: number;
    fileName: string;
    fileBuffer: Buffer;
    mimeType: string;
    message?: string;
  },
): Promise<void> {
  // 1. Get storage ID
  const storageId = await resolveStorageId(client);

  // 2. Upload to Disk
  const diskFile = await client.uploadFile(storageId, params.fileName, params.fileBuffer);

  // 3. Commit to chat
  const commitParams: Record<string, any> = {
    CHAT_ID: params.chatId,
    UPLOAD_ID: diskFile.ID,
  };
  if (params.message) {
    commitParams.MESSAGE = params.message;
  }

  await client.callMethod('im.disk.file.commit', commitParams);
}

/**
 * Download a file from a Bitrix24 event's file attachment.
 *
 * The download URL typically requires auth — the client handles this.
 */
export async function downloadFile(
  client: Bitrix24Client,
  fileId: string,
): Promise<MediaAttachment> {
  // Get file info from Disk
  const fileInfo = await client.callMethod<{
    ID: string;
    NAME: string;
    SIZE: number;
    DOWNLOAD_URL: string;
    GLOBAL_CONTENT_VERSION: string;
  }>('disk.file.get', { id: fileId });

  const buffer = await client.downloadFile(fileInfo.DOWNLOAD_URL);
  const mimeType = guessMimeType(fileInfo.NAME);

  return {
    buffer,
    fileName: fileInfo.NAME,
    mimeType,
  };
}

/**
 * Resolve the storage ID for file uploads.
 * Uses the app's own storage or falls back to the common storage.
 */
async function resolveStorageId(client: Bitrix24Client): Promise<number> {
  const cached = storageCache.get(client.domain);
  if (cached) return cached;

  // Try to get the app's own storage first
  const storages = await client.callMethod<Array<{
    ID: string;
    NAME: string;
    ENTITY_TYPE: string;
  }>>('disk.storage.getlist', {
    filter: { ENTITY_TYPE: 'common' },
  });

  if (storages && storages.length > 0) {
    const id = parseInt(storages[0].ID, 10);
    storageCache.set(client.domain, id);
    return id;
  }

  // Fallback: get any available storage
  const allStorages = await client.callMethod<Array<{ ID: string }>>('disk.storage.getlist');
  if (allStorages && allStorages.length > 0) {
    const id = parseInt(allStorages[0].ID, 10);
    storageCache.set(client.domain, id);
    return id;
  }

  throw new Error('No Disk storage found. Ensure the "disk" scope is enabled.');
}

/**
 * Determine media type category from mime type.
 */
export function mediaKind(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Guess MIME type from file extension.
 */
function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    zip: 'application/zip',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
  };
  return mimeMap[ext ?? ''] ?? 'application/octet-stream';
}
