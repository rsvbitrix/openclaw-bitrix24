import { describe, it, expect } from 'vitest';
import { parseDialogId, userDialogId, chatDialogId, extractChatId } from '../../src/bitrix24/targets.js';

describe('parseDialogId', () => {
  it('parses numeric user ID', () => {
    const result = parseDialogId('42');
    expect(result).toEqual({ type: 'user', id: 42, dialogId: '42' });
  });

  it('parses chat ID', () => {
    const result = parseDialogId('chat123');
    expect(result).toEqual({ type: 'chat', id: 123, dialogId: 'chat123' });
  });

  it('is case-insensitive for chat prefix', () => {
    const result = parseDialogId('CHAT456');
    expect(result).toEqual({ type: 'chat', id: 456, dialogId: 'CHAT456' });
  });

  it('throws on invalid dialog ID', () => {
    expect(() => parseDialogId('abc')).toThrow('Invalid DIALOG_ID');
    expect(() => parseDialogId('')).toThrow('Invalid DIALOG_ID');
    expect(() => parseDialogId('-1')).toThrow('Invalid DIALOG_ID');
  });
});

describe('userDialogId', () => {
  it('creates user dialog ID', () => {
    expect(userDialogId(42)).toBe('42');
  });
});

describe('chatDialogId', () => {
  it('creates chat dialog ID', () => {
    expect(chatDialogId(123)).toBe('chat123');
  });
});

describe('extractChatId', () => {
  it('extracts from chat dialog ID', () => {
    expect(extractChatId('chat789')).toBe(789);
  });

  it('uses toChatId for user dialog', () => {
    expect(extractChatId('42', 100)).toBe(100);
  });

  it('returns null for user dialog without toChatId', () => {
    expect(extractChatId('42')).toBeNull();
  });
});
