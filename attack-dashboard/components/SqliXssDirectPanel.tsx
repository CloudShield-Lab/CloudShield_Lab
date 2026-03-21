'use client';

import { useState } from 'react';
import type { DashboardConfig, WorkspaceMode } from '@/types';

// <script> 태그는 innerHTML/dangerouslySetInnerHTML로 실행되지 않으므로
// 이벤트 핸들러 기반 XSS 페이로드를 사용 (브라우저 보안 표준)
const XSS_PAYLOADS = [
  {
    label: 'img onerror',
    payload: '<img src=x onerror=alert("XSS!")>',
    desc: 'img 로드 실패 → onerror 핸들러 실행',
  },
  {
    label: 'svg onload',
    payload: '<svg onload=alert("XSS!")>',
    desc: 'SVG 렌더링 시 onload 핸들러 실행',
  },
  {
    label: 'body onload',
    payload: '<body onload=alert("XSS!")>',
    desc: 'body 태그 onload 이벤트 실행',
  },
];

interface Props {
  mode: WorkspaceMode;
  config: DashboardConfig;
}

export function SqliXssDirectPanel({ mode, config }: Props) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const vulnFrontendUrl =
    mode === 'auto' ? config.autoVulnerable.frontendUrl : config.vulnerable.frontendUrl;
  const awsFrontendUrl =
    mode === 'auto' ? config.autoAws.frontendUrl : config.aws.frontendUrl;

  const vulnLoginUrl = vulnFrontendUrl ? `${vulnFrontendUrl.replace(/\/$/, '')}/login` : '';
  const awsLoginUrl = awsFrontendUrl ? `${awsFrontendUrl.replace(/\/$/, '')}/login` : '';

  const handleCopy = (payload: string, index: number) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(payload).then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      });
    } else {
      // clipboard API 미지원 환경 fallback
      const el = document.createElement('textarea');
      el.value = payload;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs">
          🧪
        </span>
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-slate-900">XSS 직접 체험</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            아래 구문을 복사해 각 환경 로그인 페이지의 Email 필드에 입력하고 제출해보세요.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        {/* 페이로드 목록 */}
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            XSS 페이로드 선택
          </div>
          <div className="space-y-2">
            {XSS_PAYLOADS.map((item, i) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </div>
                  <code className="block truncate font-mono text-xs text-red-600">
                    {item.payload}
                  </code>
                  <p className="mt-0.5 text-[11px] text-slate-400">{item.desc}</p>
                </div>
                <button
                  onClick={() => handleCopy(item.payload, i)}
                  className={`flex-shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    copiedIndex === i
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  {copiedIndex === i ? '복사됨 ✓' : '복사'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 환경 링크 + 안내 */}
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            로그인 페이지에서 직접 테스트
          </div>

          <div className="mb-4 space-y-2">
            {/* 취약 환경 링크 */}
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-xs font-semibold text-red-700">취약 환경</span>
                <span className="ml-auto rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-mono text-red-600">
                  dangerouslySetInnerHTML
                </span>
              </div>
              <p className="mb-2 text-[11px] text-red-600">
                XSS 페이로드가 에러 메시지에 반사되어 브라우저에서 실행됩니다.
              </p>
              {vulnLoginUrl ? (
                <a
                  href={vulnLoginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  취약 환경 로그인 페이지 열기 ↗
                </a>
              ) : (
                <span className="text-xs text-red-400">URL 미구성 — 대시보드에서 취약 환경 URL을 설정하세요</span>
              )}
            </div>

            {/* 보안 환경 링크 */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">보안 환경</span>
                <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-mono text-emerald-600">
                  WAF KnownBadInputs
                </span>
              </div>
              <p className="mb-2 text-[11px] text-emerald-700">
                WAF가 POST body의 XSS 패턴을 감지해 요청 자체를 차단합니다.
              </p>
              {awsLoginUrl ? (
                <a
                  href={awsLoginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  보안 환경 로그인 페이지 열기 ↗
                </a>
              ) : (
                <span className="text-xs text-emerald-600">URL 미구성 — 대시보드에서 보안 환경 URL을 설정하세요</span>
              )}
            </div>
          </div>

          {/* 체험 순서 안내 */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              체험 순서
            </div>
            <ol className="space-y-1 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 font-semibold text-slate-400">①</span>
                위 페이로드 중 하나를 <span className="font-semibold text-red-600">복사</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 font-semibold text-slate-400">②</span>
                각 환경 로그인 페이지 <span className="font-semibold">Email 필드</span>에 붙여넣기
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 font-semibold text-slate-400">③</span>
                아무 비밀번호 입력 후 제출
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 font-semibold text-slate-400">④</span>
                취약 환경: <span className="font-semibold text-red-600">alert 팝업 발생</span> /
                보안 환경: <span className="font-semibold text-emerald-600">WAF 차단</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
