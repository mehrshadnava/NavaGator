import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderKanban },
  { path: '/teams', label: 'Teams', icon: Users },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className="relative flex flex-col border-r border-border bg-card shadow-[1px_0_0_0_var(--color-border)] transition-all duration-300 shrink-0"
        style={{ width: collapsed ? 64 : 220 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border overflow-hidden">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <FolderKanban className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="whitespace-nowrap overflow-hidden">
              ProjectHub
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-hidden">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              title={collapsed ? label : undefined}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group',
                isActive(path)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <span className="whitespace-nowrap overflow-hidden">{label}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-colors z-10"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] shrink-0">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 w-72">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search projects, tasks..."
              className="bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground w-full"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="relative h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center transition-colors">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            </button>
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs text-primary-foreground">SJ</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
