import { describe, it, expect } from 'vitest';
import {
  getSetupInstructions,
  getQuickHint,
  getWelcomeMessage,
  formatConnectionSuccess,
  formatConnectionError,
  formatMissingScopes,
  isValidWebhookUrl,
} from '../../extensions/bitrix24/src/setup-guide.js';

describe('setup-guide', () => {
  // ── getSetupInstructions ────────────────────────────────────────────────

  describe('getSetupInstructions', () => {
    it('should return a non-empty string', () => {
      const text = getSetupInstructions();
      expect(text.length).toBeGreaterThan(100);
    });

    it('should mention the key steps', () => {
      const text = getSetupInstructions();
      expect(text).toContain('Step 1');
      expect(text).toContain('Step 5');
      expect(text).toContain('imbot');
      expect(text).toContain('im');
      expect(text).toContain('disk');
      expect(text).toContain('/b24setup');
    });
  });

  // ── getQuickHint ────────────────────────────────────────────────────────

  describe('getQuickHint', () => {
    it('should mention /b24setup', () => {
      expect(getQuickHint()).toContain('/b24setup');
    });
  });

  // ── getWelcomeMessage ───────────────────────────────────────────────────

  describe('getWelcomeMessage', () => {
    it('should return a non-empty message', () => {
      const msg = getWelcomeMessage();
      expect(msg.length).toBeGreaterThan(100);
    });

    it('should mention CRM capabilities', () => {
      const msg = getWelcomeMessage();
      expect(msg).toContain('CRM');
      expect(msg).toContain('deals');
    });

    it('should mention Tasks capabilities', () => {
      const msg = getWelcomeMessage();
      expect(msg).toContain('Tasks');
    });

    it('should mention Messaging capabilities', () => {
      const msg = getWelcomeMessage();
      expect(msg).toContain('Messaging');
    });

    it('should include usage examples', () => {
      const msg = getWelcomeMessage();
      // Should have example queries in quotes
      expect(msg).toMatch(/".*"/);
    });

    it('should mention Calendar and Drive', () => {
      const msg = getWelcomeMessage();
      expect(msg).toContain('Calendar');
      expect(msg).toContain('Drive');
    });
  });

  // ── formatConnectionSuccess ─────────────────────────────────────────────

  describe('formatConnectionSuccess', () => {
    it('should include domain and scopes', () => {
      const text = formatConnectionSuccess({
        domain: 'portal.bitrix24.ru',
        scopes: ['imbot', 'im', 'disk'],
      });
      expect(text).toContain('portal.bitrix24.ru');
      expect(text).toContain('imbot, im, disk');
    });

    it('should mention bot registered when true', () => {
      const text = formatConnectionSuccess({
        domain: 'test.bitrix24.ru',
        scopes: ['imbot'],
        botRegistered: true,
      });
      expect(text).toContain('Bot registered');
    });

    it('should not mention bot when not registered', () => {
      const text = formatConnectionSuccess({
        domain: 'test.bitrix24.ru',
        scopes: ['imbot'],
        botRegistered: false,
      });
      expect(text).not.toContain('Bot registered');
    });
  });

  // ── formatConnectionError ───────────────────────────────────────────────

  describe('formatConnectionError', () => {
    it('should include the error message', () => {
      const text = formatConnectionError('ECONNREFUSED');
      expect(text).toContain('ECONNREFUSED');
      expect(text).toContain('Connection failed');
    });

    it('should include troubleshooting steps', () => {
      const text = formatConnectionError('timeout');
      expect(text).toContain('webhook URL is correct');
      expect(text).toContain('imbot');
    });
  });

  // ── formatMissingScopes ─────────────────────────────────────────────────

  describe('formatMissingScopes', () => {
    it('should list missing scopes', () => {
      const text = formatMissingScopes(['imbot', 'disk']);
      expect(text).toContain('imbot, disk');
      expect(text).toContain('missing');
    });
  });

  // ── isValidWebhookUrl ───────────────────────────────────────────────────

  describe('isValidWebhookUrl', () => {
    it('should accept valid webhook URLs', () => {
      expect(isValidWebhookUrl('https://portal.bitrix24.ru/rest/1/abc123/')).toBe(true);
      expect(isValidWebhookUrl('https://b24-imitrt.bitrix24.ru/rest/42/xyzSecret')).toBe(true);
    });

    it('should reject non-https URLs', () => {
      expect(isValidWebhookUrl('http://portal.bitrix24.ru/rest/1/abc123/')).toBe(false);
    });

    it('should reject malformed URLs', () => {
      expect(isValidWebhookUrl('not-a-url')).toBe(false);
      expect(isValidWebhookUrl('')).toBe(false);
    });

    it('should reject URLs without /rest/userId/secret pattern', () => {
      expect(isValidWebhookUrl('https://portal.bitrix24.ru/')).toBe(false);
      expect(isValidWebhookUrl('https://portal.bitrix24.ru/rest/')).toBe(false);
      expect(isValidWebhookUrl('https://portal.bitrix24.ru/rest/abc/secret/')).toBe(false);
    });
  });
});
