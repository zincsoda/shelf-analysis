import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AnalysisWithUser, User, UserRole } from '@shelf-analysis/shared';
import { formatConfidence, formatDate, formatPercent } from '../lib/utils';

type ModalType = 'create' | 'reset' | 'role' | null;

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Create user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');

  // Reset password form
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const [usersRes, analysesRes] = await Promise.all([
        api.listUsers(),
        api.listAnalyses(),
      ]);
      setUsers(usersRes.users);
      setAnalyses(analysesRes.analyses as AnalysisWithUser[]);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.createUser({ email: newEmail, password: newPassword, role: newRole });
      setSuccess('User created');
      setModal(null);
      setNewEmail('');
      setNewPassword('');
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setError('');
    try {
      await api.updateUser(selectedUser.id, { password: resetPassword });
      setSuccess(`Password reset for ${selectedUser.email}`);
      setModal(null);
      setResetPassword('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function toggleActive(user: User) {
    setError('');
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      setSuccess(`User ${user.is_active ? 'disabled' : 'enabled'}`);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function toggleRole(user: User) {
    setError('');
    const newRole: UserRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await api.updateUser(user.id, { role: newRole });
      setSuccess(`Role updated to ${newRole}`);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleDelete(user: User) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    setError('');
    try {
      await api.deleteUser(user.id);
      setSuccess('User deleted');
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>User Management</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>
            Create User
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge badge-${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${u.is_active ? 'active' : 'disabled'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleRole(u)}
                      >
                        Toggle Role
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setSelectedUser(u); setModal('reset'); }}
                      >
                        Reset Password
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u)}
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
      </div>

      <div className="card">
        <h2>All Analyses</h2>
        {analyses.length === 0 ? (
          <div className="empty-state">No analyses yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
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
                    <td>{a.user_email}</td>
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

      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create User</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'reset' && selectedUser && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Password — {selectedUser.email}</h3>
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
