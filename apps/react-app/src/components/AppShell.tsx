import { NavLink, Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" end>
          Contract review
        </NavLink>
        <nav className="work-nav" aria-label="Workspace">
          <NavLink to="/" end>
            Review
          </NavLink>
          <NavLink to="/status">Status</NavLink>
        </nav>
        <NavLink to="/settings" className="settings-btn">
          Settings
        </NavLink>
      </header>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}
