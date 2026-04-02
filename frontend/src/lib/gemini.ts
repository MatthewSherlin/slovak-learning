/**
 * Browser-side LLM client using OpenRouter.
 * Free models, no backend needed, CORS supported.
 *
 * https://openrouter.ai — free tier with generous limits.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const FREE_MODELS = [
  'openrouter/free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
];

const API_KEY_STORAGE = 'slovak-api-key';

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

export async function askGemini(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const key = getApiKey();
  if (!key) throw new Error('No API key configured. Go to Settings to add one.');

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  let lastError = '';

  for (const model of FREE_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (res.status === 429 || res.status === 402) {
        lastError = `${model}: ${res.status === 429 ? 'rate limited' : 'payment required'}`;
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        lastError = `${model}: ${res.status} - ${err.substring(0, 100)}`;
        continue;
      }

      const body = await res.text();
      if (!body || !body.trim()) {
        lastError = `${model}: empty response body`;
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(body);
      } catch {
        lastError = `${model}: invalid JSON response`;
        continue;
      }

      if (data.error) {
        lastError = `${model}: ${data.error.message || JSON.stringify(data.error).substring(0, 100)}`;
        continue;
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        lastError = `${model}: empty response`;
        continue;
      }

      return text;
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : 'network error'}`;
      continue;
    }
  }

  throw new Error(`All models failed. Last error: ${lastError}`);
}

export async function askGeminiJson(
  prompt: string,
  systemPrompt?: string,
): Promise<Record<string, unknown>> {
  const raw = await askGemini(prompt, systemPrompt);
  return extractJson(raw);
}

function extractJson(text: string): Record<string, unknown> {
  // Try fenced code block first
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }

  try {
    return JSON.parse(text);
  } catch {
    // ignore
  }

  // Find first { or [
  const brace = text.indexOf('{');
  const bracket = text.indexOf('[');
  if (brace === -1 && bracket === -1) {
    throw new Error('No JSON found in response');
  }

  const start = [brace, bracket].filter((x) => x >= 0).reduce((a, b) => Math.min(a, b));
  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) depth--;
    if (depth === 0) {
      return JSON.parse(text.substring(start, i + 1));
    }
  }

  throw new Error('Unbalanced JSON in response');
}
