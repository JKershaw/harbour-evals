import { DocumentationTool } from '../tools/documentation.js';
import { FilesystemTool } from '../tools/filesystem.js';
import { GitTool } from '../tools/git.js';
import { SearchTool } from '../tools/search.js';
import { TerminalTool } from '../tools/terminal.js';
import type { TaskToolName, Tool, ToolContext } from './types.js';

export function createTools(names: TaskToolName[], context: ToolContext): Map<TaskToolName, Tool> {
  const factories: Record<TaskToolName, () => Tool> = {
    filesystem: () => new FilesystemTool(context),
    search: () => new SearchTool(context),
    documentation: () => new DocumentationTool(context),
    terminal: () => new TerminalTool(context),
    git: () => new GitTool(context)
  };

  return new Map(names.map((name) => [name, factories[name]()]));
}
