import React, { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const [slackId, setSlackId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slackId.trim()) return;

    setLoading(true);
    setError(null);
    const err = await login(slackId.trim());
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF9FE] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 mb-4">
            <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="42" stroke="#4F3588" strokeWidth="8" fill="none"/>
              <path d="M55 20L35 52H48L42 80L68 45H53L55 20Z" fill="#4F3588"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Atlas Command Center</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in with your Slack User ID</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Slack User ID
              </label>
              <input
                type="text"
                value={slackId}
                onChange={(e) => setSlackId(e.target.value)}
                placeholder="e.g. U06S4FYR03G"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4F3588]/20 focus:border-[#4F3588] placeholder-gray-300"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!slackId.trim() || loading}
              className="w-full py-3 bg-[#4F3588] text-white text-sm font-semibold rounded-lg hover:bg-[#5A3C9E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Instructions */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">How to find your Slack User ID:</p>
            <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Open Slack and click your <strong className="text-gray-500">profile picture</strong> (top right)</li>
              <li>Click <strong className="text-gray-500">Profile</strong></li>
              <li>Click the <strong className="text-gray-500">&#x22EE; (three dots)</strong> menu</li>
              <li>Select <strong className="text-gray-500">Copy member ID</strong></li>
              <li>Paste it above</li>
            </ol>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Don't have access? Ask your admin to add you in Settings.
        </p>
      </div>
    </div>
  );
}
