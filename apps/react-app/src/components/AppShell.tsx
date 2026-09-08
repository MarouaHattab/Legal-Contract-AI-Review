import { NavLink, Outlet } from "react-router-dom";
import { IconEmail, IconGithub, IconLinkedin } from "./Icons";

const creatorLinks = {
  github:
    import.meta.env.VITE_CREATOR_GITHUB_URL ||
    "https://github.com/MarouaHattab/Hierarchical-RL-Agents-for-Legal-Contract-Analysis",
  email:
    import.meta.env.VITE_CREATOR_EMAIL_URL ||
    "mailto:maroua.hattab@polytechnicien.tn",
  linkedin: import.meta.env.VITE_CREATOR_LINKEDIN_URL || "",
};

function ExternalLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        className="social-link disabled"
        aria-label={`${label} link is not configured`}
        title={`${label} link is not configured`}
      >
        {children}
      </span>
    );
  }
  return (
    <a
      className="social-link"
      href={href}
      aria-label={label}
      title={label}
      target={href.startsWith("mailto:") ? undefined : "_blank"}
      rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
    >
      {children}
    </a>
  );
}

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" end>
          <span className="brand-name">Contract review</span>
        </NavLink>
        <nav className="work-nav" aria-label="Workspace">
          <NavLink to="/" end>
            Review
          </NavLink>
          <NavLink to="/status">Status</NavLink>
        </nav>
        <NavLink to="/settings" className="settings-link">
          Settings
        </NavLink>
      </header>
      <main className="workspace">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p>
          Created by <strong>Eng. Maroua Hattab</strong>
        </p>
        <nav className="social-links" aria-label="Creator links">
          <ExternalLink href={creatorLinks.linkedin} label="LinkedIn profile">
            <IconLinkedin />
          </ExternalLink>
          <ExternalLink href={creatorLinks.github} label="GitHub repository">
            <IconGithub />
          </ExternalLink>
          <ExternalLink href={creatorLinks.email} label="Email Maroua Hattab">
            <IconEmail />
          </ExternalLink>
        </nav>
      </footer>
    </div>
  );
}
