import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { UserSettings } from '@shelf-analysis/shared';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [apiKey, setApiKey] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const { settings: data } = await api.getSettings();
      setSettings(data);
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const { settings: updated } = await api.updateOpenRouterKey(apiKey.trim());
      setSettings(updated);
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

  if (loading) {
    return <div className="loading">Loading settings…</div>;
  }

  const canAnalyze =
    settings?.has_openrouter_api_key || settings?.uses_global_openrouter_key;

  return (
    <div className="card" style={{ maxWidth: '560px' }}>
      <h2>Settings</h2>
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
          <span>Personal key configured ({settings.openrouter_key_hint})</span>
        ) : settings?.uses_global_openrouter_key ? (
          <span>Using shared server key</span>
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

      <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Signed in as {user?.email}.{' '}
        <Link to="/">Back to dashboard</Link>
      </p>
    </div>
  );
}
