import { getLlmConfig } from './config';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmChatResult =
  | { ok: true; content: string; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  | { ok: false; error: string };

export async function chatCompletion(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; json?: boolean } = {}
): Promise<LlmChatResult> {
  const cfg = getLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, error: 'LLM not configured (set LLM_API_KEY or OPENAI_API_KEY)' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    const text = await r.text();
    let data: {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: `LLM non-JSON HTTP ${r.status}: ${text.slice(0, 160)}` };
    }

    if (!r.ok) {
      return { ok: false, error: data.error?.message || `LLM HTTP ${r.status}` };
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { ok: false, error: 'LLM returned empty content' };

    return {
      ok: true,
      content,
      model: data.model || cfg.model,
      usage: data.usage,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'LLM request failed';
    return { ok: false, error: msg.includes('abort') ? 'LLM timeout' : msg };
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonLoose<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}
