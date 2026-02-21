import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios before any imports that use it
const mockPost = vi.fn();
const mockAxiosInstance = {
  post: mockPost,
  get: vi.fn(),
  defaults: { baseURL: '' },
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
};

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
    get: vi.fn(),
  },
}));

import { Bitrix24Channel } from '../../extensions/bitrix24/src/channel.js';
import { setBitrix24Runtime, type PluginRuntime } from '../../extensions/bitrix24/src/runtime.js';
import type { IncomingMessage } from '../../src/bitrix24/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_WEBHOOK_URL = 'https://test-portal.bitrix24.ru/rest/1/abc123secret/';
const TEST_ACCOUNT_ID = 'test-account';
const TEST_WEBHOOK_BASE_URL = 'https://agent.example.com';

function createMockRuntime(): PluginRuntime {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    config: {},
    webhookBaseUrl: TEST_WEBHOOK_BASE_URL,
  };
}

/** Helper: set up mockPost to return a Bitrix24 API response for a given method. */
function mockApiResponse(method: string, result: any) {
  mockPost.mockImplementation((url: string, _data: any) => {
    if (url === `/${method}`) {
      return Promise.resolve({ data: { result } });
    }
    // Default: return empty result for any other method (e.g. typing indicator)
    return Promise.resolve({ data: { result: true } });
  });
}

