import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Analysis, Camera, CameraWithZones, CameraZone } from '@shelf-analysis/shared';
import { useAuth } from '../context/AuthContext';
import { cropImageFromZone, cropImagePreviewUrl } from '../lib/image-crop';
import { formatConfidence, formatDate, formatPercent, resizeImage } from '../lib/utils';

type SourceMode = 'upload' | 'zone';

export default function DashboardPage() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [model, setModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [latestResult, setLatestResult] = useState<Analysis | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedCamera, setSelectedCamera] = useState<CameraWithZones | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [zonePreview, setZonePreview] = useState<string | null>(null);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [loadingZonePreview, setLoadingZonePreview] = useState(false);

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

  useEffect(() => {
    api.listCameras()
      .then(({ cameras: list }) => setCameras(list))
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    if (!selectedCameraId) {
      setSelectedCamera(null);
      setSelectedZoneId('');
      setZonePreview(null);
      return;
    }

    setLoadingCamera(true);
    setSelectedZoneId('');
    setZonePreview(null);

    api.getCamera(selectedCameraId)
      .then(({ camera }) => setSelectedCamera(camera))
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        setSelectedCamera(null);
      })
      .finally(() => setLoadingCamera(false));
  }, [selectedCameraId]);

  const selectedZone: CameraZone | null =
    selectedCamera?.zones.find((z) => z.id === selectedZoneId) ?? null;

  useEffect(() => {
    if (!selectedCameraId || !selectedZoneId || !selectedCamera || loadingCamera) {
      setZonePreview(null);
      return;
    }

    const zone = selectedCamera.zones.find((z) => z.id === selectedZoneId);
    if (!zone) {
      setZonePreview(null);
      return;
    }

    let cancelled = false;
    setLoadingZonePreview(true);

    api.fetchCameraPreview(selectedCameraId)
      .then((blob) => cropImagePreviewUrl(blob, zone))
      .then((url) => {
        if (!cancelled) setZonePreview(url);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) setError(err.message);
          setZonePreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingZonePreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCameraId, selectedZoneId, selectedCamera, loadingCamera]);

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

  function switchSourceMode(mode: SourceMode) {
    setSourceMode(mode);
    setError('');
    if (mode === 'upload') {
      setSelectedCameraId('');
      setSelectedZoneId('');
      setZonePreview(null);
    } else {
      setFile(null);
      setPreview(null);
    }
  }

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setUploading(true);

    try {
      let imageToAnalyze: File;

      if (sourceMode === 'upload') {
        if (!file) return;
        imageToAnalyze = await resizeImage(file);
      } else {
        if (!selectedCameraId || !selectedZone) return;
        const previewBlob = await api.fetchCameraPreview(selectedCameraId);
        const cropped = await cropImageFromZone(previewBlob, selectedZone);
        imageToAnalyze = await resizeImage(cropped);
      }

      const { analysis } = await api.analyze(imageToAnalyze, model);
      setLatestResult(analysis);
      setSuccess(
        sourceMode === 'zone' && selectedZone
          ? `Analysis complete for zone "${selectedZone.name}"!`
          : 'Analysis complete!',
      );
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

  const canAnalyze =
    sourceMode === 'upload'
      ? Boolean(file)
      : Boolean(selectedCameraId && selectedZone);

  return (
    <>
      {!user?.has_openrouter_api_key && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          Add your OpenRouter API key in{' '}
          <Link to="/settings">Settings</Link> to run analyses (unless a shared server key is configured).
        </div>
      )}

      <div className="card">
        <h2>Analyse Shelf</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="source-toggle" role="tablist" aria-label="Image source">
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === 'upload'}
            className={`source-toggle-btn${sourceMode === 'upload' ? ' active' : ''}`}
            onClick={() => switchSourceMode('upload')}
          >
            Upload image
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === 'zone'}
            className={`source-toggle-btn${sourceMode === 'zone' ? ' active' : ''}`}
            onClick={() => switchSourceMode('zone')}
          >
            Camera zone
          </button>
        </div>

        <form onSubmit={handleAnalyze}>
          {sourceMode === 'upload' ? (
            <>
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
            </>
          ) : (
            <div className="zone-source-panel">
              {cameras.length === 0 ? (
                <div className="empty-state">
                  <p>No cameras configured yet.</p>
                  <p className="text-muted">
                    <Link to="/cameras">Add a camera</Link> and draw zones before analysing.
                  </p>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="camera-select">Camera</label>
                    <select
                      id="camera-select"
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                    >
                      <option value="">Select a camera…</option>
                      {cameras.map((camera) => (
                        <option key={camera.id} value={camera.id}>
                          {camera.name} ({camera.zone_count} zone{camera.zone_count === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {loadingCamera && <p className="text-muted">Loading camera…</p>}

                  {selectedCamera && !loadingCamera && (
                    <>
                      {!selectedCamera.has_snapshot && (
                        <div className="alert alert-error">
                          This camera has no reference frame.{' '}
                          <Link to={`/cameras/${selectedCamera.id}`}>Upload one</Link> to analyse zones.
                        </div>
                      )}

                      <div className="form-group">
                        <label htmlFor="zone-select">Zone</label>
                        <select
                          id="zone-select"
                          value={selectedZoneId}
                          onChange={(e) => setSelectedZoneId(e.target.value)}
                          disabled={selectedCamera.zones.length === 0}
                        >
                          <option value="">
                            {selectedCamera.zones.length === 0
                              ? 'No zones — add zones on the camera page'
                              : 'Select a zone…'}
                          </option>
                          {selectedCamera.zones.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.name}
                            </option>
                          ))}
                        </select>
                        {selectedCamera.zones.length === 0 && (
                          <p className="form-hint">
                            <Link to={`/cameras/${selectedCamera.id}`}>Draw zones</Link> on the camera view first.
                          </p>
                        )}
                      </div>

                      {loadingZonePreview && (
                        <p className="text-muted">Loading zone preview…</p>
                      )}

                      {zonePreview && selectedZone && (
                        <div className="zone-preview-wrap">
                          <p className="text-muted zone-preview-label">
                            Cropped preview — {selectedZone.name}
                          </p>
                          <img
                            src={zonePreview}
                            alt={`Cropped preview of ${selectedZone.name}`}
                            className="upload-preview"
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
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
            disabled={!canAnalyze || uploading || !model}
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
