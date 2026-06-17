-- Per-user OpenRouter API key (AES-GCM encrypted at rest)
ALTER TABLE users ADD COLUMN openrouter_api_key_encrypted TEXT;
