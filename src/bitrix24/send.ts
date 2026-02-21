import type { Bitrix24Client } from './client.js';
import type { OutgoingMessage, MediaAttachment } from './types.js';
import { markdownToBBCode, chunkText } from './format.js';
import { sendFile } from './files.js';
import { extractChatId } from './targets.js';

const DEFAULT_CHUNK_LIMIT = 4000;

/**
 * Send a message from the bot to a Bitrix24 dialog.
 *
 * Flow:
 *   1. Send typing indicator
 *   2. Convert markdown → BB-code
 *   3. Chunk if > textChunkLimit
 *   4. Send each chunk via imbot.message.add
 *   5. Send media files via disk upload + commit
 */
export async function sendMessage(
  client: Bitrix24Client,
  msg: OutgoingMessage,
  opts?: { textChunkLimit?: number; toChatId?: number },
): Promise<{ messageIds: string[] }> {
  const chunkLimit = opts?.textChunkLimit ?? DEFAULT_CHUNK_LIMIT;
  const messageIds: string[] = [];

  // 1. Typing indicator
  await sendTyping(client, msg.botId, msg.dialogId).catch(() => {
    // Non-critical — ignore errors
  });

  // 2. Convert and chunk text
  const bbText = markdownToBBCode(msg.text);
  const chunks = chunkText(bbText, chunkLimit);

  // 3. Send text chunks
  for (const chunk of chunks) {
    const id = await sendTextMessage(client, {
      botId: msg.botId,
      dialogId: msg.dialogId,
      text: chunk,
      keyboard: chunks.indexOf(chunk) === chunks.length - 1 ? msg.keyboard : undefined,
    });
    messageIds.push(id);
  }

  // 4. Send media files
  if (msg.media && msg.media.length > 0) {
    const chatId = extractChatId(msg.dialogId, opts?.toChatId);
    if (chatId) {
      for (const media of msg.media) {
        await sendFile(client, {
          chatId,
          fileName: media.fileName,
          fileBuffer: media.buffer,
          mimeType: media.mimeType,
        });
      }
    }
  }

  return { messageIds };
}

/**
 * Send typing indicator.
 */
async function sendTyping(
  client: Bitrix24Client,
  botId: number,
  dialogId: string,
): Promise<void> {
  await client.callMethod('imbot.chat.sendTyping', {
    BOT_ID: botId,
    DIALOG_ID: dialogId,
  });
}

/**
 * Send a single text message.
 */
async function sendTextMessage(
  client: Bitrix24Client,
  params: {
    botId: number;
    dialogId: string;
    text: string;
    keyboard?: OutgoingMessage['keyboard'];
  },
): Promise<string> {
  const payload: Record<string, any> = {
    BOT_ID: params.botId,
    DIALOG_ID: params.dialogId,
    MESSAGE: params.text,
  };

  if (params.keyboard) {
    payload.KEYBOARD = params.keyboard.buttons;
  }

  const result = await client.callMethod<number | string>('imbot.message.add', payload);
  return String(result);
}

/**
 * Update an existing bot message.
 */
export async function updateMessage(
  client: Bitrix24Client,
  botId: number,
  messageId: string,
  newText: string,
): Promise<void> {
  const bbText = markdownToBBCode(newText);
  await client.callMethod('imbot.message.update', {
    BOT_ID: botId,
    MESSAGE_ID: messageId,
    MESSAGE: bbText,
  });
}

/**
 * Delete a bot message.
 */
export async function deleteMessage(
  client: Bitrix24Client,
  botId: number,
  messageId: string,
): Promise<void> {
  await client.callMethod('imbot.message.delete', {
    BOT_ID: botId,
    MESSAGE_ID: messageId,
  });
}
