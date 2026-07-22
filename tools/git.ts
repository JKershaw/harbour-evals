import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool, ToolContext, ToolResponse } from '../src/types.js';

const ALLOWED_COMMANDS = new Set(['status', 'diff', 'show', 'log']);

export class GitTool implements Tool {
  readonly name = 'git' as const;

  constructor(private readonly context: ToolContext) {}

  async execute(request: Record<string, unknown>): Promise<ToolResponse> {
    const command = typeof request.command === 'string' ? request.command : '';
    if (!ALLOWED_COMMANDS.has(command)) {
      return { ok: false, error: 'unsupported git command' };
    }

    const filename = `${command}.txt`;
    const dirs = [
      ...(this.context.taskDir ? [path.join(this.context.taskDir, 'git')] : []),
      this.context.gitFixturesDir
    ];

    for (const dir of dirs) {
      try {
        const content = await fs.readFile(path.join(dir, filename), 'utf8');
        return { ok: true, data: { command, content } };
      } catch {
        // not found in this dir, try next
      }
    }

    return { ok: false, error: `no fixture found for git ${command}` };
  }
}
