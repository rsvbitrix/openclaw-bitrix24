import type { AccountConfig, BitrixAuth, BotConfig } from './types.js';
import { Bitrix24Client, createClientFromWebhook } from './client.js';
import { resolveAuth, extractDomain } from './token.js';

/**
 * Manage multiple Bitrix24 portal accounts.
 */
export class AccountManager {
  private accounts = new Map<string, AccountConfig>();
  private clients = new Map<string, Bitrix24Client>();
  private tokenRefreshCallback?: (accountId: string, tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }) => void | Promise<void>;

  /**
   * Load accounts from OpenClaw channel config.
   */
  loadFromConfig(config: RawChannelConfig): void {
    const globalWebhookUrl = config.webhookUrl;

    for (const raw of config.accounts ?? []) {
      const id = raw.id ?? 'default';
      const isDefault = id === 'default';

      const auth = resolveAuth({
        accountId: id,
        accountWebhookUrl: raw.webhookUrl,
        accountAccessToken: raw.accessToken,
        accountRefreshToken: raw.refreshToken,
        accountClientId: raw.clientId ?? config.clientId,
        accountClientSecret: raw.clientSecret ?? config.clientSecret,
        accountExpiresAt: raw.expiresAt,
        globalWebhookUrl,
        isDefault,
      });

      if (!auth) continue;

      const domain = raw.domain ?? extractDomain(auth);

      const account: AccountConfig = {
        id,
        domain,
        auth,
        enabled: raw.enabled !== false,
        textChunkLimit: raw.textChunkLimit ?? 4000,
        bot: {
          name: raw.bot?.name ?? 'OpenClaw Agent',
          lastName: raw.bot?.lastName,
          color: raw.bot?.color ?? 'PURPLE',
          workPosition: raw.bot?.workPosition ?? 'AI Assistant',
          avatar: raw.bot?.avatar,
        },
        botId: raw.botId,
        botCode: raw.botCode,
        dmPolicy: raw.dmPolicy ?? 'open',
      };

      this.accounts.set(id, account);
    }

    // If no accounts configured but global/env auth available, create default
    if (this.accounts.size === 0) {
      const auth = resolveAuth({
        accountId: 'default',
        globalWebhookUrl,
        isDefault: true,
      });
      if (auth) {
        this.accounts.set('default', {
          id: 'default',
          domain: extractDomain(auth),
          auth,
          enabled: true,
          textChunkLimit: 4000,
          bot: { name: 'OpenClaw Agent', color: 'PURPLE', workPosition: 'AI Assistant' },
          dmPolicy: 'open',
        });
      }
    }
  }

  listAccounts(): AccountConfig[] {
    return Array.from(this.accounts.values());
  }

  listEnabledAccounts(): AccountConfig[] {
    return this.listAccounts().filter((a) => a.enabled);
  }

  listAccountIds(): string[] {
    return Array.from(this.accounts.keys());
  }

  getAccount(id: string): AccountConfig | undefined {
    return this.accounts.get(id);
  }

  getDefaultAccount(): AccountConfig | undefined {
    return this.accounts.get('default') ?? this.accounts.values().next().value;
  }

  resolveDefaultAccountId(): string {
    return this.getDefaultAccount()?.id ?? 'default';
  }

  /**
   * Set callback for persisting refreshed OAuth tokens.
   */
  setTokenRefreshCallback(cb: (accountId: string, tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }) => void | Promise<void>): void {
    this.tokenRefreshCallback = cb;
  }

  /**
   * Get or create a Bitrix24Client for an account.
   */
  getClient(accountId: string): Bitrix24Client {
    let client = this.clients.get(accountId);
    if (client) return client;

    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Account "${accountId}" not found`);

    client = new Bitrix24Client({
      domain: account.domain,
      auth: account.auth,
      onTokenRefresh: this.tokenRefreshCallback
        ? (tokens) => this.tokenRefreshCallback!(accountId, tokens)
        : undefined,
    });
    this.clients.set(accountId, client);
    return client;
  }

  /**
   * Update stored bot info after registration.
   */
  setBotInfo(accountId: string, botId: number, botCode: string): void {
    const account = this.accounts.get(accountId);
    if (account) {
      account.botId = botId;
      account.botCode = botCode;
    }
  }

  /**
   * Find account by bot code (for routing incoming events).
   */
  findByBotCode(botCode: string): AccountConfig | undefined {
    for (const account of this.accounts.values()) {
      if (account.botCode === botCode) return account;
    }
    return undefined;
  }

  /**
   * Probe an account to verify connectivity.
   */
  async probeAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = this.getClient(accountId);
      return await client.probe();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Destroy all clients.
   */
  destroy(): void {
    for (const client of this.clients.values()) {
      client.destroy();
    }
    this.clients.clear();
  }
}

// ── Config types from OpenClaw ───────────────────────────────────────────────

export interface RawChannelConfig {
  webhookUrl?: string;
  clientId?: string;
  clientSecret?: string;
  accounts?: Array<{
    id?: string;
    domain?: string;
    webhookUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId?: string;
    clientSecret?: string;
    enabled?: boolean;
    textChunkLimit?: number;
    bot?: Partial<BotConfig>;
    botId?: number;
    botCode?: string;
    dmPolicy?: 'open' | 'paired';
  }>;
}
