import { describe, it, expect } from 'vitest';
import { markdownToBBCode, bbCodeToMarkdown, chunkText } from '../../src/bitrix24/format.js';

describe('markdownToBBCode', () => {
  it('converts bold', () => {
    expect(markdownToBBCode('**bold text**')).toBe('[b]bold text[/b]');
  });

  it('converts italic', () => {
    expect(markdownToBBCode('*italic text*')).toBe('[i]italic text[/i]');
  });

  it('converts bold and italic together', () => {
    expect(markdownToBBCode('**bold** and *italic*')).toBe('[b]bold[/b] and [i]italic[/i]');
  });

  it('converts inline code', () => {
    expect(markdownToBBCode('use `npm install`')).toBe('use [code]npm install[/code]');
  });

  it('converts code blocks', () => {
    const md = '```js\nconst x = 1;\n```';
    expect(markdownToBBCode(md)).toBe('[code]const x = 1;\n[/code]');
  });

  it('converts links', () => {
    expect(markdownToBBCode('[Google](https://google.com)'))
      .toBe('[url=https://google.com]Google[/url]');
  });

  it('converts strikethrough', () => {
    expect(markdownToBBCode('~~deleted~~')).toBe('[s]deleted[/s]');
  });

  it('converts headings to bold', () => {
    expect(markdownToBBCode('# Title')).toBe('[b]Title[/b]');
    expect(markdownToBBCode('## Subtitle')).toBe('[b]Subtitle[/b]');
  });

  it('converts unordered lists to bullets', () => {
    expect(markdownToBBCode('- item one\n- item two'))
      .toBe('\u2022 item one\n\u2022 item two');
  });

  it('strips blockquote markers', () => {
    expect(markdownToBBCode('> quoted text')).toBe('quoted text');
  });

  it('passes plain text through', () => {
    expect(markdownToBBCode('plain text')).toBe('plain text');
  });
});

describe('bbCodeToMarkdown', () => {
  it('converts bold', () => {
    expect(bbCodeToMarkdown('[b]bold[/b]')).toBe('**bold**');
  });

  it('converts italic', () => {
    expect(bbCodeToMarkdown('[i]italic[/i]')).toBe('*italic*');
  });

  it('converts code', () => {
    expect(bbCodeToMarkdown('[code]x = 1[/code]')).toBe('```\nx = 1\n```');
  });

  it('converts url with text', () => {
    expect(bbCodeToMarkdown('[url=https://example.com]Link[/url]'))
      .toBe('[Link](https://example.com)');
  });

  it('converts url without text', () => {
    expect(bbCodeToMarkdown('[url]https://example.com[/url]'))
      .toBe('https://example.com');
  });

  it('converts user mentions', () => {
    expect(bbCodeToMarkdown('[user=42]Ivan Petrov[/user]')).toBe('@Ivan Petrov');
  });

  it('strips color tags', () => {
    expect(bbCodeToMarkdown('[color=#ff0000]red text[/color]')).toBe('red text');
  });

  it('converts strikethrough', () => {
    expect(bbCodeToMarkdown('[s]deleted[/s]')).toBe('~~deleted~~');
  });

  it('strips underline (no markdown equivalent)', () => {
    expect(bbCodeToMarkdown('[u]underlined[/u]')).toBe('underlined');
  });

  it('converts images', () => {
    expect(bbCodeToMarkdown('[img]https://example.com/pic.png[/img]'))
      .toBe('![](https://example.com/pic.png)');
  });

  it('converts quotes to blockquotes', () => {
    expect(bbCodeToMarkdown('[quote]line1\nline2[/quote]'))
      .toBe('> line1\n> line2');
  });
});

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    expect(chunkText('short', 100)).toEqual(['short']);
  });

  it('splits at paragraph boundary', () => {
    const text = 'paragraph one\n\nparagraph two';
    const chunks = chunkText(text, 20);
    expect(chunks).toEqual(['paragraph one', 'paragraph two']);
  });

  it('splits at sentence boundary', () => {
    const text = 'First sentence. Second sentence.';
    const chunks = chunkText(text, 20);
    expect(chunks[0]).toBe('First sentence.');
  });

  it('handles very long text without natural breaks', () => {
    const text = 'a'.repeat(100);
    const chunks = chunkText(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').length).toBe(100);
  });

  it('preserves all content', () => {
    const text = 'word '.repeat(50).trim();
    const chunks = chunkText(text, 30);
    expect(chunks.join(' ')).toBe(text);
  });
});
