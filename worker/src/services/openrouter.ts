import type { OpenRouterModel } from '@shelf-analysis/shared';
import type { AiAnalysisResult } from '@shelf-analysis/shared';
import type { Env } from '../types';

const ANALYSIS_PROMPT = `Analyze this supermarket shelf image. Estimate the percentage of empty shelf space. Return ONLY valid JSON in this format:
{
  "empty_percentage": number,
  "confidence": number,
  "analysis": "short explanation"
}`;

/** Check that a model is in the user's allowed list */
export function isAllowedModel(model: string, allowedModels: readonly string[]): boolean {
  return allowedModels.includes(model);
}

/** Fetch vision-capable models from OpenRouter (image input + text output) */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const url = new URL('https://openrouter.ai/api/v1/models');
  url.searchParams.set('input_modalities', 'image');
  url.searchParams.set('output_modalities', 'text');

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter models API error (${response.status}): ${errText}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string;
      name: string;
      description?: string;
      context_length?: number;
      architecture?: { output_modalities?: string[] };
      pricing?: { prompt?: string; completion?: string };
    }>;
  };

  const models = (payload.data ?? [])
    .filter((model) => model.architecture?.output_modalities?.includes('text'))
    .map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description ?? null,
      context_length: model.context_length ?? 0,
      pricing: {
        prompt: model.pricing?.prompt ?? '0',
        completion: model.pricing?.completion ?? '0',
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return models;
}

/** Call OpenRouter vision API with base64-encoded image */
export async function analyzeShelfImage(
  env: Env,
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
): Promise<AiAnalysisResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.FRONTEND_URL.split(',')[0].trim(),
      'X-Title': env.APP_NAME,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenRouter');
  }

  return parseAiResponse(content);
}

/** Extract a JSON object from model output (handles prose and markdown fences) */
function extractJsonPayload(content: string): string {
  const trimmed = content.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  if (start === -1) return trimmed;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed.slice(start);
}

function coercePercentage(value: unknown, field: string): number {
  let num: number | null = null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    num = value;
  } else if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/%/g, '').trim());
    if (Number.isFinite(parsed)) num = parsed;
  }

  if (num === null) {
    throw new Error(`Invalid ${field} in AI response`);
  }

  return num;
}

function normalizeConfidence(value: unknown): number {
  let confidence = coercePercentage(value, 'confidence');
  if (confidence > 1 && confidence <= 100) {
    confidence /= 100;
  }
  if (confidence < 0 || confidence > 1) {
    throw new Error('Invalid confidence in AI response');
  }
  return confidence;
}

/** Parse and validate AI JSON response */
function parseAiResponse(content: string): AiAnalysisResult {
  const candidates = [
    content.trim(),
    extractJsonPayload(content),
  ];

  let parsed: unknown;
  let lastError: unknown;

  for (const candidate of [...new Set(candidates)]) {
    try {
      parsed = JSON.parse(candidate);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError !== undefined) {
    const preview = content.trim().slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`AI returned invalid JSON${preview ? `: ${preview}` : ''}`);
  }

  const result = parsed as Record<string, unknown>;
  const emptyPercentage = coercePercentage(result.empty_percentage, 'empty_percentage');
  if (emptyPercentage < 0 || emptyPercentage > 100) {
    throw new Error('Invalid empty_percentage in AI response');
  }

  const analysis =
    typeof result.analysis === 'string'
      ? result.analysis.trim()
      : typeof result.analysis === 'number'
        ? String(result.analysis)
        : '';
  if (!analysis) {
    throw new Error('Invalid analysis text in AI response');
  }

  return {
    empty_percentage: emptyPercentage,
    confidence: normalizeConfidence(result.confidence),
    analysis,
  };
}
