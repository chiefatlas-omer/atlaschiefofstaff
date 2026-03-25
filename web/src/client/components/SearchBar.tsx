import React, { useState } from 'react';

interface SearchBarProps {
  onSubmit: (query: string) => void;
  placeholder?: string;
  loading?: boolean;
}

export default function SearchBar({ onSubmit, placeholder = 'Ask a question...', loading = false }: SearchBarProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={loading}
        className={[
          'flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5',
          'text-gray-100 placeholder-gray-500 text-sm',
          'focus:outline-none focus:border-purple-500 transition-colors',
          loading ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className={[
          'px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg',
          'text-sm font-medium transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        {loading ? 'Asking...' : 'Ask'}
      </button>
    </form>
  );
}
