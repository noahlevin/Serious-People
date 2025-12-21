import { Link } from "react-router-dom";
import { UserMenu } from "@/components/UserMenu";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="sp-shell">
      <header className="sp-shell-header">
        <div className="sp-container sp-shell-header-inner">
          <Link to="/interview/start" className="sp-shell-logo">
            Serious People
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="sp-shell-main">
        {children}
      </main>
      <footer className="sp-shell-footer">
        <div className="sp-container">
          <p>&copy; {new Date().getFullYear()} Serious People</p>
        </div>
      </footer>
    </div>
  );
}
