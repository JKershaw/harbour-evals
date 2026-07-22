export type TaskToolName = 'filesystem' | 'search' | 'documentation' | 'terminal' | 'git';

export interface GitScenarioSource {
  repository: string;
  commit: string;
  subdir?: string;
}

export interface Tool {
  name: TaskToolName;
  execute(request: Record<string, unknown>): Promise<ToolResponse>;
}

export interface ToolResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolCallRecord {
  tool: TaskToolName;
  input: Record<string, unknown>;
  ok: boolean;
  response: unknown;
}

export interface ScoringCheck {
  id: string;
  type: 'contains' | 'contains_any' | 'contains_all' | 'tool_called' | 'documentation_cited' | 'file_exists';
  value?: string;
  values?: string[];
}

export interface ScoreWeights {
  required_weight?: number;
  optional_weight?: number;
  pass_threshold?: number;
}

export interface ExpectedDefinition {
  required: Array<ScoringCheck | string>;
  optional?: Array<ScoringCheck | string>;
  score?: ScoreWeights;
}

export interface TaskConfig {
  id: string;
  type: string;
  fixture?: string;
  scenario?: GitScenarioSource;
  tools: TaskToolName[];
  max_steps?: number;
  max_tool_calls?: number;
  timeout_seconds?: number;
}

export interface LoadedTask {
  config: TaskConfig;
  prompt: string;
  expected: ExpectedDefinition;
  taskDir: string;
  fixtureDir: string;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  timeoutMs?: number;
}

export interface ProviderResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

export interface ProviderAdapter {
  name: string;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}

export interface AgentFinalResponse {
  action: 'final';
  answer: string;
}

export interface AgentToolResponse {
  action: 'tool';
  tool: TaskToolName;
  input: Record<string, unknown>;
}

export type AgentResponse = AgentFinalResponse | AgentToolResponse;

export interface ScoreBreakdownItem {
  id: string;
  passed: boolean;
  tier: 'required' | 'optional';
}

export interface TaskScore {
  score: number;
  passed: boolean;
  breakdown: ScoreBreakdownItem[];
}

export interface TaskRunResult {
  model: string;
  taskId: string;
  taskType: string;
  score: number;
  passed: boolean;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  toolCalls: number;
  failedToolCalls: number;
  retries: number;
  transcript: ProviderMessage[];
  answer: string;
  breakdown: ScoreBreakdownItem[];
}

export interface SuiteRunResult {
  generatedAt: string;
  provider: string;
  models: string[];
  tasks: TaskRunResult[];
  runDir?: string;
}

export interface ToolContext {
  fixtureDir: string;
  searchFixturesDir: string;
  docsFixturesDir: string;
  gitFixturesDir: string;
  /** Optional: task's own directory. When set, tools check for task-local fixture subdirectories (search/, docs/, git/) before falling back to the global fixture directories. */
  taskDir?: string;
}
