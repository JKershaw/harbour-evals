import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool, ToolContext, ToolResponse } from '../src/types.js';
import { findFixtureFile, slugify } from '../src/utils.js';

export class DocumentationTool implements Tool {
  readonly name = 'documentation' as const;

  constructor(private readonly context: ToolContext) {}

  async execute(request: Record<string, unknown>): Promise<ToolResponse> {
    const query = typeof request.query === 'string' ? request.query : '';
    if (!query) {
      return { ok: false, error: 'query is required' };
    }

    const slug = slugify(query);
    const dirs = [
      ...(this.context.taskDir ? [path.join(this.context.taskDir, 'docs')] : []),
      this.context.docsFixturesDir
    ];

    const filePath = await findFixtureFile(dirs, slug, '.md');
    if (filePath) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return { ok: true, data: { query, content } };
      } catch {
        // fall through to empty result
      }
    }

    return { ok: true, data: { query, content: '' } };
  }
}
