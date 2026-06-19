import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { OpenRouterModel, UserSettings } from '@shelf-analysis/shared';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

function formatModelPrice(promptPerToken: string): string {
  const perMillion = Number(promptPerToken) * 1_000_000;
  if (!Number.isFinite(perMillion) || perMillion === 0) return 'Free';
  if (perMillion < 0.01) return `$${perMillion.toFixed(4)}/M`;
  return `$${perMillion.toFixed(2)}/M`;
}

function formatCommitDate(isoDate: string): string {
  if (!isoDate) return 'Unknown';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const GIT_COMMIT = __APP_GIT_COMMIT__;
const GIT_COMMIT_SHORT = __APP_GIT_COMMIT_SHORT__;
const GIT_COMMIT_DATE = __APP_GIT_COMMIT_DATE__;
const GIT_REPO_URL = 'https://github.com/zincsoda/shelf-analysis';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modelError, setModelError] = useState('');
  const [modelSuccess, setModelSuccess] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const { settings: data } = await api.getSettings();
      setSettings(data);
      setSelectedModels(data.selected_models);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOpenRouterModels = useCallback(async () => {
    setLoadingModels(true);
    setModelError('');
    try {
      const { models } = await api.getOpenRouterModels();
      setAvailableModels(models);
      const ids = new Set(models.map((model) => model.id));
      setSelectedModels((current) => {
        const valid = current.filter((id) => ids.has(id));
        return valid.length > 0 ? valid : models.slice(0, 4).map((model) => model.id);
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setModelError(err.message);
      } else {
        setModelError('Failed to load models from OpenRouter');
      }
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    async function load() {
      await loadSettings();
      await loadOpenRouterModels();
    }
    load();
  }, [loadSettings, loadOpenRouterModels]);

  useEffect(() => {
    if (selectedModels.length === 0) {
      setShowSelectedOnly(false);
    }
  }, [selectedModels.length]);

  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    const selected = new Set(selectedModels);

    return availableModels.filter((model) => {
      if (showSelectedOnly && !selected.has(model.id)) return false;
      if (!query) return true;

      return (
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        (model.description?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [availableModels, modelSearch, selectedModels, showSelectedOnly]);

  function toggleModel(modelId: string) {
    setSelectedModels((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId],
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const { settings: updated } = await api.updateOpenRouterKey(apiKey.trim());
      setSettings(updated);
      setSelectedModels(updated.selected_models);
      setApiKey('');
      setSuccess('OpenRouter API key saved.');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save API key');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Remove your OpenRouter API key?')) return;

    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const { settings: updated } = await api.updateOpenRouterKey(null);
      setSettings(updated);
      setSelectedModels(updated.selected_models);
      setApiKey('');
      await refresh();
      setSuccess('OpenRouter API key removed.');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to remove API key');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveModels(e: FormEvent) {
    e.preventDefault();
    setModelError('');
    setModelSuccess('');
    setSavingModels(true);

    try {
      const { settings: updated } = await api.updateSelectedModels(selectedModels);
      setSettings(updated);
      setSelectedModels(updated.selected_models);
      setModelSuccess('Model selection saved.');
    } catch (err) {
      if (err instanceof ApiError) {
        setModelError(err.message);
      } else {
        setModelError('Failed to save model selection');
      }
    } finally {
      setSavingModels(false);
    }
  }

  function handleResetModels() {
    if (settings) {
      setSelectedModels(settings.selected_models);
    }
  }

  if (loading) {
    return <div className="loading">Loading settings…</div>;
  }

  const canAnalyze = settings?.has_openrouter_api_key;
  const modelsDirty =
    settings !== null &&
    (selectedModels.length !== settings.selected_models.length ||
      selectedModels.some((model) => !settings.selected_models.includes(model)));

  return (
    <div className="card">
      <h2>Settings</h2>

      <div style={{ marginBottom: '1.5rem' }}>
        <strong>Account</strong>
        <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
          {user?.email}
          {user?.role === 'admin' && (
            <span className="badge badge-admin" style={{ marginLeft: '0.5rem' }}>
              Admin
            </span>
          )}
        </p>
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Configure your OpenRouter API key for shelf analysis. Keys are encrypted at rest and never
        sent back to the browser after saving.
      </p>

      {!canAnalyze && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          No API key available. Add your OpenRouter key below to run analyses.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div style={{ marginBottom: '1.25rem' }}>
        <strong>Status:</strong>{' '}
        {settings?.has_openrouter_api_key ? (
          <span>Key configured ({settings.openrouter_key_hint})</span>
        ) : (
          <span style={{ color: 'var(--warning)' }}>Not configured</span>
        )}
      </div>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="openrouter-key">OpenRouter API Key</label>
          <input
            id="openrouter-key"
            type="password"
            autoComplete="off"
            placeholder={settings?.has_openrouter_api_key ? 'Enter new key to replace' : 'sk-or-v1-…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Get a key at{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              openrouter.ai/keys
            </a>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={!apiKey.trim() || saving}>
            {saving ? 'Saving…' : 'Save Key'}
          </button>
          {settings?.has_openrouter_api_key && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleRemove}
              disabled={saving}
            >
              Remove Key
            </button>
          )}
        </div>
      </form>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />

      <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Models to Test</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Choose which OpenRouter vision models appear in the analysis dropdown. Only models that
        accept image input and return text are shown.
      </p>

      {modelError && <div className="alert alert-error">{modelError}</div>}
      {modelSuccess && <div className="alert alert-success">{modelSuccess}</div>}

      <form onSubmit={handleSaveModels}>
        <div className="form-group">
          <label htmlFor="model-search">Search models</label>
          <input
            id="model-search"
            type="search"
            placeholder="Search by name or ID…"
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            disabled={loadingModels}
          />
          <label
            htmlFor="show-selected-only"
            className="form-checkbox"
            style={{
              cursor: loadingModels || selectedModels.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              id="show-selected-only"
              type="checkbox"
              checked={showSelectedOnly}
              onChange={(e) => setShowSelectedOnly(e.target.checked)}
              disabled={loadingModels || selectedModels.length === 0}
            />
            Show selected only
          </label>
        </div>

        <div className="model-picker-toolbar">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {selectedModels.length} selected
            {!loadingModels && ` · ${filteredModels.length} shown`}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={loadingModels || filteredModels.length === 0}
              onClick={() => {
                const visibleIds = filteredModels.map((model) => model.id);
                setSelectedModels((current) => [...new Set([...current, ...visibleIds])]);
              }}
            >
              Select visible
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={loadingModels}
              onClick={() => setSelectedModels([])}
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="model-picker-list">
          {loadingModels ? (
            <div className="loading" style={{ padding: '2rem' }}>
              Loading models from OpenRouter…
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              {showSelectedOnly && selectedModels.length === 0
                ? 'No models selected.'
                : showSelectedOnly && modelSearch
                  ? 'No selected models match your search.'
                  : modelSearch
                    ? 'No models match your search.'
                    : showSelectedOnly
                      ? 'No selected models in the current list.'
                      : 'No vision models available.'}
            </div>
          ) : (
            filteredModels.map((model) => {
              const checked = selectedModels.includes(model.id);
              return (
                <label key={model.id} className={`model-picker-item${checked ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(model.id)}
                  />
                  <span className="model-picker-item-body">
                    <span className="model-picker-item-title">{model.name}</span>
                    <span className="model-picker-item-id">{model.id}</span>
                    {model.description && (
                      <span className="model-picker-item-desc">{model.description}</span>
                    )}
                  </span>
                  <span className="model-picker-item-price">{formatModelPrice(model.pricing.prompt)}</span>
                </label>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={savingModels || loadingModels || selectedModels.length === 0 || !modelsDirty}
          >
            {savingModels ? 'Saving…' : 'Save Models'}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={savingModels || !modelsDirty}
            onClick={handleResetModels}
          >
            Reset
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={loadingModels}
            onClick={loadOpenRouterModels}
          >
            Refresh list
          </button>
        </div>
      </form>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2rem 0' }} />

      <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Deployment</h3>
      <dl className="deployment-info">
        <div className="deployment-info-row">
          <dt>Commit</dt>
          <dd>
            {GIT_COMMIT_SHORT ? (
              <a
                href={`${GIT_REPO_URL}/commit/${GIT_COMMIT}`}
                target="_blank"
                rel="noreferrer"
                title={GIT_COMMIT}
              >
                {GIT_COMMIT_SHORT}
              </a>
            ) : (
              'Unknown'
            )}
          </dd>
        </div>
        <div className="deployment-info-row">
          <dt>Last commit</dt>
          <dd>{formatCommitDate(GIT_COMMIT_DATE)}</dd>
        </div>
      </dl>

      <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <Link to="/">Back to dashboard</Link>
      </p>
    </div>
  );
}
