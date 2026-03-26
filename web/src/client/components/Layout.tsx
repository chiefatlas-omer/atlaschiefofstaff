import React from 'react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Metrics', href: '/metrics' },
  { label: 'Outcomes', href: '/outcomes' },
  { label: 'Knowledge', href: '/knowledge' },
  { label: 'SOPs', href: '/sops' },
  { label: 'Sales Intel', href: '/sales' },
  { label: 'Product Intel', href: '/product' },
  { label: 'Coaching', href: '/coaching' },
  { label: 'Upload', href: '/upload' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const currentPath = window.location.pathname;

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
        <div className="px-6 py-4 border-t border-gray-200">
          <p className="text-gray-300 text-xs">Atlas Chief of Staff</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
