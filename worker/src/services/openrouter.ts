import { AI_MODELS, type AiAnalysisResult, type AiModel } from '@shelf-analysis/shared';
import type { Env } from '../types';

const ANALYSIS_PROMPT = `Analyze this supermarket shelf image. Estimate the percentage of empty shelf space. Return ONLY valid JSON in this format:
{
  "empty_percentage": number,
  "confidence": number,
  "analysis": "short explanation"
}`;

/** Validate that a model string is in the allowed list */
export function isValidModel(model: string): model is AiModel {
  return (AI_MODELS as readonly string[]).includes(model);
}

/** Call OpenRouter vision API with base64-encoded image */
export async function analyzeShelfImage(
  env: Env,
  apiKey: string,
  model: AiModel,
  imageBase64: string,
  mimeType: string,
): Promise<AiAnalysisResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.FRONTEND_URL,
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
