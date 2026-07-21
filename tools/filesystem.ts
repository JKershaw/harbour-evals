import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool, ToolContext, ToolResponse } from '../src/types.js';
import { ensureInside } from '../src/utils.js';

export class FilesystemTool implements Tool {
  readonly name = 'filesystem' as const;

  constructor(private readonly context: ToolContext) {}

  async execute(request: Record<string, unknown>): Promise<ToolResponse> {
    const action = typeof request.action === 'string' ? request.action : 'read';
    const relativePath = typeof request.path === 'string' ? request.path : '';

    if (!relativePath) {
      return { ok: false, error: 'path is required' };
    }

    const targetPath = ensureInside(this.context.fixtureDir, path.join(this.context.fixtureDir, relativePath));

    try {
      if (action === 'exists') {
        await fs.access(targetPath);
        return { ok: true, data: { exists: true } };
      }

      if (action === 'list') {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        return { ok: true, data: entries.map((entry: Dirent) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })) };
      }

      const content = await fs.readFile(targetPath, 'utf8');
      return { ok: true, data: { path: relativePath, content } };
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : 'filesystem error' };
    }
  }
}
