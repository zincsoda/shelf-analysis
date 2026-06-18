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

/** Parse and validate AI JSON response */
function parseAiResponse(content: string): AiAnalysisResult {
  // Strip markdown code fences if present
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON');
  }

  const result = parsed as Record<string, unknown>;

  if (typeof result.empty_percentage !== 'number' || result.empty_percentage < 0 || result.empty_percentage > 100) {
    throw new Error('Invalid empty_percentage in AI response');
  }
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    throw new Error('Invalid confidence in AI response');
  }
  if (typeof result.analysis !== 'string' || !result.analysis.trim()) {
    throw new Error('Invalid analysis text in AI response');
  }

  return {
    empty_percentage: result.empty_percentage,
    confidence: result.confidence,
    analysis: result.analysis,
  };
}
