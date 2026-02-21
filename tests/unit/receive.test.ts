import { describe, it, expect } from 'vitest';
import { parseMessageEvent, verifyApplicationToken } from '../../src/bitrix24/receive.js';
import type { Bitrix24MessageEvent } from '../../src/bitrix24/types.js';

function makeEvent(overrides: Partial<{
  isBot: 'Y' | 'N';
  message: string;
  fromUserId: number;
  applicationToken: string;
}>): Bitrix24MessageEvent {
  return {
    event: 'ONIMBOTMESSAGEADD',
    data: {
      BOT: [{ BOT_ID: 1, BOT_CODE: 'openclaw_default' }],
      PARAMS: {
        DIALOG_ID: '42',
        MESSAGE_ID: 100,
        MESSAGE: overrides.message ?? 'Hello',
        FROM_USER_ID: overrides.fromUserId ?? 42,
        TO_USER_ID: 1,
        TO_CHAT_ID: 200,
        CHAT_TYPE: 'P',
        LANGUAGE: 'ru',
      },
      USER: {
        ID: overrides.fromUserId ?? 42,
        NAME: 'Ivan Petrov',
        FIRST_NAME: 'Ivan',
        LAST_NAME: 'Petrov',
        IS_BOT: overrides.isBot ?? 'N',
      },
    },
    ts: Date.now(),
    auth: {
      domain: 'test.bitrix24.ru',
      application_token: overrides.applicationToken ?? 'token123',
    },
  };
}

describe('parseMessageEvent', () => {
  it('parses a valid message event', () => {
    const msg = parseMessageEvent(makeEvent({ message: '[b]Hello[/b] world' }));
    expect(msg).not.toBeNull();
    expect(msg!.messageId).toBe(100);
    expect(msg!.dialogId).toBe('42');
    expect(msg!.text).toBe('**Hello** world'); // BB-code → markdown
    expect(msg!.fromUserId).toBe(42);
    expect(msg!.fromUserName).toBe('Ivan');
    expect(msg!.fromUserLastName).toBe('Petrov');
    expect(msg!.isBot).toBe(false);
    expect(msg!.chatType).toBe('P');
    expect(msg!.domain).toBe('test.bitrix24.ru');
    expect(msg!.botId).toBe(1);
    expect(msg!.botCode).toBe('openclaw_default');
  });

  it('returns null for bot messages', () => {
    const msg = parseMessageEvent(makeEvent({ isBot: 'Y' }));
    expect(msg).toBeNull();
  });

  it('includes file attachments', () => {
    const event = makeEvent({});
    event.data.PARAMS.FILES = [
      { id: 'f1', name: 'photo.jpg', size: 1024, type: 'image/jpeg' },
    ];
    const msg = parseMessageEvent(event);
    expect(msg!.files).toHaveLength(1);
    expect(msg!.files[0].name).toBe('photo.jpg');
  });
});

describe('verifyApplicationToken', () => {
  it('passes when tokens match', () => {
    expect(verifyApplicationToken(
      { auth: { application_token: 'abc' } },
      'abc',
    )).toBe(true);
  });

  it('fails when tokens differ', () => {
    expect(verifyApplicationToken(
      { auth: { application_token: 'abc' } },
      'xyz',
    )).toBe(false);
  });

  it('passes when no expected token (skip verification)', () => {
    expect(verifyApplicationToken(
      { auth: { application_token: 'abc' } },
      undefined,
    )).toBe(true);
  });
});
