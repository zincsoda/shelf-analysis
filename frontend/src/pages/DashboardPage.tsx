import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Analysis } from '@shelf-analysis/shared';
import { useAuth } from '../context/AuthContext';
import { formatConfidence, formatDate, formatPercent, resizeImage } from '../lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [model, setModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [latestResult, setLatestResult] = useState<Analysis | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const { analyses: list } = await api.listAnalyses();
      setAnalyses(list as Analysis[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    api.getSettings()
      .then(({ settings }) => {
        setAvailableModels(settings.selected_models);
        setModel((current) => current || settings.selected_models[0] || '');
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  function handleFileSelect(selected: File) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(selected.type)) {
      setError('Please select a JPEG, PNG, or WebP image');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }
    setError('');
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setError('');
    setSuccess('');
    setUploading(true);

    try {
      const resized = await resizeImage(file);
      const { analysis } = await api.analyze(resized, model);
      setLatestResult(analysis);
      setSuccess('Analysis complete!');
      await loadHistory();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Analysis failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {!user?.has_openrouter_api_key && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          Add your OpenRouter API key in{' '}
          <Link to="/settings">Settings</Link> to run analyses (unless a shared server key is configured).
        </div>
      )}

      <div className="card">
        <h2>Upload Shelf Image</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleAnalyze}>
          <div
            className={`upload-zone ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            <p>Drop an image here or click to browse</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              JPEG, PNG, WebP — max 5 MB
            </p>
          </div>

          {preview && (
            <img src={preview} alt="Preview" className="upload-preview" />
          )}

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="model">AI Model</label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={availableModels.length === 0}
            >
              {availableModels.length === 0 ? (
                <option value="">Configure models in Settings</option>
              ) : (
                availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))
              )}
            </select>
            {availableModels.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                <Link to="/settings">Choose models to test</Link> before running an analysis.
              </p>
            )}
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={!file || uploading || !model}
          >
            {uploading ? 'Analyzing…' : 'Analyze Shelf'}
          </button>
        </form>
      </div>

      {latestResult && (
        <div className="card">
          <h2>Latest Result</h2>
          <div className="result-grid">
            <div className="stat-box">
              <div className="value">{formatPercent(latestResult.empty_percentage)}</div>
              <div className="label">Empty Space</div>
            </div>
            <div className="stat-box">
              <div className="value">{formatConfidence(latestResult.confidence)}</div>
              <div className="label">Confidence</div>
            </div>
          </div>
          <p>{latestResult.analysis_text}</p>
          <Link to={`/analysis/${latestResult.id}`} style={{ marginTop: '0.75rem', display: 'inline-block' }}>
            View details →
          </Link>
        </div>
      )}

      <div className="card">
        <h2>Analysis History</h2>
        {loading ? (
          <div className="loading">Loading history…</div>
        ) : analyses.length === 0 ? (
          <div className="empty-state">No analyses yet. Upload a shelf image to get started.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Model</th>
                  <th>Empty %</th>
                  <th>Confidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.created_at)}</td>
                    <td style={{ fontSize: '0.8rem' }}>{a.model_used}</td>
                    <td>{formatPercent(a.empty_percentage)}</td>
                    <td>{formatConfidence(a.confidence)}</td>
                    <td>
                      <Link to={`/analysis/${a.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
