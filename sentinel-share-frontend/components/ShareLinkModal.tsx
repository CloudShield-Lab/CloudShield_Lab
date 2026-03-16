'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { FileRecord, ShareLink } from '@/types';

interface ShareLinkModalProps {
  file: FileRecord;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '1 hour', value: 1 },
  { label: '24 hours', value: 24 },
  { label: '72 hours', value: 72 },
  { label: '7 days', value: 168 },
];

export default function ShareLinkModal({ file, onClose }: ShareLinkModalProps) {
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const shareUrl = shareLink
    ? `${window.location.origin}/shared?token=${shareLink.token}`
    : '';

  async function handleGenerate() {
    setError('');
    setLoading(true);
    try {
      const res = await api.files.share(file.id, expiresInHours);
      setShareLink(res.shareLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const el = document.createElement('textarea');
      el.value = shareUrl;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share file</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="mb-4 truncate text-sm text-gray-600">{file.original_name}</p>

        {!shareLink ? (
          <>
            <label className="mb-1 block text-sm font-medium">Link expires in</label>
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate link'}
            </button>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span className="flex-1 truncate text-sm font-mono text-gray-700">{shareUrl}</span>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Expires:{' '}
              {new Date(shareLink.expires_at).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
