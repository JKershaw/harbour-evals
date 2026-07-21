import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Tool, ToolContext, ToolResponse } from '../src/types.js';
import { ensureInside } from '../src/utils.js';

const execFileAsync = promisify(execFile);
const ALLOWED_COMMANDS = new Set(['npm', 'pnpm', 'node']);
const BLOCKED_TOKENS = ['&&', ';', '|', '>', '<', '$(', '`'];

export class TerminalTool implements Tool {
  readonly name = 'terminal' as const;

  constructor(private readonly context: ToolContext) {}

  async execute(request: Record<string, unknown>): Promise<ToolResponse> {
    const command = typeof request.command === 'string' ? request.command.trim() : '';
    const cwd = typeof request.cwd === 'string' ? request.cwd : '.';

    if (!command) {
      return { ok: false, error: 'command is required' };
    }

    if (BLOCKED_TOKENS.some((token) => command.includes(token))) {
      return { ok: false, error: 'command contains blocked shell syntax' };
    }

    const parts = command.split(/\s+/);
    if (!ALLOWED_COMMANDS.has(parts[0] ?? '')) {
      return { ok: false, error: `command ${parts[0]} is not allowed` };
    }

    const commandCwd = ensureInside(this.context.fixtureDir, path.join(this.context.fixtureDir, cwd));

    try {
      const { stdout, stderr } = await execFileAsync(parts[0]!, parts.slice(1), { cwd: commandCwd, timeout: 15_000 });
      return { ok: true, data: { stdout, stderr } };
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : 'terminal error' };
    }
  }
}
