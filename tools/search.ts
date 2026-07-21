import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool, ToolContext, ToolResponse } from '../src/types.js';
import { slugify } from '../src/utils.js';

export class SearchTool implements Tool {
  readonly name = 'search' as const;

  constructor(private readonly context: ToolContext) {}

  async execute(request: Record<string, unknown>): Promise<ToolResponse> {
    const query = typeof request.query === 'string' ? request.query : '';
    if (!query) {
      return { ok: false, error: 'query is required' };
    }

    const filePath = path.join(this.context.searchFixturesDir, `${slugify(query)}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { ok: true, data: JSON.parse(content) };
    } catch {
      return { ok: true, data: { query, results: [] } };
    }
  }
}
