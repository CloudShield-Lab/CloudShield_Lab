'use client';

import { useState } from 'react';

interface Props {
  code: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ code, language = 'bash', filename }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500">{filename ?? language}</span>
        </div>
        <button
          onClick={handleCopy}
          className={`rounded border px-2 py-1 text-xs font-mono transition-colors ${
            copied
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>

      <pre className="overflow-x-auto bg-white p-4 text-sm font-mono leading-relaxed text-slate-700">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}
