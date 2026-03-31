import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import CommandBar from './CommandBar';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

const NAV_ITEMS = [
  { label: 'Command Center', href: '/', adminOnly: false, teamAOnly: false },
  { label: 'Intelligence', href: '/intelligence', adminOnly: false, teamAOnly: true },
  { label: 'Tasks', href: '/tasks', adminOnly: false, teamAOnly: false },
  { label: 'Outcomes', href: '/outcomes', adminOnly: false, teamAOnly: false },
  { label: 'Settings', href: '/settings', adminOnly: false, teamAOnly: false },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname: currentPath } = useLocation();
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [streaks, setStreaks] = useState<{ tasks: number; calls: number; active: number } | null>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Fetch streaks for sidebar
  useEffect(() => {
    api.briefing().then((b) => {
      if (b.streaks) {
        setStreaks({
          tasks: b.streaks.tasksCompleted.current,
          calls: b.streaks.callsAnalyzed.current,
          active: b.streaks.systemActive.current,
        });
      }
    }).catch(() => {});
  }, []);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandBarOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  return (
    <div className="flex h-screen bg-[#FAFAFA] text-gray-900">
      {/* Sidebar — fixed height, never scrolls with content */}
      <aside className="w-56 h-screen sticky top-0 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
        {/* Branding */}
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="42" stroke="#4F3588" strokeWidth="8" fill="none"/>
              <path d="M55 20L35 52H48L42 80L68 45H53L55 20Z" fill="#4F3588"/>
            </svg>
            <span className="text-[#4F3588] font-bold text-lg tracking-tight">Atlas Chief</span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5 ml-9">Command Center</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS
            .filter(({ teamAOnly }) => {
              // Team B users can't see Intelligence (call coaching, sales intel)
              if (teamAOnly && !user?.isAdmin && user?.team === 'team_b') return false;
              return true;
            })
            .map(({ label, href }) => {
            const isActive =
              href === '/' ? currentPath === '/' : currentPath.startsWith(href);
            return (
              <a
                key={href}
                href={href}
                className={[
                  'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#F3F1FC] text-[#4F3588] font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                ].join(' ')}
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Streaks */}
        {streaks && (streaks.tasks > 0 || streaks.calls > 0 || streaks.active > 0) && (
          <div className="px-4 py-3 border-t border-gray-100">
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {streaks.tasks > 0 && (
                <span title={`${streaks.tasks}-day task streak`}>🔥 {streaks.tasks}d</span>
              )}
              {streaks.calls > 0 && (
                <span title={`${streaks.calls}-day call streak`}>📞 {streaks.calls}d</span>
              )}
              {streaks.active > 0 && (
                <span title={`${streaks.active} days active`}>⚡ {streaks.active}d</span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 space-y-2">
          {user && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-700 truncate">{user.displayName}</p>
                {user.isAdmin && <span className="text-[10px] text-[#4F3588] font-medium">Admin</span>}
              </div>
              <button
                onClick={logout}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
          <button
            onClick={() => setCommandBarOpen(true)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl+'}K to search
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Sticky search bar — centered and prominent */}
        <div className="sticky top-0 z-40 bg-[#FAFAFA]/80 backdrop-blur-sm border-b border-gray-200/50">
          <div className="max-w-3xl mx-auto px-8 py-3 flex items-center justify-center">
            <button
              onClick={() => setCommandBarOpen(true)}
              className="w-full max-w-xl flex items-center gap-3 text-sm text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-xl px-5 py-2.5 shadow-sm hover:shadow-md hover:border-[#4F3588]/30 transition-all"
            >
              <span className="text-[#4F3588]/40 text-base">{'\uD83D\uDD0D'}</span>
              <span className="flex-1 text-left">Search anything...</span>
              <kbd className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">Ctrl+K</kbd>
            </button>
          </div>
        </div>
        <div className="p-8">{children}</div>
      </main>

      {/* Command Bar */}
      <CommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
