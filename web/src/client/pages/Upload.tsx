import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { api } from '../lib/api';

const DOC_TYPES = [
  { value: 'sop', label: 'SOP' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'pricing_guide', label: 'Pricing Guide' },
  { value: 'process_doc', label: 'Process Doc' },
  { value: 'customer_info', label: 'Customer Info' },
  { value: 'general', label: 'General' },
];

interface UploadResult {
  success: boolean;
  docId: string;
  chunkCount: number;
  entities: { people: number; companies: number };
}

export default function Upload() {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('general');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    if (!file.name.endsWith('.txt')) {
      setError('Only .txt files are supported. Paste other content directly.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setContent(text);
        setError(null);
        // Pre-fill title from filename if empty
        if (!title) {
          setTitle(file.name.replace(/\.txt$/, ''));
        }
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!title.trim()) { setError('Title is required.'); return; }
    if (!content.trim()) { setError('Content is required — paste text or drop a .txt file.'); return; }

    setSubmitting(true);
    try {
      const res = await api.uploadDocument({ title: title.trim(), type, content: content.trim() });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setTitle('');
    setType('general');
    setContent('');
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Upload Document</h1>
        <p className="text-gray-500 text-sm mt-1">Ingest a document into the knowledge graph</p>
      </div>

      {/* Success state */}
      {result && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-6 space-y-3">
          <p className="text-green-300 font-semibold text-base">Document ingested successfully</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">Document ID</p>
              <p className="text-gray-200 font-mono text-xs break-all">{result.docId}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">Chunks Embedded</p>
              <p className="text-gray-200 font-semibold">{result.chunkCount}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">People Detected</p>
              <p className="text-gray-200 font-semibold">{result.entities.people}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">Companies Detected</p>
              <p className="text-gray-200 font-semibold">{result.entities.companies}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="mt-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            Upload another document
          </button>
        </div>
      )}

      {/* Form */}
      {!result && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Onboarding SOP v2"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-purple-600 transition-colors"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Document Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-purple-600 transition-colors"
            >
              {DOC_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Content — textarea + drag-and-drop */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Content
            </label>

            {/* Drag-and-drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors mb-3',
                isDragging
                  ? 'border-purple-500 bg-purple-900/20'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-900/50',
              ].join(' ')}
            >
              <p className="text-gray-400 text-sm">
                Drop a <span className="text-gray-300 font-medium">.txt file</span> here, or{' '}
                <span className="text-purple-400">click to browse</span>
              </p>
              {content && (
                <p className="text-green-400 text-xs mt-1">
                  File loaded — {content.length.toLocaleString()} characters
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste document content here..."
              rows={12}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-purple-600 transition-colors resize-y"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              {submitting ? 'Ingesting...' : 'Upload Document'}
            </button>
            {(title || content) && (
              <button
                type="button"
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
