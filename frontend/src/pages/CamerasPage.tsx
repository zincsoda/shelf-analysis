import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Camera, CameraType } from '@shelf-analysis/shared';
import { formatDate } from '../lib/utils';

type ModalType = 'virtual' | 'real' | null;

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');

  const load = useCallback(async () => {
    try {
      const { cameras: list } = await api.listCameras();
      setCameras(list);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openModal(type: CameraType) {
    setModal(type);
    setName('');
    setStreamUrl('');
    setError('');
  }

  function closeModal() {
    setModal(null);
    setName('');
    setStreamUrl('');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setSubmitting(true);
    setError('');
    try {
      await api.createCamera({
        name,
        type: modal,
        stream_url: modal === 'real' ? streamUrl : null,
      });
      setSuccess(`${modal === 'virtual' ? 'Virtual' : 'Real'} camera created`);
      closeModal();
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(camera: Camera) {
    if (!confirm(`Delete camera "${camera.name}"? All zones will be removed.`)) return;
    setError('');
    try {
      await api.deleteCamera(camera.id);
      setSuccess('Camera deleted');
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div className="page-header">
          <div>
            <h2>Cameras</h2>
            <p className="text-muted">
              Manage virtual test cameras or connect to real IP cameras. Open a camera to draw detection zones.
            </p>
          </div>
          <div className="btn-group">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openModal('virtual')}>
              Add virtual camera
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal('real')}>
              Connect real camera
            </button>
          </div>
        </div>

        {cameras.length === 0 ? (
          <div className="empty-state">
            <p>No cameras yet.</p>
            <p className="text-muted">Create a virtual camera for testing or connect a real IP camera.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Zones</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((camera) => (
                  <tr key={camera.id}>
                    <td>
                      <Link to={`/cameras/${camera.id}`}>{camera.name}</Link>
                    </td>
                    <td>
                      <span className={`badge badge-${camera.type === 'virtual' ? 'info' : 'success'}`}>
                        {camera.type === 'virtual' ? 'Virtual' : 'Real'}
                      </span>
                    </td>
                    <td>{camera.zone_count}</td>
                    <td>{formatDate(camera.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(camera)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modal === 'virtual' ? 'Create virtual camera' : 'Connect real camera'}</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label htmlFor="camera-name">Name</label>
                <input
                  id="camera-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={modal === 'virtual' ? 'Test shelf cam' : 'Store front entrance'}
                  required
                  autoFocus
                />
              </div>

              {modal === 'real' && (
                <div className="form-group">
                  <label htmlFor="stream-url">Stream URL</label>
                  <input
                    id="stream-url"
                    type="url"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder="rtsp://192.168.1.100:554/stream"
                    required
                  />
                  <p className="form-hint">Supports RTSP, HTTP, or HTTPS snapshot/stream URLs.</p>
                </div>
              )}

              {modal === 'virtual' && (
                <p className="form-hint">
                  Virtual cameras use a placeholder preview. Upload a reference frame on the camera detail page to draw zones.
                </p>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
