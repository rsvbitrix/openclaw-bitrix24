import { AccountManager, type RawChannelConfig } from '../../../src/bitrix24/accounts.js';
import { registerBot, unregisterBot } from '../../../src/bitrix24/bot.js';
import { sendMessage } from '../../../src/bitrix24/send.js';
import { downloadFile } from '../../../src/bitrix24/files.js';
import type { IncomingMessage, MediaAttachment } from '../../../src/bitrix24/types.js';
import { getBitrix24Runtime } from './runtime.js';

/**
 * Bitrix24 Channel Plugin — implements the OpenClaw ChannelPlugin interface.
 *
 * Provides the same UX as Telegram and Slack channels:
 *   - One-command setup via CLI
 *   - Multi-account support
 *   - Bidirectional text + file messaging
 *   - Typing indicators
 */
export class Bitrix24Channel {
  private accountManager = new AccountManager();
  private messageCallback: ((accountId: string, msg: IncomingMessage) => void) | null = null;

  /**
   * Initialize from OpenClaw config.
   */
  configure(rawConfig: RawChannelConfig): void {
    this.accountManager.loadFromConfig(rawConfig);
  }

  // ── Account management ───────────────────────────────────────────────────

  listEnabledAccounts(): Array<{ id: string; domain: string }> {
    return this.accountManager.listEnabledAccounts().map((a) => ({
      id: a.id,
      domain: a.domain,
    }));
  }

  listAccountIds(): string[] {
    return this.accountManager.listAccountIds();
  }

  resolveDefaultAccountId(): string {
    return this.accountManager.resolveDefaultAccountId();
  }

  resolveAccount(id: string) {
    return this.accountManager.getAccount(id);
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  /**
   * Send a message from the agent to a Bitrix24 dialog.
   */
  async sendTextMessage(
    accountId: string,
    dialogId: string,
    text: string,
    media?: MediaAttachment[],
  ): Promise<void> {
    const account = this.accountManager.getAccount(accountId);
    if (!account || !account.botId) {
      throw new Error(`Account "${accountId}" not configured or bot not registered`);
    }

    const client = this.accountManager.getClient(accountId);
    await sendMessage(client, {
      botId: account.botId,
      dialogId,
      text,
      media,
    }, {
      textChunkLimit: account.textChunkLimit,
    });
  }

  /**
   * Register callback for incoming messages.
   */
  onMessage(callback: (accountId: string, msg: IncomingMessage) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Called by webhook server when a message arrives.
   */
  handleIncomingMessage(accountId: string, msg: IncomingMessage): void {
    this.messageCallback?.(accountId, msg);
  }

  /**
   * Download a file attachment from an incoming message.
   */
  async downloadAttachment(accountId: string, fileId: string): Promise<MediaAttachment> {
    const client = this.accountManager.getClient(accountId);
    return downloadFile(client, fileId);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start an account: register the bot and prepare for messaging.
   */
  async startupAccount(accountId: string): Promise<void> {
    const runtime = getBitrix24Runtime();
    const account = this.accountManager.getAccount(accountId);
    if (!account) throw new Error(`Account "${accountId}" not found`);

    const client = this.accountManager.getClient(accountId);

    // Check if bot is already registered
    if (account.botId) {
      runtime.logger.info(`Bitrix24 bot already registered for "${accountId}" (ID: ${account.botId})`);
      return;
    }

    // Register bot
    runtime.logger.info(`Registering Bitrix24 bot for "${accountId}" on ${account.domain}...`);
    const { botId, botCode } = await registerBot(
      client,
      accountId,
      runtime.webhookBaseUrl,
      account.bot,
    );

    this.accountManager.setBotInfo(accountId, botId, botCode);
    runtime.logger.info(`Bitrix24 bot registered: ${botCode} (ID: ${botId})`);
  }

  /**
   * Stop an account: unregister the bot.
   */
  async logoutAccount(accountId: string): Promise<void> {
    const runtime = getBitrix24Runtime();
    const account = this.accountManager.getAccount(accountId);
    if (!account?.botId) return;

    try {
      const client = this.accountManager.getClient(accountId);
      await unregisterBot(client, account.botId);
      runtime.logger.info(`Bitrix24 bot unregistered for "${accountId}"`);
    } catch (err) {
      runtime.logger.warn(`Failed to unregister bot for "${accountId}": ${err}`);
    }
  }

  /**
   * Check account health.
   */
  async probeAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    return this.accountManager.probeAccount(accountId);
  }

  // ── Directory ────────────────────────────────────────────────────────────

  /**
   * Get application token for webhook verification.
   */
  getApplicationToken(accountId: string): string | undefined {
    // Application tokens are stored after ONAPPINSTALL;
    // for webhook-based auth they're not used
    return undefined;
  }

  /**
   * Cleanup.
   */
  destroy(): void {
    this.accountManager.destroy();
  }
}
