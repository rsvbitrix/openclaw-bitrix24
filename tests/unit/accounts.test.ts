import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccountManager, type RawChannelConfig } from '../../src/bitrix24/accounts.js';

vi.mock('axios', () => {
  const mockPost = vi.fn();
  const mockCreate = vi.fn(() => ({ post: mockPost }));
  return {
    default: { create: mockCreate },
    __mockPost: mockPost,
  };
});

const savedEnv = process.env.BITRIX24_WEBHOOK_URL;

beforeEach(() => {
  delete process.env.BITRIX24_WEBHOOK_URL;
});

afterEach(() => {
  if (savedEnv !== undefined) {
    process.env.BITRIX24_WEBHOOK_URL = savedEnv;
  } else {
    delete process.env.BITRIX24_WEBHOOK_URL;
  }
});

// ── loadFromConfig ───────────────────────────────────────────────────────────

describe('AccountManager.loadFromConfig', () => {
  it('loads accounts from raw config with explicit accounts', () => {
    const manager = new AccountManager();
    const config: RawChannelConfig = {
      accounts: [
        {
          id: 'portal1',
          webhookUrl: 'https://portal1.bitrix24.ru/rest/1/secret1/',
        },
        {
          id: 'portal2',
          webhookUrl: 'https://portal2.bitrix24.ru/rest/2/secret2/',
          enabled: false,
          textChunkLimit: 2000,
          bot: { name: 'CustomBot', color: 'RED' },
          botId: 10,
          botCode: 'custom_bot',
          dmPolicy: 'paired',
        },
      ],
    };

    manager.loadFromConfig(config);

    const accounts = manager.listAccounts();
    expect(accounts).toHaveLength(2);

    const p1 = manager.getAccount('portal1');
    expect(p1).toBeDefined();
    expect(p1!.domain).toBe('portal1.bitrix24.ru');
    expect(p1!.auth).toEqual({ type: 'webhook', webhookUrl: 'https://portal1.bitrix24.ru/rest/1/secret1/' });
    expect(p1!.enabled).toBe(true);
    expect(p1!.textChunkLimit).toBe(4000);
    expect(p1!.bot.name).toBe('OpenClaw Agent');
    expect(p1!.dmPolicy).toBe('open');

    const p2 = manager.getAccount('portal2');
    expect(p2).toBeDefined();
    expect(p2!.enabled).toBe(false);
    expect(p2!.textChunkLimit).toBe(2000);
    expect(p2!.bot.name).toBe('CustomBot');
    expect(p2!.bot.color).toBe('RED');
    expect(p2!.botId).toBe(10);
    expect(p2!.botCode).toBe('custom_bot');
    expect(p2!.dmPolicy).toBe('paired');

    manager.destroy();
  });

  it('creates default account from BITRIX24_WEBHOOK_URL env var', () => {
    process.env.BITRIX24_WEBHOOK_URL = 'https://env.bitrix24.ru/rest/1/envkey/';

    const manager = new AccountManager();
    manager.loadFromConfig({});

    const accounts = manager.listAccounts();
    expect(accounts).toHaveLength(1);

    const def = manager.getAccount('default');
    expect(def).toBeDefined();
    expect(def!.domain).toBe('env.bitrix24.ru');
    expect(def!.auth).toEqual({ type: 'webhook', webhookUrl: 'https://env.bitrix24.ru/rest/1/envkey/' });
    expect(def!.enabled).toBe(true);

    manager.destroy();
  });

  it('creates default account from global webhookUrl', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      webhookUrl: 'https://global.bitrix24.ru/rest/3/globalkey/',
    });

    const accounts = manager.listAccounts();
    expect(accounts).toHaveLength(1);

    const def = manager.getAccount('default');
    expect(def).toBeDefined();
    expect(def!.domain).toBe('global.bitrix24.ru');

    manager.destroy();
  });

  it('assigns id "default" when account id is omitted', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { webhookUrl: 'https://noname.bitrix24.ru/rest/1/key/' },
      ],
    });

    expect(manager.getAccount('default')).toBeDefined();
    manager.destroy();
  });

  it('does not create fallback when explicit accounts exist', () => {
    process.env.BITRIX24_WEBHOOK_URL = 'https://env.bitrix24.ru/rest/1/envkey/';

    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'explicit', webhookUrl: 'https://explicit.bitrix24.ru/rest/1/key/' },
      ],
    });

    // Should only have the explicit account, not a default from env
    expect(manager.listAccounts()).toHaveLength(1);
    expect(manager.getAccount('explicit')).toBeDefined();
    expect(manager.getAccount('default')).toBeUndefined();

    manager.destroy();
  });
});

// ── listEnabledAccounts ──────────────────────────────────────────────────────

describe('AccountManager.listEnabledAccounts', () => {
  it('filters out disabled accounts', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'active1', webhookUrl: 'https://a1.bitrix24.ru/rest/1/k1/' },
        { id: 'disabled1', webhookUrl: 'https://d1.bitrix24.ru/rest/1/k2/', enabled: false },
        { id: 'active2', webhookUrl: 'https://a2.bitrix24.ru/rest/1/k3/' },
        { id: 'disabled2', webhookUrl: 'https://d2.bitrix24.ru/rest/1/k4/', enabled: false },
      ],
    });

    const enabled = manager.listEnabledAccounts();
    expect(enabled).toHaveLength(2);
    expect(enabled.map((a) => a.id)).toEqual(['active1', 'active2']);

    manager.destroy();
  });

  it('returns all accounts when none are disabled', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'a', webhookUrl: 'https://a.bitrix24.ru/rest/1/k/' },
        { id: 'b', webhookUrl: 'https://b.bitrix24.ru/rest/1/k/' },
      ],
    });

    expect(manager.listEnabledAccounts()).toHaveLength(2);
    manager.destroy();
  });
});

