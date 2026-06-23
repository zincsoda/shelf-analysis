import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>ShelfSight</h1>
        <nav>
          <NavLink to="/cameras">Cameras</NavLink>
          <NavLink to="/perceptron-boxes">Perceptron Boxes</NavLink>
          <NavLink to="/" end>
            Analyse
          </NavLink>
          <NavLink to="/settings">Settings</NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin">Admin</NavLink>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => logout()}>
            Logout
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
