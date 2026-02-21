import type {
  Bitrix24MessageEvent,
  Bitrix24WelcomeEvent,
  Bitrix24BotDeleteEvent,
  IncomingMessage,
} from './types.js';
import { bbCodeToMarkdown } from './format.js';

/**
 * Parse a raw ONIMBOTMESSAGEADD event body into an IncomingMessage.
 * Returns null if the message should be ignored (e.g. from a bot).
 */
export function parseMessageEvent(body: Bitrix24MessageEvent): IncomingMessage | null {
  const { data, auth } = body;

  // Ignore messages from bots to prevent loops
  if (data.USER.IS_BOT === 'Y') {
    return null;
  }

  const bot = data.BOT[0];
  if (!bot) return null;

  const files = (data.PARAMS.FILES ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
  }));

  return {
    messageId: data.PARAMS.MESSAGE_ID,
    dialogId: data.PARAMS.DIALOG_ID,
    chatId: data.PARAMS.TO_CHAT_ID,
    text: bbCodeToMarkdown(data.PARAMS.MESSAGE),
    fromUserId: data.PARAMS.FROM_USER_ID,
    fromUserName: data.USER.FIRST_NAME || data.USER.NAME,
    fromUserLastName: data.USER.LAST_NAME,
    isBot: false,
    chatType: data.PARAMS.CHAT_TYPE,
    files,
    domain: auth?.domain ?? '',
    applicationToken: auth?.application_token,
    botId: bot.BOT_ID,
    botCode: bot.BOT_CODE,
  };
}

/**
 * Parse a welcome event (bot added to chat).
 */
export function parseWelcomeEvent(body: Bitrix24WelcomeEvent): {
  dialogId: string;
  chatType: string;
  userId: number;
  botId: number;
  botCode: string;
  domain: string;
} | null {
  const bot = body.data.BOT[0];
  if (!bot) return null;

  return {
    dialogId: body.data.PARAMS.DIALOG_ID,
    chatType: body.data.PARAMS.CHAT_TYPE,
    userId: body.data.PARAMS.USER_ID,
    botId: bot.BOT_ID,
    botCode: bot.BOT_CODE,
    domain: body.auth?.domain ?? '',
  };
}

/**
 * Parse a bot delete event.
 */
export function parseBotDeleteEvent(body: Bitrix24BotDeleteEvent): {
  botId: number;
  botCode: string;
  domain: string;
} | null {
  const bot = body.data.BOT[0];
  if (!bot) return null;

  return {
    botId: bot.BOT_ID,
    botCode: bot.BOT_CODE,
    domain: body.auth?.domain ?? '',
  };
}

/**
 * Verify the application token from an incoming event.
 */
export function verifyApplicationToken(
  event: { auth?: { application_token?: string } },
  expectedToken: string | undefined,
): boolean {
  // If no expected token stored, skip verification
  if (!expectedToken) return true;
  return event.auth?.application_token === expectedToken;
}
