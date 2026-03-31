import React from 'react';

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse ${className}`}>
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-2 bg-gray-100 rounded w-2/3" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-gray-100 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-16" />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-baseline justify-between animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="h-4 bg-gray-100 rounded w-32" />
      </div>

      {/* Brain */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
        <div className="h-10 bg-gray-100 rounded w-full mb-3" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>

      {/* Team Status */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-40" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 animate-pulse">
        <div className="flex gap-8">
          <div className="h-3 bg-gray-200 rounded w-20" />
          <div className="h-3 bg-gray-200 rounded w-16" />
          <div className="h-3 bg-gray-200 rounded w-16" />
          <div className="h-3 bg-gray-200 rounded w-16" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
