import type { Bitrix24Client } from './client.js';
import type { BotConfig, BotRegistrationResult } from './types.js';

/**
 * Register an OpenClaw chatbot in a Bitrix24 portal.
 */
export async function registerBot(
  client: Bitrix24Client,
  accountId: string,
  webhookBaseUrl: string,
  config: BotConfig,
): Promise<BotRegistrationResult> {
  const code = `openclaw_${accountId}`;
  const base = webhookBaseUrl.replace(/\/$/, '');

  const result = await client.callMethod('imbot.register', {
    CODE: code,
    TYPE: 'B',
    EVENT_MESSAGE_ADD: `${base}/webhook/bitrix24/${accountId}/message`,
    EVENT_WELCOME_MESSAGE: `${base}/webhook/bitrix24/${accountId}/welcome`,
    EVENT_BOT_DELETE: `${base}/webhook/bitrix24/${accountId}/delete`,
    PROPERTIES: {
      NAME: config.name,
      LAST_NAME: config.lastName ?? '',
      COLOR: config.color ?? 'PURPLE',
      WORK_POSITION: config.workPosition ?? 'AI Assistant',
      EMAIL: config.email ?? `openclaw-${accountId}@openclaw.bot`,
      PERSONAL_PHOTO: config.avatar,
    },
  });

  // Bitrix24 returns BOT_ID as a plain number or as { BOT_ID: n }
  const botId = typeof result === 'number' ? result : result?.BOT_ID ?? result;

  return { botId: Number(botId), botCode: code };
}

/**
 * Update bot properties (name, avatar, etc.).
 */
export async function updateBot(
  client: Bitrix24Client,
  botId: number,
  config: Partial<BotConfig>,
): Promise<void> {
  const fields: Record<string, any> = {};
  if (config.name !== undefined) fields.NAME = config.name;
  if (config.lastName !== undefined) fields.LAST_NAME = config.lastName;
  if (config.color !== undefined) fields.COLOR = config.color;
  if (config.workPosition !== undefined) fields.WORK_POSITION = config.workPosition;
  if (config.avatar !== undefined) fields.PERSONAL_PHOTO = config.avatar;

  if (Object.keys(fields).length === 0) return;

  await client.callMethod('imbot.update', {
    BOT_ID: botId,
    FIELDS: fields,
  });
}

/**
 * Unregister (delete) the bot from Bitrix24.
 */
export async function unregisterBot(
  client: Bitrix24Client,
  botId: number,
): Promise<void> {
  await client.callMethod('imbot.unregister', { BOT_ID: botId });
}
