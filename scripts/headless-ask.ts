#!/usr/bin/env bun
/**
 * headless-ask — one-shot, NON-INTERACTIVE Dexter run.
 *
 * Built for host processes (the GEV desk's RESEARCH card calls this through
 * its server-side /api/dexter/ask proxy). The Ink TUI is bypassed entirely:
 * this drives the same Agent loop and prints ONLY the final answer on stdout.
 *
 *   stdout = final answer text (nothing else)
 *   stderr = progress/diagnostics (tool starts, errors)
 *   exit   = 0 on answer, 1 on failure, 2 on usage error
 *
 * Usage: bun run scripts/headless-ask.ts "<question>" [--model <provider:model>]
 * Default model: $DEXTER_MODEL or openrouter:openai/gpt-4o-mini.
 */
import { config } from 'dotenv';

config({ quiet: true });

import { Agent } from '../src/agent/agent.js';

const argv = process.argv.slice(2);
let model = process.env.DEXTER_MODEL || 'openrouter:openai/gpt-4o-mini';
const words: string[] = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--model' && argv[i + 1]) {
    model = argv[i + 1];
    i += 1;
    continue;
  }
  words.push(argv[i]);
}
const question = words.join(' ').trim();
if (!question) {
  console.error('usage: bun run scripts/headless-ask.ts "<question>" [--model <provider:model>]');
  process.exit(2);
}

try {
  const agent = await Agent.create({
    model,
    maxIterations: 8,
    channel: 'headless',
    memoryEnabled: false,
    requestToolApproval: async ({ tool }) => {
      console.error(`[approve] ${tool}`);
      return 'allow-session' as const;
    },
  });

  let answer = '';
  for await (const event of agent.run(question)) {
    if (event.type === 'tool_start') {
      console.error(`[tool] ${event.tool}`);
    } else if (event.type === 'tool_error') {
      console.error(`[tool-error] ${event.tool}: ${String(event.error).slice(0, 200)}`);
    } else if (event.type === 'done') {
      answer = event.answer || '';
    }
  }

  const trimmed = String(answer).trim();
  if (!trimmed) {
    console.error('dexter produced no answer');
    process.exit(1);
  }
  process.stdout.write(trimmed + '\n');
  process.exit(0);
} catch (error) {
  console.error(`dexter failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