/** Helper: set up mockPost to handle multiple methods with different responses. */
function mockApiResponses(responses: Record<string, any>) {
  mockPost.mockImplementation((url: string, _data: any) => {
    const method = url.replace('/', '');
    if (method in responses) {
      return Promise.resolve({ data: { result: responses[method] } });
    }
    return Promise.resolve({ data: { result: true } });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Bitrix24Channel integration', () => {
  let channel: Bitrix24Channel;
  let runtime: PluginRuntime;

  beforeEach(() => {
    vi.clearAllMocks();

    runtime = createMockRuntime();
    setBitrix24Runtime(runtime);

    channel = new Bitrix24Channel();
    channel.configure({
      accounts: [
        {
          id: TEST_ACCOUNT_ID,
          webhookUrl: TEST_WEBHOOK_URL,
          domain: 'test-portal.bitrix24.ru',
          bot: {
            name: 'Test Bot',
            color: 'PURPLE',
            workPosition: 'Test Assistant',
          },
        },
      ],
    });
  });

  afterEach(() => {
    channel.destroy();
  });

  // ── 1. configure ─────────────────────────────────────────────────────────

  describe('configure', () => {
    it('should register the account from config', () => {
      const accounts = channel.listAccountIds();
      expect(accounts).toContain(TEST_ACCOUNT_ID);
    });

    it('should list enabled accounts with domain', () => {
      const enabled = channel.listEnabledAccounts();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]).toEqual({
        id: TEST_ACCOUNT_ID,
        domain: 'test-portal.bitrix24.ru',
      });
    });

    it('should resolve the account by id', () => {
      const account = channel.resolveAccount(TEST_ACCOUNT_ID);
      expect(account).toBeDefined();
      expect(account!.domain).toBe('test-portal.bitrix24.ru');
      expect(account!.bot.name).toBe('Test Bot');
    });
  });

  // ── 2. startupAccount ────────────────────────────────────────────────────

  describe('startupAccount', () => {
    it('should call imbot.register and store botId/botCode', async () => {
      const BOT_ID = 42;
      mockApiResponse('imbot.register', BOT_ID);

      await channel.startupAccount(TEST_ACCOUNT_ID);

      // Verify imbot.register was called
      const registerCall = mockPost.mock.calls.find(
        (call) => call[0] === '/imbot.register',
      );
      expect(registerCall).toBeDefined();

      const payload = registerCall![1];
      expect(payload.CODE).toBe(`openclaw_${TEST_ACCOUNT_ID}`);
      expect(payload.TYPE).toBe('B');
      expect(payload.PROPERTIES.NAME).toBe('Test Bot');
      expect(payload.PROPERTIES.COLOR).toBe('PURPLE');
      expect(payload.PROPERTIES.WORK_POSITION).toBe('Test Assistant');
      expect(payload.EVENT_MESSAGE_ADD).toBe(
        `${TEST_WEBHOOK_BASE_URL}/webhook/bitrix24/${TEST_ACCOUNT_ID}/message`,
      );

      // Verify botId was stored
      const account = channel.resolveAccount(TEST_ACCOUNT_ID);
      expect(account!.botId).toBe(BOT_ID);
      expect(account!.botCode).toBe(`openclaw_${TEST_ACCOUNT_ID}`);

      // Verify logger was called
      expect(runtime.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registering Bitrix24 bot'),
      );
      expect(runtime.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`ID: ${BOT_ID}`),
      );
    });

    it('should skip registration if botId is already set', async () => {
      // First registration
      mockApiResponse('imbot.register', 42);
      await channel.startupAccount(TEST_ACCOUNT_ID);

      vi.clearAllMocks();

      // Second call should skip
      await channel.startupAccount(TEST_ACCOUNT_ID);

      expect(mockPost).not.toHaveBeenCalled();
      expect(runtime.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('already registered'),
      );
    });

    it('should throw if account does not exist', async () => {
      await expect(channel.startupAccount('nonexistent')).rejects.toThrow(
        'Account "nonexistent" not found',
      );
    });
  });

  // ── 3. sendTextMessage ───────────────────────────────────────────────────

  describe('sendTextMessage', () => {
    const DIALOG_ID = '123';
    const BOT_ID = 42;

    beforeEach(async () => {
      // Register bot first
      mockApiResponse('imbot.register', BOT_ID);
      await channel.startupAccount(TEST_ACCOUNT_ID);
      vi.clearAllMocks();

      // Set up default responses for send flow
      mockApiResponses({
        'imbot.chat.sendTyping': true,
        'imbot.message.add': 1001,
      });
    });

    it('should send typing indicator then message with BB-code', async () => {
      const text = 'Hello **world**';

      await channel.sendTextMessage(TEST_ACCOUNT_ID, DIALOG_ID, text);

      // Verify typing indicator was sent
      const typingCall = mockPost.mock.calls.find(
        (call) => call[0] === '/imbot.chat.sendTyping',
      );
      expect(typingCall).toBeDefined();
      expect(typingCall![1].BOT_ID).toBe(BOT_ID);
      expect(typingCall![1].DIALOG_ID).toBe(DIALOG_ID);

      // Verify message was sent with BB-code conversion
      const messageCall = mockPost.mock.calls.find(
        (call) => call[0] === '/imbot.message.add',
      );
      expect(messageCall).toBeDefined();
      expect(messageCall![1].BOT_ID).toBe(BOT_ID);
      expect(messageCall![1].DIALOG_ID).toBe(DIALOG_ID);
      expect(messageCall![1].MESSAGE).toBe('Hello [b]world[/b]');
    });

    it('should send typing before message (call order)', async () => {
      await channel.sendTextMessage(TEST_ACCOUNT_ID, DIALOG_ID, 'test');

      const callOrder = mockPost.mock.calls.map((call) => call[0]);
      const typingIndex = callOrder.indexOf('/imbot.chat.sendTyping');
      const messageIndex = callOrder.indexOf('/imbot.message.add');

      expect(typingIndex).toBeGreaterThanOrEqual(0);
      expect(messageIndex).toBeGreaterThan(typingIndex);
    });

    it('should chunk and send multiple messages for long text (>4000 chars)', async () => {
      // Build text that exceeds the 4000 char limit
      // Use paragraphs so chunking splits at \n\n boundaries
      const paragraph = 'This is a test paragraph with some content. ';
      const longText = Array(120).fill(paragraph).join('\n\n');

      expect(longText.length).toBeGreaterThan(4000);

      let messageIdCounter = 1000;
      mockPost.mockImplementation((url: string) => {
        if (url === '/imbot.message.add') {
          messageIdCounter++;
          return Promise.resolve({ data: { result: messageIdCounter } });
        }
        return Promise.resolve({ data: { result: true } });
      });

      await channel.sendTextMessage(TEST_ACCOUNT_ID, DIALOG_ID, longText);

      // Count message.add calls
      const messageCalls = mockPost.mock.calls.filter(
        (call) => call[0] === '/imbot.message.add',
      );

      expect(messageCalls.length).toBeGreaterThan(1);

      // All chunks should have correct botId and dialogId
      for (const call of messageCalls) {
        expect(call[1].BOT_ID).toBe(BOT_ID);
        expect(call[1].DIALOG_ID).toBe(DIALOG_ID);
        expect(call[1].MESSAGE).toBeTruthy();
      }

      // Typing indicator should still be sent exactly once
      const typingCalls = mockPost.mock.calls.filter(
        (call) => call[0] === '/imbot.chat.sendTyping',
      );
      expect(typingCalls).toHaveLength(1);
    });

    it('should convert markdown formatting to BB-code', async () => {
      const markdownText = [
        '# Header',
        'Some **bold** and *italic* text',
        '~~strikethrough~~',
        '`inline code`',
        '[Link](https://example.com)',
      ].join('\n');

      await channel.sendTextMessage(TEST_ACCOUNT_ID, DIALOG_ID, markdownText);

      const messageCall = mockPost.mock.calls.find(
        (call) => call[0] === '/imbot.message.add',
      );
      const sentMessage = messageCall![1].MESSAGE;

      expect(sentMessage).toContain('[b]Header[/b]');
      expect(sentMessage).toContain('[b]bold[/b]');
      expect(sentMessage).toContain('[i]italic[/i]');
      expect(sentMessage).toContain('[s]strikethrough[/s]');
      expect(sentMessage).toContain('[code]inline code[/code]');
      expect(sentMessage).toContain('[url=https://example.com]Link[/url]');
    });

    it('should throw if account has no botId', async () => {
      // Create a new channel without bot registration
      const freshChannel = new Bitrix24Channel();
      freshChannel.configure({
        accounts: [
          {
            id: 'no-bot',
            webhookUrl: TEST_WEBHOOK_URL,
            domain: 'test-portal.bitrix24.ru',
          },
        ],
      });

      await expect(
        freshChannel.sendTextMessage('no-bot', DIALOG_ID, 'test'),
      ).rejects.toThrow('not configured or bot not registered');

      freshChannel.destroy();
    });

    it('should still send even if typing indicator fails', async () => {
      mockPost.mockImplementation((url: string) => {
        if (url === '/imbot.chat.sendTyping') {
          return Promise.reject(new Error('Typing API error'));
        }
        return Promise.resolve({ data: { result: 1001 } });
      });

      // Should not throw
      await channel.sendTextMessage(TEST_ACCOUNT_ID, DIALOG_ID, 'test message');

      const messageCall = mockPost.mock.calls.find(
        (call) => call[0] === '/imbot.message.add',
      );
      expect(messageCall).toBeDefined();
    });
  });

  // ── 4. handleIncomingMessage ─────────────────────────────────────────────

  describe('handleIncomingMessage', () => {
    it('should fire the onMessage callback with accountId and message', () => {
      const callback = vi.fn();
      channel.onMessage(callback);

      const incomingMsg: IncomingMessage = {
        messageId: 555,
        dialogId: '123',
        chatId: 10,
        text: 'Hello from user',
        fromUserId: 1,
        fromUserName: 'Ivan',
        fromUserLastName: 'Petrov',
        isBot: false,
        chatType: 'P',
        files: [],
        domain: 'test-portal.bitrix24.ru',
        botId: 42,
        botCode: `openclaw_${TEST_ACCOUNT_ID}`,
      };

      channel.handleIncomingMessage(TEST_ACCOUNT_ID, incomingMsg);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(TEST_ACCOUNT_ID, incomingMsg);
    });

    it('should not throw if no callback is registered', () => {
      const incomingMsg: IncomingMessage = {
        messageId: 556,
        dialogId: '123',
        text: 'No listener',
        fromUserId: 1,
        fromUserName: 'User',
        fromUserLastName: 'Name',
        isBot: false,
        chatType: 'P',
        files: [],
        domain: 'test-portal.bitrix24.ru',
        botId: 42,
        botCode: 'openclaw_test',
      };

      // Should not throw
      expect(() => {
        channel.handleIncomingMessage(TEST_ACCOUNT_ID, incomingMsg);
      }).not.toThrow();
    });

    it('should pass file attachments in the message', () => {
      const callback = vi.fn();
      channel.onMessage(callback);

      const incomingMsg: IncomingMessage = {
        messageId: 557,
        dialogId: 'chat100',
        text: 'See attached',
        fromUserId: 5,
        fromUserName: 'Maria',
        fromUserLastName: 'Ivanova',
        isBot: false,
        chatType: 'C',
        files: [
          { id: 'file1', name: 'report.pdf', size: 1024, type: 'application/pdf' },
        ],
        domain: 'test-portal.bitrix24.ru',
        botId: 42,
        botCode: `openclaw_${TEST_ACCOUNT_ID}`,
      };

      channel.handleIncomingMessage(TEST_ACCOUNT_ID, incomingMsg);

      const receivedMsg = callback.mock.calls[0][1] as IncomingMessage;
      expect(receivedMsg.files).toHaveLength(1);
      expect(receivedMsg.files[0].name).toBe('report.pdf');
    });
  });

  // ── 5. probeAccount ──────────────────────────────────────────────────────

  describe('probeAccount', () => {
    it('should call user.current and return ok:true on success', async () => {
      mockApiResponse('user.current', {
        ID: '1',
        NAME: 'Admin',
        LAST_NAME: 'User',
      });

      const result = await channel.probeAccount(TEST_ACCOUNT_ID);

      expect(result.ok).toBe(true);

      // Verify user.current was called
      const probeCall = mockPost.mock.calls.find(
        (call) => call[0] === '/user.current',
      );
      expect(probeCall).toBeDefined();
    });

    it('should return ok:false with error on API failure', async () => {
      mockPost.mockImplementation((url: string) => {
        if (url === '/user.current') {
          return Promise.resolve({
            data: {
              result: null,
              error: 'INVALID_TOKEN',
              error_description: 'The access token is invalid',
            },
          });
        }
        return Promise.resolve({ data: { result: true } });
      });

      const result = await channel.probeAccount(TEST_ACCOUNT_ID);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return ok:false on network error', async () => {
      mockPost.mockImplementation((url: string) => {
        if (url === '/user.current') {
          return Promise.reject(new Error('Network Error'));
        }
        return Promise.resolve({ data: { result: true } });
      });

      const result = await channel.probeAccount(TEST_ACCOUNT_ID);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network Error');
    });
  });

  // ── 6. logoutAccount ─────────────────────────────────────────────────────

  describe('logoutAccount', () => {
    const BOT_ID = 42;

    beforeEach(async () => {
      // Register bot first
      mockApiResponse('imbot.register', BOT_ID);
      await channel.startupAccount(TEST_ACCOUNT_ID);
      vi.clearAllMocks();
    });

    it('should call imbot.unregister with the bot ID', async () => {
      mockApiResponse('imbot.unregister', true);

      await channel.logoutAccount(TEST_ACCOUNT_ID);

      const unregisterCall = mockPost.mock.calls.find(
        (call) => call[0] === '/imbot.unregister',
      );
      expect(unregisterCall).toBeDefined();
      expect(unregisterCall![1].BOT_ID).toBe(BOT_ID);

      expect(runtime.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('unregistered'),
      );
    });

    it('should not throw if unregister fails (logs warning instead)', async () => {
      mockPost.mockImplementation(() => {
        return Promise.reject(new Error('Bot not found'));
      });

      // Should not throw
      await channel.logoutAccount(TEST_ACCOUNT_ID);

      expect(runtime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to unregister'),
      );
    });

    it('should do nothing if account has no botId', async () => {
      // Create channel without bot registration
      const freshChannel = new Bitrix24Channel();
      freshChannel.configure({
        accounts: [
          {
            id: 'no-bot',
            webhookUrl: TEST_WEBHOOK_URL,
            domain: 'test-portal.bitrix24.ru',
          },
        ],
      });

      vi.clearAllMocks();
      await freshChannel.logoutAccount('no-bot');

      // Should not call any API
      expect(mockPost).not.toHaveBeenCalled();

      freshChannel.destroy();
    });
  });
});
