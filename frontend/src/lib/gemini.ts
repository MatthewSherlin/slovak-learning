/**
 * Browser-side Gemini API client.
 * Calls the Gemini REST API directly — no backend needed.
 *
 * Tries multiple models in order. If one is rate-limited, falls back to the next.
 */

const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

function modelUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const API_KEY_STORAGE = 'slovak-gemini-api-key';

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
  if (!key) throw new Error('No Gemini API key configured. Go to Settings to add one.');

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const payload = JSON.stringify(body);
  let lastError = '';

  for (const model of GEMINI_MODELS) {
    const url = `${modelUrl(model)}?key=${key}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (res.status === 429) {
      // Rate limited on this model — try the next one
      lastError = `${model} rate limited`;
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      // If it's a model-not-found or permission error, try next model
      if (res.status === 404 || res.status === 403) {
        lastError = `${model}: ${res.status}`;
        continue;
      }
      throw new Error(`Gemini error (${model}, ${res.status}): ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    try {
      return data.candidates[0].content.parts[0].text;
    } catch {
      throw new Error(`Unexpected response format from ${model}`);
    }
  }

  throw new Error(
    `All Gemini models are rate limited (${lastError}). ` +
    'Try creating a new API key in a NEW Google Cloud project at https://aistudio.google.com/apikey ' +
    '(click "Create API key in new project").'
  );
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
