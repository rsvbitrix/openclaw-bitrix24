/**
 * Bidirectional Markdown <-> BB-code converter.
 *
 * Bitrix24 messenger uses BB-code for formatting.
 * OpenClaw agents produce Markdown.
 */

/**
 * Convert Markdown to Bitrix24 BB-code.
 */
export function markdownToBBCode(md: string): string {
  let text = md;

  // Code blocks (``` ... ```) → [code]...[/code]  — must be first to protect contents
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, '[code]$1[/code]');

  // Inline code (`...`) → [code]...[/code]
  text = text.replace(/`([^`]+)`/g, '[code]$1[/code]');

  // Bold (**...**) → [b]...[/b]
  text = text.replace(/\*\*(.+?)\*\*/g, '[b]$1[/b]');

  // Italic (*...*) → [i]...[/i]   (but not inside [b] tags from above)
  text = text.replace(/(?<!\[)\*(.+?)\*(?!\])/g, '[i]$1[/i]');

  // Strikethrough (~~...~~) → [s]...[/s]
  text = text.replace(/~~(.+?)~~/g, '[s]$1[/s]');

  // Links [text](url) → [url=url]text[/url]
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[url=$2]$1[/url]');

  // Headings (# ... ) → [b]...[/b] + newline (BB-code has no headings)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '[b]$1[/b]');

  // Unordered list items (- item or * item) → bullet
  text = text.replace(/^[\s]*[-*]\s+(.+)$/gm, '\u2022 $1');

  // Ordered list items (1. item) — keep as-is (BB-code has no ordered lists)

  // Horizontal rule (--- or ***) → line
  text = text.replace(/^[-*]{3,}$/gm, '\u2500'.repeat(20));

  // Blockquote (> ...) → remove prefix, wrap in [quote] is not standard in B24 BB-code
  // Just strip the > prefix
  text = text.replace(/^>\s?(.*)$/gm, '$1');

  return text;
}

/**
 * Convert Bitrix24 BB-code to Markdown.
 */
export function bbCodeToMarkdown(bb: string): string {
  let text = bb;

  // [code]...[/code] → ```...```
  text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '```\n$1\n```');

  // [b]...[/b] → **...**
  text = text.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**');

  // [i]...[/i] → *...*
  text = text.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '*$1*');

  // [s]...[/s] → ~~...~~
  text = text.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '~~$1~~');

  // [u]...[/u] → just text (markdown has no underline)
  text = text.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '$1');

  // [url=...]...[/url] → [text](url)
  text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '[$2]($1)');

  // [url]...[/url] (no =) → just the URL
  text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '$1');

  // [user=ID]Name[/user] → @Name
  text = text.replace(/\[user=\d+\]([\s\S]*?)\[\/user\]/gi, '@$1');

  // [color=...]...[/color] → just text
  text = text.replace(/\[color=[^\]]+\]([\s\S]*?)\[\/color\]/gi, '$1');

  // [size=...]...[/size] → just text
  text = text.replace(/\[size=[^\]]+\]([\s\S]*?)\[\/size\]/gi, '$1');

  // [img]...[/img] → ![image](url)
  text = text.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, '![]($1)');

  // [quote]...[/quote] → > ...
  text = text.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (_match, content: string) => {
    return content
      .split('\n')
      .map((line: string) => `> ${line}`)
      .join('\n');
  });

  // [list] / [*] → bullet list
  text = text.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_match, content: string) => {
    return content.replace(/\[\*\]\s*/g, '- ').trim();
  });

  // Strip remaining BB-code closing tags (e.g. orphan [/tag])
  // Only strip tags with slash prefix to avoid clobbering markdown link syntax [Text](url)
  text = text.replace(/\[\/[a-zA-Z][^\]]*\]/g, '');

  return text;
}

/**
 * Split text into chunks at paragraph/sentence boundaries.
 * Respects BB-code/markdown block integrity.
 */
export function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', maxLength);

    // Try single newline
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf('\n', maxLength);
    }

    // Try sentence boundary
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf('. ', maxLength);
      if (splitAt > 0) splitAt += 1; // include the period
    }

    // Try space
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }

    // Hard split as last resort
    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
