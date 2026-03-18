'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AnalysisSession } from '@/types';

interface Props {
  session: AnalysisSession;
  s3Key: string;
}

export function AiAnalysisPanel({ session, s3Key }: Props) {
  const [lang, setLang] = useState<'ko' | 'en'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('sentinelshare_analysis_lang') as 'ko' | 'en') ?? 'ko';
    }
    return 'ko';
  });
  const [analysisText, setAnalysisText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef('');

  // Reset when session changes
  useEffect(() => {
    setAnalysisText('');
    setError(null);
    setIsStreaming(false);
    textRef.current = '';
    abortRef.current?.abort();
  }, [session.sessionId]);

  const handleLangChange = useCallback((next: 'ko' | 'en') => {
    setLang(next);
    localStorage.setItem('sentinelshare_analysis_lang', next);
    // Reset analysis when lang changes
    setAnalysisText('');
    setError(null);
    textRef.current = '';
    abortRef.current?.abort();
  }, []);

  const startAnalysis = useCallback(async () => {
    if (isStreaming) return;

    setAnalysisText('');
    setError(null);
    setIsStreaming(true);
    textRef.current = '';

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key, lang }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const msg = await response.text();
        setError(msg || `HTTP ${response.status}`);
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        setError('응답 스트림을 읽을 수 없습니다');
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          try {
            const event = JSON.parse(jsonStr) as { type: string; text?: string; message?: string };
            if (event.type === 'chunk' && event.text) {
              textRef.current += event.text;
              setAnalysisText(textRef.current);
            } else if (event.type === 'done') {
              setIsStreaming(false);
              return;
            } else if (event.type === 'error') {
              setError(event.message ?? '분석 중 오류가 발생했습니다');
              setIsStreaming(false);
              return;
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
      setIsStreaming(false);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : '분석 요청에 실패했습니다');
      setIsStreaming(false);
    }
  }, [isStreaming, s3Key, lang]);

  const vulnBlocked = session.vulnResults.filter((r) => r.blocked).length;
  const secureBlocked = session.secureResults.filter((r) => r.blocked).length;
  const vulnTotal = session.vulnResults.length;
  const secureTotal = session.secureResults.length;
  const vulnBlockRate = vulnTotal > 0 ? Math.round((vulnBlocked / vulnTotal) * 100) : 0;
  const secureBlockRate = secureTotal > 0 ? Math.round((secureBlocked / secureTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Session metrics summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wider text-red-500">취약 차단율</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{vulnBlockRate}%</div>
          <div className="text-[10px] text-red-400">{vulnBlocked}/{vulnTotal}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">보안 차단율</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{secureBlockRate}%</div>
          <div className="text-[10px] text-emerald-400">{secureBlocked}/{secureTotal}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">취약 응답시간</div>
          <div className="mt-1 text-2xl font-bold text-slate-700">{session.metrics.vuln.avgLatency}</div>
          <div className="text-[10px] text-slate-400">ms avg</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">보안 응답시간</div>
          <div className="mt-1 text-2xl font-bold text-slate-700">{session.metrics.secure.avgLatency}</div>
          <div className="text-[10px] text-slate-400">ms avg</div>
        </div>
      </div>

      {/* AI analysis section */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <span className="text-sm font-semibold text-slate-800">AI 보안 분석</span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
              Amazon Bedrock
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <div className="flex overflow-hidden rounded-lg border border-slate-200">
              <button
                onClick={() => handleLangChange('ko')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  lang === 'ko' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                KO
              </button>
              <button
                onClick={() => handleLangChange('en')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  lang === 'en' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                EN
              </button>
            </div>
            <button
              onClick={startAnalysis}
              disabled={isStreaming}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isStreaming
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                  : analysisText
                  ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'border-violet-500 bg-violet-500 text-white hover:bg-violet-600'
              }`}
            >
              {isStreaming ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                  분석 중...
                </span>
              ) : analysisText ? (
                '다시 분석'
              ) : (
                'AI 분석 시작'
              )}
            </button>
          </div>
        </div>

        <div className="p-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              오류: {error}
            </div>
          )}

          {!analysisText && !error && !isStreaming && (
            <div className="py-8 text-center text-sm text-slate-400">
              <p className="text-3xl">✨</p>
              <p className="mt-2">AI 분석 시작 버튼을 눌러 보안 분석을 받아보세요</p>
              <p className="mt-1 text-xs text-slate-300">Amazon Bedrock (Claude)가 공격 결과를 분석합니다</p>
            </div>
          )}

          {(analysisText || isStreaming) && (
            <div className="prose prose-sm max-w-none text-slate-700">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="mb-2 mt-4 text-sm font-bold text-slate-900 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mb-1.5 mt-3 text-xs font-semibold text-slate-800">{children}</h3>
                  ),
                  p: ({ children }) => <p className="mb-2 text-sm leading-6 text-slate-700">{children}</p>,
                  li: ({ children }) => (
                    <li className="mb-1 text-sm leading-5 text-slate-700">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-slate-900">{children}</strong>
                  ),
                  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                }}
              >
                {analysisText}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-400" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
