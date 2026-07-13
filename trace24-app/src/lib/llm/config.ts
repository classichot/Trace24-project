/**
 * LLM config — OpenAI-compatible chat completions.
 * Works with OpenAI, Azure OpenAI, Groq, Together, Ollama (OpenAI mode), etc.
 *
 * Env:
 *   LLM_API_KEY or OPENAI_API_KEY
 *   LLM_BASE_URL (default https://api.openai.com/v1)
 *   LLM_MODEL (default gpt-4o-mini)
 *   LLM_ENABLED=true|false (default: on when key present)
 */

export type LlmConfig = {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export function getLlmConfig(): LlmConfig {
  const apiKey =
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    null;
  const enabledEnv = process.env.LLM_ENABLED?.trim().toLowerCase();
  const enabled =
    enabledEnv === 'false' || enabledEnv === '0'
      ? false
      : enabledEnv === 'true' || enabledEnv === '1'
        ? Boolean(apiKey)
        : Boolean(apiKey);

  return {
    enabled,
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 45000),
  };
}

export function llmStatus() {
  const c = getLlmConfig();
  return {
    configured: Boolean(c.apiKey),
    enabled: c.enabled,
    model: c.model,
    baseUrl: c.baseUrl.replace(/\/\/.*@/, '//***@'),
    note: c.enabled
      ? 'LLM assist live — rules remain source of truth for risk scores'
      : 'Set LLM_API_KEY (or OPENAI_API_KEY) to enable assist modes',
  };
}
