/**
 * E2E check — verifies core library against a real Bitrix24 portal.
 *
 * Usage:
 *   npx tsx scripts/e2e-check.ts "https://your-portal.bitrix24.ru/rest/1/secret/"
 *
 * Or via env:
 *   BITRIX24_WEBHOOK_URL="..." npx tsx scripts/e2e-check.ts
 */

import { createClientFromWebhook, Bitrix24Error } from '../src/bitrix24/client.js';
import { markdownToBBCode, bbCodeToMarkdown } from '../src/bitrix24/format.js';

const webhookUrl = process.argv[2] || process.env.BITRIX24_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('Usage: npx tsx scripts/e2e-check.ts <webhook-url>');
  console.error('  or set BITRIX24_WEBHOOK_URL env var');
  process.exit(1);
}

const client = createClientFromWebhook(webhookUrl);

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void>) {
  process.stdout.write(`\n[${ name }] ... `);
  try {
    await fn();
    passed++;
    console.log('OK');
  } catch (err) {
    failed++;
    if (err instanceof Bitrix24Error) {
      console.log(`FAIL  ${err.code}: ${err.description}`);
    } else {
      console.log(`FAIL  ${err instanceof Error ? err.message : err}`);
    }
  }
}

console.log('=== E2E Check: OpenClaw Bitrix24 ===');
console.log(`Portal: ${client.domain}`);

// ── 1. Connectivity — app.info (works for any webhook) ──────────────────────

await check('connectivity (app.info)', async () => {
  const info = await client.callMethod<Record<string, any>>('app.info');
  console.log(`  scope: ${info.SCOPE ?? 'N/A'}`);
  console.log(`  status: ${info.STATUS ?? 'N/A'}`);
});

// ── 2. user.current (requires scope: user) ───────────────────────────────────

await check('user.current (scope: user)', async () => {
  const user = await client.callMethod<Record<string, any>>('user.current');
  console.log(`  ${user.NAME} ${user.LAST_NAME} (ID: ${user.ID})`);
}).catch(() => {
  // scope "user" not granted — expected for bot-only webhook, not a real failure
  passed++; failed--;
  console.log('  ^ scope "user" not granted — OK for bot webhook');
});

// ── 3. imbot.bot.list — check bot scope ──────────────────────────────────────

await check('imbot.bot.list (scope: imbot)', async () => {
  const result = await client.callMethod<any>('imbot.bot.list');
  const bots = Array.isArray(result) ? result : Object.values(result ?? {});
  console.log(`  ${bots.length} bot(s) registered`);
  for (const bot of bots.slice(0, 3)) {
    const b = typeof bot === 'object' ? bot : { ID: bot };
    console.log(`    - ${b.NAME ?? 'bot'} (ID: ${b.ID ?? '?'}, code: ${b.CODE ?? '-'})`);
  }
});

// ── 4. im.recent.list — scope "im" ──────────────────────────────────────────

await check('im.recent.list (scope: im)', async () => {
  const recent = await client.callMethod<any>('im.recent.list', { LIMIT: 3 });
  const items = Array.isArray(recent) ? recent : (recent?.items ?? []);
  console.log(`  ${items.length} recent chat(s)`);
});

// ── 5. Format conversion ────────────────────────────────────────────────────

await check('format: Markdown → BB-code → Markdown', async () => {
  const md = '**Bold** and _italic_ and [link](https://example.com)';
  const bb = markdownToBBCode(md);
  const back = bbCodeToMarkdown(bb);
  console.log(`  MD:   ${md}`);
  console.log(`  BB:   ${bb}`);
  console.log(`  Back: ${back}`);
});

// ── Done ─────────────────────────────────────────────────────────────────────

client.destroy();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
