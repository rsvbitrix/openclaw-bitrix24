/**
 * DIALOG_ID parsing and formatting.
 *
 * Bitrix24 uses two formats:
 *   - Numeric string "123" — direct message to user ID 123
 *   - "chat456" — group chat with chat ID 456
 */

export interface ParsedTarget {
  type: 'user' | 'chat';
  id: number;
  dialogId: string;
}

/**
 * Parse a DIALOG_ID string into a structured target.
 */
export function parseDialogId(dialogId: string): ParsedTarget {
  const chatMatch = dialogId.match(/^chat(\d+)$/i);
  if (chatMatch) {
    return {
      type: 'chat',
      id: parseInt(chatMatch[1], 10),
      dialogId,
    };
  }

  const numericId = parseInt(dialogId, 10);
  if (!isNaN(numericId) && numericId > 0) {
    return {
      type: 'user',
      id: numericId,
      dialogId: String(numericId),
    };
  }

  throw new Error(`Invalid DIALOG_ID: "${dialogId}"`);
}

/**
 * Create a DIALOG_ID for a direct message to a user.
 */
export function userDialogId(userId: number): string {
  return String(userId);
}

/**
 * Create a DIALOG_ID for a group chat.
 */
export function chatDialogId(chatId: number): string {
  return `chat${chatId}`;
}

/**
 * Extract the numeric chat ID from DIALOG_ID (for use with im.disk.file.commit).
 * For user DMs, the chatId comes from the event's TO_CHAT_ID field, not from DIALOG_ID.
 */
export function extractChatId(dialogId: string, toChatId?: number): number | null {
  const parsed = parseDialogId(dialogId);
  if (parsed.type === 'chat') return parsed.id;
  return toChatId ?? null;
}
