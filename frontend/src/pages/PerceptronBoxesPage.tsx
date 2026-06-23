import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { PerceptronBox, PerceptronBoxWithToken } from '@shelf-analysis/shared';
import { formatDate } from '../lib/utils';

export default function PerceptronBoxesPage() {
  const [boxes, setBoxes] = useState<PerceptronBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingBox, setEditingBox] = useState<PerceptronBox | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [pollInterval, setPollInterval] = useState(60);
  const [newBoxToken, setNewBoxToken] = useState<PerceptronBoxWithToken | null>(null);

  const load = useCallback(async () => {
    try {
      const { boxes: list } = await api.listPerceptronBoxes();
      setBoxes(list);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreateModal() {
    setModalMode('create');
    setEditingBox(null);
    setName('');
    setPollInterval(60);
    setError('');
  }

  function openEditModal(box: PerceptronBox) {
    setModalMode('edit');
    setEditingBox(box);
    setName(box.name);
    setError('');
  }

  function closeModal() {
    setModalMode(null);
    setEditingBox(null);
    setName('');
    setPollInterval(60);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (modalMode === 'edit' && editingBox) {
        const { box } = await api.updatePerceptronBox(editingBox.id, { name });
        closeModal();
        setSuccess(`Perceptron Box renamed to "${box.name}"`);
      } else {
        const { box } = await api.createPerceptronBox({
          name,
          poll_interval_seconds: pollInterval,
        });
        setNewBoxToken(box);
        closeModal();
        setSuccess(`Perceptron Box "${box.name}" created`);
      }
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(box: PerceptronBox) {
    if (!confirm(`Delete Perceptron Box "${box.name}"? Assigned cameras will be unlinked.`)) return;
    setError('');
    try {
      await api.deletePerceptronBox(box.id);
      setSuccess('Perceptron Box deleted');
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleRegenerateToken(box: PerceptronBox) {
    if (
      !confirm(
        `Regenerate device token for "${box.name}"? The current token will stop working immediately.`,
      )
    ) {
      return;
    }
    setError('');
    try {
      const { box: updated } = await api.regenerateDeviceToken(box.id);
      setNewBoxToken(updated);
      setSuccess(`New device token generated for "${updated.name}"`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setSuccess('Device token copied to clipboard');
    } catch {
      setError('Could not copy token — select and copy manually');
    }
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {newBoxToken && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--accent)' }}>
          <h3>Device token for {newBoxToken.name}</h3>
          <p className="text-muted">
            Configure this token on your Perceptron Box. It is shown only once — copy it now.
          </p>
          <code
            style={{
              display: 'block',
              padding: '0.75rem',
              background: 'var(--bg)',
              borderRadius: '8px',
              wordBreak: 'break-all',
              marginBottom: '0.75rem',
            }}
          >
            {newBoxToken.device_token}
          </code>
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => copyToken(newBoxToken.device_token)}
            >
              Copy token
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setNewBoxToken(null)}
            >
              Dismiss
            </button>
          </div>
          <p className="form-hint" style={{ marginTop: '0.75rem' }}>
            The box polls <code>GET /api/device/config</code> and uploads snapshots to{' '}
            <code>POST /api/device/cameras/:id/snapshot</code> with{' '}
            <code>Authorization: Bearer &lt;token&gt;</code>.
          </p>
        </div>
      )}

      <div className="card">
        <div className="page-header">
          <div>
            <h2>Perceptron Boxes</h2>
            <p className="text-muted">
              Edge devices that poll IP cameras on your local network and upload snapshots to ShelfSight.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreateModal}>
            Add Perceptron Box
          </button>
        </div>

        {boxes.length === 0 ? (
          <div className="empty-state">
            <p>No Perceptron Boxes yet.</p>
            <p className="text-muted">
              Create a box, install the token on your edge device, then assign real cameras to it.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Cameras</th>
                  <th>Poll interval</th>
                  <th>Last seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {boxes.map((box) => (
                  <tr key={box.id}>
                    <td>{box.name}</td>
                    <td>
                      {box.camera_count}{' '}
                      {box.camera_count > 0 && (
                        <Link to="/cameras" className="text-muted">
                          view
                        </Link>
                      )}
                    </td>
                    <td>{box.poll_interval_seconds}s</td>
                    <td>{box.last_seen_at ? formatDate(box.last_seen_at) : 'Never'}</td>
                    <td>
                      <div className="btn-group">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditModal(box)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRegenerateToken(box)}
                        >
                          New token
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(box)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMode && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modalMode === 'edit' ? 'Edit Perceptron Box' : 'Add Perceptron Box'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="box-name">Name</label>
                <input
                  id="box-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Store 12 back room"
                  required
                  autoFocus
                />
              </div>
              {modalMode === 'create' && (
                <div className="form-group">
                  <label htmlFor="poll-interval">Snapshot poll interval (seconds)</label>
                  <input
                    id="poll-interval"
                    type="number"
                    min={10}
                    step={1}
                    value={pollInterval}
                    onChange={(e) => setPollInterval(Number(e.target.value))}
                    required
                  />
                  <p className="form-hint">How often the edge device fetches snapshots from assigned cameras.</p>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? modalMode === 'edit'
                      ? 'Saving…'
                      : 'Creating…'
                    : modalMode === 'edit'
                      ? 'Save'
                      : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