// ── getClient ────────────────────────────────────────────────────────────────

describe('AccountManager.getClient', () => {
  it('creates and caches a Bitrix24Client for an account', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'test', webhookUrl: 'https://test.bitrix24.ru/rest/1/key/' },
      ],
    });

    const client1 = manager.getClient('test');
    const client2 = manager.getClient('test');

    expect(client1).toBe(client2); // same instance (cached)
    expect(client1.domain).toBe('test.bitrix24.ru');

    manager.destroy();
  });

  it('throws when account does not exist', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({});

    expect(() => manager.getClient('nonexistent'))
      .toThrow('Account "nonexistent" not found');

    manager.destroy();
  });
});

// ── setBotInfo ───────────────────────────────────────────────────────────────

describe('AccountManager.setBotInfo', () => {
  it('updates account with bot ID and code', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'portal', webhookUrl: 'https://p.bitrix24.ru/rest/1/k/' },
      ],
    });

    expect(manager.getAccount('portal')!.botId).toBeUndefined();
    expect(manager.getAccount('portal')!.botCode).toBeUndefined();

    manager.setBotInfo('portal', 42, 'openclaw_portal');

    const account = manager.getAccount('portal')!;
    expect(account.botId).toBe(42);
    expect(account.botCode).toBe('openclaw_portal');

    manager.destroy();
  });

  it('does nothing when account does not exist', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({});

    // Should not throw
    manager.setBotInfo('missing', 1, 'code');
    manager.destroy();
  });
});

// ── findByBotCode ────────────────────────────────────────────────────────────

describe('AccountManager.findByBotCode', () => {
  it('finds the correct account by bot code', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'a', webhookUrl: 'https://a.bitrix24.ru/rest/1/k/', botCode: 'bot_a' },
        { id: 'b', webhookUrl: 'https://b.bitrix24.ru/rest/1/k/', botCode: 'bot_b' },
        { id: 'c', webhookUrl: 'https://c.bitrix24.ru/rest/1/k/', botCode: 'bot_c' },
      ],
    });

    const found = manager.findByBotCode('bot_b');
    expect(found).toBeDefined();
    expect(found!.id).toBe('b');

    manager.destroy();
  });

  it('returns undefined when bot code is not found', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'a', webhookUrl: 'https://a.bitrix24.ru/rest/1/k/', botCode: 'bot_a' },
      ],
    });

    expect(manager.findByBotCode('unknown')).toBeUndefined();
    manager.destroy();
  });

  it('finds account after setBotInfo', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        { id: 'late', webhookUrl: 'https://late.bitrix24.ru/rest/1/k/' },
      ],
    });

    expect(manager.findByBotCode('late_bot')).toBeUndefined();

    manager.setBotInfo('late', 99, 'late_bot');

    const found = manager.findByBotCode('late_bot');
    expect(found).toBeDefined();
    expect(found!.id).toBe('late');
    expect(found!.botId).toBe(99);

    manager.destroy();
  });
});

// ── OAuth config threading ──────────────────────────────────────────────────

describe('AccountManager OAuth config', () => {
  it('threads per-account clientId/clientSecret/expiresAt into auth', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      accounts: [
        {
          id: 'oauth1',
          domain: 'o.bitrix24.ru',
          accessToken: 'tok',
          refreshToken: 'ref',
          clientId: 'cid1',
          clientSecret: 'csec1',
          expiresAt: 1700000000000,
        },
      ],
    });

    const account = manager.getAccount('oauth1')!;
    expect(account.auth).toEqual({
      type: 'oauth',
      accessToken: 'tok',
      refreshToken: 'ref',
      clientId: 'cid1',
      clientSecret: 'csec1',
      expiresAt: 1700000000000,
    });

    manager.destroy();
  });

  it('falls back to global clientId/clientSecret when per-account is absent', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      clientId: 'global_cid',
      clientSecret: 'global_csec',
      accounts: [
        {
          id: 'oauth2',
          domain: 'o2.bitrix24.ru',
          accessToken: 'tok2',
          refreshToken: 'ref2',
        },
      ],
    });

    const account = manager.getAccount('oauth2')!;
    expect(account.auth).toMatchObject({
      type: 'oauth',
      clientId: 'global_cid',
      clientSecret: 'global_csec',
    });

    manager.destroy();
  });

  it('per-account clientId overrides global', () => {
    const manager = new AccountManager();
    manager.loadFromConfig({
      clientId: 'global_cid',
      clientSecret: 'global_csec',
      accounts: [
        {
          id: 'override',
          domain: 'ov.bitrix24.ru',
          accessToken: 'tok',
          clientId: 'per_account_cid',
          clientSecret: 'per_account_csec',
        },
      ],
    });

    const account = manager.getAccount('override')!;
    expect(account.auth).toMatchObject({
      clientId: 'per_account_cid',
      clientSecret: 'per_account_csec',
    });

    manager.destroy();
  });
});

// ── setTokenRefreshCallback ──────────────────────────────────────────────────

describe('AccountManager.setTokenRefreshCallback', () => {
  it('passes callback to newly created clients', () => {
    const manager = new AccountManager();
    const cb = vi.fn();
    manager.setTokenRefreshCallback(cb);

    manager.loadFromConfig({
      accounts: [
        {
          id: 'cb_test',
          domain: 'cb.bitrix24.ru',
          accessToken: 'tok',
          refreshToken: 'ref',
          clientId: 'cid',
          clientSecret: 'csec',
        },
      ],
    });

    // Getting a client should create one with the callback wired
    const client = manager.getClient('cb_test');
    expect(client).toBeDefined();

    manager.destroy();
  });
});
