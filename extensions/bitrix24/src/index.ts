import { Bitrix24Channel } from './channel.js';
import { setBitrix24Runtime, type PluginRuntime } from './runtime.js';
import { createWebhookRouter } from '../../../src/bitrix24/webhook-server.js';
import { createClientFromWebhook } from '../../../src/bitrix24/client.js';
import {
  getSetupInstructions,
  getQuickHint,
  formatConnectionSuccess,
  formatConnectionError,
  formatMissingScopes,
  isValidWebhookUrl,
} from './setup-guide.js';

/**
 * OpenClaw Plugin Entry Point.
 *
 * Registers:
 *   - bitrix24 channel (messaging via imbot API)
 *   - bitrix24-webhook service (Express routes for incoming events)
 *   - /b24status command (connection diagnostics)
 *   - /b24setup command (interactive setup guide)
 */
export default function register(api: any): void {
  const channel = new Bitrix24Channel();

  // Initialize runtime for DI
  setBitrix24Runtime({
    logger: api.logger,
    config: api.config,
    webhookBaseUrl: api.config?.gateway?.externalUrl ?? 'http://localhost:18789',
  });

  // Configure channel from user's openclaw config
  const channelConfig = api.config?.channels?.bitrix24 ?? {};
  channel.configure(channelConfig);

  // Wire OAuth token persistence
  channel.setTokenRefreshCallback((accountId, tokens) => {
    api.logger.info(`OAuth tokens refreshed for Bitrix24 account "${accountId}"`);
    api.persistConfig?.(`channels.bitrix24.accounts.${accountId}`, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  });

  // Register the channel
  api.registerChannel({
    plugin: {
      id: 'bitrix24',
      meta: {
        id: 'bitrix24',
        label: 'Bitrix24',
        selectionLabel: 'Bitrix24 Messenger',
        blurb: 'Chat with your OpenClaw agent through Bitrix24 Messenger.',
        aliases: ['b24', 'bitrix'],
      },
      capabilities: { chatTypes: ['direct', 'group'] },
      config: {
        listAccountIds: () => channel.listAccountIds(),
        resolveAccount: (_cfg: any, accountId: string) => channel.resolveAccount(accountId),
      },
      outbound: {
        deliveryMode: 'direct',
        sendText: async ({ accountId, dialogId, text, media }: {
          accountId: string;
          dialogId: string;
          text: string;
          media?: any[];
        }) => {
          await channel.sendTextMessage(
            accountId ?? channel.resolveDefaultAccountId(),
            dialogId,
            text,
            media,
          );
          return { ok: true };
        },
      },
    },
  });

  // Register webhook service for incoming Bitrix24 events
  const webhookRouter = createWebhookRouter({
    onMessage: (accountId, msg) => {
      channel.handleIncomingMessage(accountId, msg);
    },
    onWelcome: (accountId, event) => {
      if (event) {
        api.logger.info(`Bot added to chat in account "${accountId}": ${event.dialogId}`);
      }
    },
    onBotDelete: (accountId, event) => {
      if (event) {
        api.logger.warn(`Bot deleted from account "${accountId}": ${event.botCode}`);
      }
    },
    getApplicationToken: (accountId) => channel.getApplicationToken(accountId),
  });

  api.registerService({
    id: 'bitrix24-webhook',
    router: webhookRouter,
    start: async () => {
      const accounts = channel.listEnabledAccounts();

      if (accounts.length === 0) {
        api.logger.warn(`[bitrix24] ${getQuickHint()}`);
        return;
      }

      // Startup all enabled accounts
      for (const account of accounts) {
        try {
          await channel.startupAccount(account.id);
        } catch (err) {
          api.logger.error(`Failed to start Bitrix24 account "${account.id}":`, err);
        }
      }
      api.logger.info('Bitrix24 webhook service started');
    },
    stop: () => {
      channel.destroy();
      api.logger.info('Bitrix24 webhook service stopped');
    },
  });

  // Register /b24status command
  api.registerCommand({
    name: 'b24status',
    description: 'Show Bitrix24 channel connection status',
    handler: async () => {
      const accounts = channel.listEnabledAccounts();
      if (accounts.length === 0) {
        return { text: 'No Bitrix24 accounts configured. Run /b24setup for instructions.' };
      }

      const lines: string[] = ['**Bitrix24 Accounts:**'];
      for (const acc of accounts) {
        const probe = await channel.probeAccount(acc.id);
        const status = probe.ok ? 'connected' : `error: ${probe.error}`;
        lines.push(`- **${acc.id}** (${acc.domain}): ${status}`);
      }
      return { text: lines.join('\n') };
    },
  });

  // Register /b24setup command — interactive setup guide
  api.registerCommand({
    name: 'b24setup',
    description: 'Step-by-step guide to connect Bitrix24',
    acceptsArgs: true,
    handler: async (ctx: { args?: string }) => {
      const webhookUrl = ctx.args?.trim();

      // No argument — show instructions or current status
      if (!webhookUrl) {
        const accounts = channel.listEnabledAccounts();
        if (accounts.length > 0) {
          const lines = ['Bitrix24 is already configured:'];
          for (const acc of accounts) {
            lines.push(`- **${acc.id}** (${acc.domain})`);
          }
          lines.push('', 'To add another portal, pass a webhook URL:');
          lines.push('`/b24setup https://your-portal.bitrix24.ru/rest/1/secret/`');
          return { text: lines.join('\n') };
        }
        return { text: getSetupInstructions() };
      }

      // Validate URL format
      if (!isValidWebhookUrl(webhookUrl)) {
        return {
          text: [
            'Invalid webhook URL format.',
            '',
            'Expected: `https://your-portal.bitrix24.ru/rest/{userId}/{secret}/`',
            '',
            'Run `/b24setup` without arguments for full instructions.',
          ].join('\n'),
        };
      }

      // Test connection
      const client = createClientFromWebhook(webhookUrl);
      try {
        const result = await client.verifyConnection();

        if (!result.ok && result.missingScopes) {
          return { text: formatMissingScopes(result.missingScopes) };
        }

        if (!result.ok) {
          return { text: formatConnectionError(result.error ?? 'Unknown error') };
        }

        // Save webhook URL to config
        await api.persistConfig?.('channels.bitrix24.webhookUrl', webhookUrl);

        // Reconfigure channel with new webhook
        channel.configure({ ...channelConfig, webhookUrl });

        // Start the account (register bot)
        let botRegistered = false;
        try {
          await channel.startupAccount('default');
          botRegistered = true;
        } catch (err) {
          api.logger.warn('Bot registration deferred — restart gateway to complete:', err);
        }

        return {
          text: formatConnectionSuccess({
            domain: result.domain!,
            scopes: result.scopes!,
            botRegistered,
          }),
        };
      } finally {
        client.destroy();
      }
    },
  });

  api.logger.info('Bitrix24 channel plugin registered');
}
