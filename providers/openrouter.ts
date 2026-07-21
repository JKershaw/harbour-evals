import type { ProviderAdapter, ProviderRequest, ProviderResponse } from '../src/types.js';

interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
  appName?: string;
  siteUrl?: string;
  maxRetries?: number;
}

interface OpenRouterApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_cost?: number;
  };
}

const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 60_000;

function backoffMs(attempt: number, retryAfterMs?: number): number {
  return retryAfterMs ?? Math.min(1_000 * 2 ** attempt, MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenRouterProvider implements ProviderAdapter {
  readonly name = 'openrouter';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appName: string;
  private readonly siteUrl: string;
  private readonly maxRetries: number;

  constructor(options: OpenRouterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://openrouter.ai/api/v1';
    this.appName = options.appName ?? 'harbour-evals';
    this.siteUrl = options.siteUrl ?? 'https://github.com/JKershaw/harbour-evals';
    this.maxRetries = options.maxRetries ?? 4;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: 0,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 60_000)
      });

      if (RETRIABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1_000 : undefined;
        await sleep(backoffMs(attempt, retryAfterMs));
        continue;
      }

      if (!response.ok) {
        throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as OpenRouterApiResponse;
      const content = payload.choices?.[0]?.message?.content;

      if (!content) {
        if (attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new Error('OpenRouter response did not include message content');
      }

      return {
        content,
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        estimatedCost: payload.usage?.total_cost ?? 0
      };
    }

    throw new Error(`OpenRouter request failed after ${maxAttempts} attempts`);
  }
}
