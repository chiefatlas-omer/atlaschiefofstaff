import React from 'react';

type CardColor = 'purple' | 'green' | 'red' | 'yellow' | 'blue';

const COLOR_MAP: Record<CardColor, { border: string; value: string }> = {
  purple: { border: 'border-purple-500', value: 'text-purple-400' },
  green:  { border: 'border-green-500',  value: 'text-green-400'  },
  red:    { border: 'border-red-500',    value: 'text-red-400'    },
  yellow: { border: 'border-yellow-500', value: 'text-yellow-400' },
  blue:   { border: 'border-blue-500',   value: 'text-blue-400'   },
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
        'bg-gray-900 rounded-xl border border-gray-800 p-5',
        'border-l-4',
        border,
      ].join(' ')}
    >
      <p className="text-gray-400 text-sm font-medium mb-1">{label}</p>
      <p className={['text-3xl font-bold', valueColor].join(' ')}>{value}</p>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
