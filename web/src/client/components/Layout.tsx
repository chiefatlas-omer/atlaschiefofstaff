import React from 'react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Metrics', href: '/metrics' },
  { label: 'Knowledge', href: '/knowledge' },
  { label: 'SOPs', href: '/sops' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const currentPath = window.location.pathname;

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        {/* Branding */}
        <div className="px-6 py-5 border-b border-gray-800">
          <span className="text-purple-400 font-bold text-lg tracking-tight">Atlas CoS</span>
          <p className="text-gray-500 text-xs mt-0.5">Command Center</p>
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
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
                ].join(' ')}
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800">
          <p className="text-gray-600 text-xs">Phase 4 — Web UI</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
