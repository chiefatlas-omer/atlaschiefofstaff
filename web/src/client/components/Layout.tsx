import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CommandBar from './CommandBar';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Intelligence', href: '/intelligence' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Knowledge', href: '/knowledge' },
  { label: 'Outcomes', href: '/outcomes' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const currentPath = window.location.pathname;
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const navigate = useNavigate();

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
    <div className="flex min-h-screen bg-[#FAFAFA] text-gray-900">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Branding */}
        <div className="px-6 py-5 border-b border-gray-200">
          <span className="text-[#4F3588] font-bold text-lg tracking-tight">Atlas CoS</span>
          <p className="text-gray-400 text-xs mt-0.5">Command Center</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ label, href }) => {
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => setCommandBarOpen(true)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ⌘K to search
          </button>
          <p className="text-gray-300 text-xs">Atlas Chief of Staff</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>

      {/* Command Bar */}
      <CommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
