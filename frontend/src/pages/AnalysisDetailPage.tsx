import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Analysis } from '@shelf-analysis/shared';
import { formatConfidence, formatDate, formatPercent } from '../lib/utils';

export default function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getAnalysis(id)
      .then(({ analysis: a }) => setAnalysis(a))
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError('Failed to load analysis');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!analysis) return null;

  return (
    <div className="card">
      <Link to="/" style={{ fontSize: '0.85rem' }}>← Back to dashboard</Link>
      <h2 style={{ marginTop: '1rem' }}>Analysis Detail</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        {formatDate(analysis.created_at)} · {analysis.model_used}
      </p>

      <img
        src={api.imageUrl(analysis.id)}
        alt="Shelf"
        className="analysis-image"
      />

      <div className="result-grid">
        <div className="stat-box">
          <div className="value">{formatPercent(analysis.empty_percentage)}</div>
          <div className="label">Empty Space</div>
        </div>
        <div className="stat-box">
          <div className="value">{formatConfidence(analysis.confidence)}</div>
          <div className="label">Confidence</div>
        </div>
      </div>

      <p>{analysis.analysis_text}</p>
    </div>
  );
}
