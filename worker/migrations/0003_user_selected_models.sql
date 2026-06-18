-- Per-user model selection for analysis (JSON array of OpenRouter model IDs)
ALTER TABLE users ADD COLUMN selected_models TEXT;
