'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';


export default function SharedFilePage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  async function handleDownload() {
    setError('');
    setLoading(true);
    try {
      const res = await api.shared.download(params.token);
      window.open(res.url, '_blank', 'noopener,noreferrer');
      setDownloaded(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'This link is invalid or has expired'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-bold">SentinelShare</h1>
        <p className="mb-8 text-sm text-gray-500">A file has been shared with you</p>

        {error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <p className="mt-1 text-xs text-red-400">
              This link may have expired or already been revoked.
            </p>
          </div>
        ) : downloaded ? (
          <p className="text-sm text-green-600">
            Download started. Check your browser downloads.
          </p>
        ) : (
          <button
            onClick={handleDownload}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Preparing download…' : 'Download file'}
          </button>
        )}
      </div>
    </div>
  );
}
