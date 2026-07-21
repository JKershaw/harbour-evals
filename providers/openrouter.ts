import type { ProviderAdapter, ProviderRequest, ProviderResponse } from '../src/types.js';

interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
  appName?: string;
  siteUrl?: string;
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

export class OpenRouterProvider implements ProviderAdapter {
  readonly name = 'openrouter';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appName: string;
  private readonly siteUrl: string;

  constructor(options: OpenRouterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://openrouter.ai/api/v1';
    this.appName = options.appName ?? 'harbour-evals';
    this.siteUrl = options.siteUrl ?? 'https://github.com/JKershaw/harbour-evals';
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
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

    if (!response.ok) {
      throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as OpenRouterApiResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter response did not include message content');
    }

    return {
      content,
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      estimatedCost: payload.usage?.total_cost ?? 0
    };
  }
}
