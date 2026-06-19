import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CameraWithZones } from '@shelf-analysis/shared';
import ZoneCanvas from '../components/ZoneCanvas';

export default function CameraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [camera, setCamera] = useState<CameraWithZones | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { camera: c } = await api.getCamera(id);
      setCamera(c);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to load camera');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(file: File) {
    if (!id) return;
    setUploading(true);
    setError('');
    try {
      const { camera: updated } = await api.uploadCameraSnapshot(id, file);
      setCamera((prev) => (prev ? { ...prev, has_snapshot: updated.has_snapshot } : prev));
      setPreviewVersion((v) => v + 1);
      setSuccess('Reference frame uploaded');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateZone(zone: {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    if (!id) return;
    const { zone: created } = await api.createZone(id, zone);
    setCamera((prev) =>
      prev
        ? {
            ...prev,
            zones: [...prev.zones, created],
            zone_count: prev.zone_count + 1,
          }
        : prev,
    );
    setSuccess(`Zone "${created.name}" created`);
  }

  async function handleDeleteZone(zoneId: string) {
    if (!id) return;
    await api.deleteZone(id, zoneId);
    setCamera((prev) =>
      prev
        ? {
            ...prev,
            zones: prev.zones.filter((z) => z.id !== zoneId),
            zone_count: prev.zone_count - 1,
          }
        : prev,
    );
    setSuccess('Zone deleted');
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error && !camera) return <div className="alert alert-error">{error}</div>;
  if (!camera || !id) return null;

  const previewUrl = `${api.cameraPreviewUrl(id)}?v=${previewVersion}`;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <Link to="/cameras" className="back-link">← Back to cameras</Link>
        <div className="page-header" style={{ marginTop: '1rem' }}>
          <div>
            <h2>{camera.name}</h2>
            <p className="text-muted">
              {camera.type === 'virtual' ? 'Virtual camera' : 'Real IP camera'}
              {camera.stream_url && <> · {camera.stream_url}</>}
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : camera.has_snapshot ? 'Replace reference frame' : 'Upload reference frame'}
            </button>
          </div>
        </div>

        <ZoneCanvas
          previewUrl={previewUrl}
          zones={camera.zones}
          onCreateZone={handleCreateZone}
          onDeleteZone={handleDeleteZone}
        />

        {camera.zones.length > 0 && (
          <div className="zone-list">
            <h3>Zones ({camera.zones.length})</h3>
            <ul>
              {camera.zones.map((zone) => (
                <li key={zone.id}>
                  <strong>{zone.name}</strong>
                  <span className="text-muted">
                    {Math.round(zone.x * 100)}%, {Math.round(zone.y * 100)}% ·{' '}
                    {Math.round(zone.width * 100)}% × {Math.round(zone.height * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
