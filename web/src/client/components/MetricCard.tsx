import React from 'react';

type CardColor = 'purple' | 'green' | 'red' | 'yellow' | 'blue';

const COLOR_MAP: Record<CardColor, { border: string; value: string }> = {
  purple: { border: 'border-[#4F3588]', value: 'text-[#4F3588]' },
  green:  { border: 'border-emerald-500',  value: 'text-emerald-600'  },
  red:    { border: 'border-red-500',    value: 'text-red-600'    },
  yellow: { border: 'border-amber-500', value: 'text-amber-600' },
  blue:   { border: 'border-blue-500',   value: 'text-blue-600'   },
};

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  color: CardColor;
}

export default function MetricCard({ label, value, subtitle, color }: MetricCardProps) {
  const { border, value: valueColor } = COLOR_MAP[color];

  return (
    <div
      className={[
        'bg-white rounded-xl border border-gray-200 shadow-sm p-5',
        'border-l-4',
        border,
      ].join(' ')}
    >
      <p className="text-gray-500 text-sm font-medium mb-1">{label}</p>
      <p className={['text-3xl font-bold', valueColor].join(' ')}>{value}</p>
      {subtitle && <p className="text-gray-400 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
