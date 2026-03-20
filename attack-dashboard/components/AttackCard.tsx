'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useArchitectureVisualization } from '@/hooks/useArchitectureVisualization';
import type {
  AttackEndpoint,
  AttackEvent,
  AttackPhase,
  AttackResult,
  DashboardConfig,
  SessionMetrics,
  WorkspaceMode,
} from '@/types';
import { MetricsPanel } from './MetricsPanel';
import { RequestLog } from './RequestLog';

function computeMetrics(results: AttackResult[]): SessionMetrics {
  const total = results.length;
  const blocked = results.filter((result) => result.blocked).length;
  const avgLatency =
    total > 0 ? Math.round(results.reduce((sum, result) => sum + result.latency, 0) / total) : 0;
  return { blocked, total, avgLatency };
}

interface CapturedCredential {
  email: string;
  password: string;
}

interface Props {
  index: number;
  title: string;
  description: string;
  endpoint: AttackEndpoint;
  totalRequests: number;
  attackParams?: string;
  vulnNote: string;
  awsNote: string;
  mode: WorkspaceMode;
}

type EvidenceStatus = 'reached' | 'blocked' | 'failed';
type EvidenceDisplayStatus = 'pending' | 'running' | 'reached' | 'blocked' | 'failed' | 'not_configured';

const SQLI_XSS_ATTEMPTS = [
  { name: 'SQLI OR 1=1', value: `' OR 1=1 --` },
  { name: 'XSS Script Tag', value: `<script>alert(1)</script>` },
  { name: 'XSS javascript URI', value: `javascript:alert(1)` },
  { name: 'SQLI UNION SELECT', value: `UNION SELECT password FROM users` },
  { name: 'XSS Img onerror', value: `<img src=x onerror=alert(1)>` },
  { name: 'SQLI DROP TABLE', value: `DROP TABLE users;` },
];

const BOT_SCAN_ATTEMPTS = [
  { name: 'Admin Probe', path: '/admin' },
  { name: 'WordPress Login Probe', path: '/wp-login.php' },
  { name: 'Env File Probe', path: '/.env' },
  { name: 'phpMyAdmin Probe', path: '/phpmyadmin' },
  { name: 'Server Status Probe', path: '/server-status' },
  { name: 'Hidden Config Probe', path: '/config.bak' },
];

const MANUAL_VULNERABLE_ORIGIN_STORAGE_KEY = 'sentinelshare_manual_vulnerable_origin_url';
const MANUAL_SECURE_ORIGIN_STORAGE_KEY = 'sentinelshare_manual_secure_origin_url';

function getResultTone(status: EvidenceStatus | EvidenceDisplayStatus) {
  if (status === 'blocked') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'reached') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'running') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'not_configured') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getStatusBadge(status: EvidenceStatus | EvidenceDisplayStatus, env: 'vulnerable' | 'aws') {
  if (status === 'blocked') return '차단';
  if (status === 'failed') return env === 'aws' ? '연결 실패' : '실패';
  return env === 'vulnerable' ? '앱 도달' : '통과';
}

function inferResultStatus(result?: AttackResult): EvidenceStatus {
  if (!result) return 'failed';
  if (result.blocked) return 'blocked';
  if (result.status > 0) return 'reached';
  return 'failed';
}

function formatLatency(result?: AttackResult) {
  if (!result || result.latency <= 0) return '-';
  return `${result.latency}ms`;
}

function formatStatus(result?: AttackResult) {
  if (!result) return 'ERR';
  return result.status > 0 ? String(result.status) : 'ERR';
}

function getEvidenceDisplayStatus(
  result: AttackResult | undefined,
  phase: AttackPhase,
  index: number,
  completedCount: number,
): EvidenceDisplayStatus {
  if (!result) {
    if (phase === 'running' && index === completedCount) return 'running';
    return 'pending';
  }

  if (result.status === -1 || result.label === 'AWS URL NOT CONFIGURED') {
    return 'not_configured';
  }

  if (result.blocked) {
    return 'blocked';
  }

  if (result.error === 'connection_refused' || result.status === 0) {
    return 'failed';
  }

  if (result.status > 0) {
    return 'reached';
  }

  return 'failed';
}

function getEvidenceTone(status: EvidenceDisplayStatus) {
  if (status === 'blocked') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'reached') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'running') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'not_configured') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (status === 'pending') return 'border-slate-200 bg-slate-50 text-slate-500';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getEvidenceBadge(
  status: EvidenceDisplayStatus,
  labels: { reached: string; blocked: string },
) {
  if (status === 'pending') return '대기';
  if (status === 'running') return '시도 중';
  if (status === 'not_configured') return '미구성';
  if (status === 'failed') return '연결 실패';
  if (status === 'blocked') return labels.blocked;
  return labels.reached;
}

function getEvidenceMeta(result: AttackResult | undefined, status: EvidenceDisplayStatus) {
  if (status === 'pending') return '아직 실행하지 않았습니다.';
  if (status === 'running') return '요청 전송 후 응답을 기다리는 중입니다.';
  if (status === 'not_configured') return '대상 URL이 아직 설정되지 않았습니다.';
  if (status === 'failed') return '연결 거부 또는 타임아웃이 발생했습니다.';
  if (!result) return '-';
  return `HTTP ${result.status} · ${formatLatency(result)}`;
}

function getSqliEvidenceMeta(env: 'vulnerable' | 'aws', result: AttackResult | undefined, status: EvidenceDisplayStatus) {
  if (status === 'failed') {
    return env === 'vulnerable'
      ? '보호 계층 없이 원본 애플리케이션까지 직접 시도했지만 연결되지 않았습니다.'
      : 'CloudFront/WAF 경유 여부를 확인하기 전에 원본 연결 단계에서 실패했습니다.';
  }

  return getEvidenceMeta(result, status);
}

function getBotEvidenceMeta(env: 'vulnerable' | 'aws', result: AttackResult | undefined, status: EvidenceDisplayStatus) {
  if (status === 'failed') {
    return env === 'vulnerable'
      ? '숨은 경로 요청을 원본으로 직접 보냈지만 연결에 실패했습니다.'
      : 'CloudFront 경유 여부와 무관하게 원본 연결 단계에서 실패했습니다.';
  }

  return getEvidenceMeta(result, status);
}

function EvidenceSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-200 p-4">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SqliXssEvidenceV2({
  phase,
  vulnResults,
  awsResults,
}: {
  phase: AttackPhase;
  vulnResults: AttackResult[];
  awsResults: AttackResult[];
}) {
  const summary = useMemo(() => {
    const vulnerable = SQLI_XSS_ATTEMPTS.map((_, index) =>
      getEvidenceDisplayStatus(vulnResults[index], phase, index, vulnResults.length),
    );
    const secure = SQLI_XSS_ATTEMPTS.map((_, index) =>
      getEvidenceDisplayStatus(awsResults[index], phase, index, awsResults.length),
    );

    return {
      vulnerableReached: vulnerable.filter((status) => status === 'reached').length,
      vulnerableFailed: vulnerable.filter((status) => status === 'failed').length,
      secureBlocked: secure.filter((status) => status === 'blocked').length,
      secureReached: secure.filter((status) => status === 'reached').length,
      secureFailed: secure.filter((status) => status === 'failed').length,
    };
  }, [awsResults, phase, vulnResults]);

  return (
    <EvidenceSection
      title="Pattern Evidence"
      description="실행 전에는 대기 상태를 보여주고, 실행 후에는 앱 도달 여부와 WAF 차단 여부를 패턴별로 더 명확하게 확인할 수 있습니다."
    >
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[1.1fr_1.6fr_1.15fr_1.15fr_0.9fr] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <span>패턴</span>
          <span>전송 값</span>
          <span>취약 환경</span>
          <span>보안 환경</span>
          <span>차단 위치</span>
        </div>
        <div className="divide-y divide-slate-200">
          {SQLI_XSS_ATTEMPTS.map((pattern, index) => {
            const vulnResult = vulnResults[index];
            const awsResult = awsResults[index];
            const vulnStatus = getEvidenceDisplayStatus(vulnResult, phase, index, vulnResults.length);
            const awsStatus = getEvidenceDisplayStatus(awsResult, phase, index, awsResults.length);

            const blockPoint =
              awsStatus === 'blocked'
                ? 'WAF'
                : awsStatus === 'reached'
                  ? '앱 도달'
                  : awsStatus === 'not_configured'
                    ? '미구성'
                    : awsStatus === 'running'
                      ? '판정 중'
                      : awsStatus === 'pending'
                        ? '-'
                        : '연결 실패';

            return (
              <div
                key={pattern.name}
                className="grid grid-cols-[1.1fr_1.6fr_1.15fr_1.15fr_0.9fr] items-center px-4 py-3 text-sm"
              >
                <div className="font-semibold text-slate-800">{pattern.name}</div>
                <code className="truncate pr-3 font-mono text-xs text-slate-500">{pattern.value}</code>
                <div className="flex flex-col items-start gap-1">
                  <span className={`rounded-lg border px-2.5 py-1 text-center text-xs font-medium ${getEvidenceTone(vulnStatus)}`}>
                    {getEvidenceBadge(vulnStatus, { reached: '앱 도달', blocked: '차단' })}
                  </span>
                  <span className="text-[11px] text-slate-400">{getSqliEvidenceMeta('vulnerable', vulnResult, vulnStatus)}</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className={`rounded-lg border px-2.5 py-1 text-center text-xs font-medium ${getEvidenceTone(awsStatus)}`}>
                    {getEvidenceBadge(awsStatus, { reached: '앱 도달', blocked: 'WAF 차단' })}
                  </span>
                  <span className="text-[11px] text-slate-400">{getSqliEvidenceMeta('aws', awsResult, awsStatus)}</span>
                </div>
                <span className="text-xs font-medium text-slate-600">{blockPoint}</span>
              </div>
            );
          })}
        </div>
      </div>
    </EvidenceSection>
  );
}

function BotScanEvidenceV2({
  phase,
  vulnResults,
  awsResults,
}: {
  phase: AttackPhase;
  vulnResults: AttackResult[];
  awsResults: AttackResult[];
}) {
  const summary = useMemo(() => {
    const vulnerable = BOT_SCAN_ATTEMPTS.map((_, index) =>
      getEvidenceDisplayStatus(vulnResults[index], phase, index, vulnResults.length),
    );
    const secure = BOT_SCAN_ATTEMPTS.map((_, index) =>
      getEvidenceDisplayStatus(awsResults[index], phase, index, awsResults.length),
    );

    return {
      vulnerableReached: vulnerable.filter((status) => status === 'reached').length,
      vulnerableFailed: vulnerable.filter((status) => status === 'failed').length,
      vulnerablePending: vulnerable.filter((status) => status === 'pending' || status === 'running').length,
      secureBlocked: secure.filter((status) => status === 'blocked').length,
      secureReached: secure.filter((status) => status === 'reached').length,
      secureFailed: secure.filter((status) => status === 'failed').length,
      secureNotConfigured: secure.filter((status) => status === 'not_configured').length,
      securePending: secure.filter((status) => status === 'pending' || status === 'running').length,
    };
  }, [awsResults, phase, vulnResults]);

  return (
    <EvidenceSection
      title="Scan Evidence"
      description="실행 전 대기 상태와 실행 후 실제 원본 도달, 앞단 차단, 연결 실패를 분리해서 보여주므로 결과 해석이 더 쉬워집니다."
    >
      <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
            <span>스캔 경로</span>
            <span>취약 환경</span>
            <span>보안 환경</span>
          </div>
          <div className="divide-y divide-slate-200">
            {BOT_SCAN_ATTEMPTS.map((scan, index) => {
              const vulnResult = vulnResults[index];
              const awsResult = awsResults[index];
              const vulnStatus = getEvidenceDisplayStatus(vulnResult, phase, index, vulnResults.length);
              const awsStatus = getEvidenceDisplayStatus(awsResult, phase, index, awsResults.length);

              return (
                <div key={scan.path} className="grid grid-cols-[1.2fr_1fr_1fr] items-center px-4 py-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-800">{scan.path}</div>
                    <div className="text-xs text-slate-400">{scan.name}</div>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <span className={`w-fit rounded-lg border px-2.5 py-1 text-xs font-medium ${getEvidenceTone(vulnStatus)}`}>
                      {getEvidenceBadge(vulnStatus, { reached: '원본 도달', blocked: '차단' })}
                    </span>
                    <span className="text-[11px] text-slate-400">{getBotEvidenceMeta('vulnerable', vulnResult, vulnStatus)}</span>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <span className={`w-fit rounded-lg border px-2.5 py-1 text-xs font-medium ${getEvidenceTone(awsStatus)}`}>
                      {getEvidenceBadge(awsStatus, { reached: '원본 도달', blocked: '앞단 차단' })}
                    </span>
                    <span className="text-[11px] text-slate-400">{getBotEvidenceMeta('aws', awsResult, awsStatus)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">취약 환경</div>
            <div className="mt-3 text-2xl font-bold text-red-700">{summary.vulnerableReached}</div>
            <div className="mt-1 text-sm text-red-700">원본 도달 경로 수</div>
            <div className="mt-3 space-y-1 border-t border-red-200 pt-3 text-sm text-slate-600">
              <div>연결 실패: <span className="font-semibold text-slate-800">{summary.vulnerableFailed}</span></div>
              <div>대기/진행 중: <span className="font-semibold text-slate-800">{summary.vulnerablePending}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">보안 환경</div>
            <div className="mt-3 text-2xl font-bold text-emerald-700">{summary.secureBlocked}</div>
            <div className="mt-1 text-sm text-emerald-700">앞단 차단 경로 수</div>
            <div className="mt-3 space-y-1 border-t border-emerald-200 pt-3 text-sm text-slate-600">
              <div>원본 도달: <span className="font-semibold text-slate-800">{summary.secureReached}</span></div>
              <div>연결 실패: <span className="font-semibold text-slate-800">{summary.secureFailed}</span></div>
              <div>미구성: <span className="font-semibold text-slate-800">{summary.secureNotConfigured}</span></div>
              <div>대기/진행 중: <span className="font-semibold text-slate-800">{summary.securePending}</span></div>
            </div>
          </div>
        </div>
      </div>
    </EvidenceSection>
  );
}

function OriginDirectEvidence({
  phase,
  vulnResults,
  awsResults,
}: {
  phase: AttackPhase;
  vulnResults: AttackResult[];
  awsResults: AttackResult[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const vulnerable = vulnResults[0];
  const secure = awsResults[0];

  const copy = useCallback(async (key: string, value?: string) => {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {}
  }, []);

  return (
    <EvidenceSection
      title="Origin Evidence"
      description="실제로 어떤 원본 주소를 직접 때렸고 어떤 응답이 왔는지 보여주어, 원본 노출 여부를 가장 직접적으로 확인할 수 있습니다."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          {
            key: 'vuln',
            heading: '취약 환경 ORIGIN',
            tone: 'border-red-200 bg-red-50',
            textTone: 'text-red-700',
            result: vulnerable,
          },
          {
            key: 'secure',
            heading: '보안 환경 ORIGIN',
            tone: 'border-emerald-200 bg-emerald-50',
            textTone: 'text-emerald-700',
            result: secure,
          },
        ].map((card) => {
          const pending = phase === 'running' && !card.result;
          return (
            <div key={card.key} className={`rounded-xl border p-4 ${card.tone}`}>
              <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${card.textTone}`}>
                {card.heading}
              </div>
              <div className="relative mt-3 rounded-lg border border-white/80 bg-white/80 p-3">
                {pending && <div aria-hidden className="absolute inset-0 rounded-lg bg-white/35 backdrop-blur-[2px]" />}
                <div className="relative z-10 text-xs text-slate-500">직접 접근 대상 주소</div>
                <div className="relative z-10 mt-1 break-all font-mono text-sm text-slate-800">
                  {pending ? '응답 대기 중' : card.result?.url || '주소 없음'}
                </div>
                <button
                  type="button"
                  onClick={() => copy(card.key, card.result?.url)}
                  disabled={pending || !card.result?.url}
                  className={`relative z-10 mt-3 rounded-md border px-2.5 py-1 text-xs transition-colors ${pending || !card.result?.url ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {pending ? '대기 중' : copied === card.key ? '복사됨' : '주소 복사'}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="relative rounded-lg border border-white/80 bg-white/80 p-3">
                  {pending && <div aria-hidden className="absolute inset-0 rounded-lg bg-white/35 backdrop-blur-[2px]" />}
                  <div className="relative z-10 text-xs text-slate-500">응답 상태</div>
                  <div className="relative z-10 mt-1 font-mono text-lg font-semibold text-slate-800">
                    {pending ? 'WAIT' : formatStatus(card.result)}
                  </div>
                </div>
                <div className="relative rounded-lg border border-white/80 bg-white/80 p-3">
                  {pending && <div aria-hidden className="absolute inset-0 rounded-lg bg-white/35 backdrop-blur-[2px]" />}
                  <div className="relative z-10 text-xs text-slate-500">지연 시간</div>
                  <div className="relative z-10 mt-1 font-mono text-lg font-semibold text-slate-800">
                    {pending ? '...' : formatLatency(card.result)}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-white/80 bg-white/80 p-3 text-sm text-slate-700">
                {pending
                  ? '원본 응답을 기다리는 중입니다.'
                  : card.key === 'vuln'
                    ? inferResultStatus(card.result) === 'reached'
                      ? '원본 EC2가 직접 응답해 보호 장비 우회 후에도 요청이 내부 로직까지 이어질 수 있음을 보여줍니다.'
                      : '직접 접근 증거가 부족해 원본 노출 여부를 다시 확인할 필요가 있습니다.'
                    : inferResultStatus(card.result) === 'blocked' || inferResultStatus(card.result) === 'failed'
                      ? '직접 접근이 차단되거나 실패해 원본이 외부에 직접 노출되지 않았음을 보여줍니다.'
                      : '보안 환경 원본이 직접 응답하므로 원본 보호 구성을 다시 점검해야 합니다.'}
              </div>
            </div>
          );
        })}
      </div>
    </EvidenceSection>
  );
}

function ScenarioEvidence({
  endpoint,
  phase,
  vulnResults,
  awsResults,
}: {
  endpoint: AttackEndpoint;
  phase: AttackPhase;
  vulnResults: AttackResult[];
  awsResults: AttackResult[];
}) {
  if (endpoint === 'sqli-xss') {
    return <SqliXssEvidenceV2 phase={phase} vulnResults={vulnResults} awsResults={awsResults} />;
  }

  if (endpoint === 'bot-scan') {
    return <BotScanEvidenceV2 phase={phase} vulnResults={vulnResults} awsResults={awsResults} />;
  }

  if (endpoint === 'origin-direct') {
    return <OriginDirectEvidence phase={phase} vulnResults={vulnResults} awsResults={awsResults} />;
  }

  return null;
}

export function AttackCard({
  index,
  title,
  description,
  endpoint,
  totalRequests,
  attackParams = '',
  vulnNote,
  awsNote,
  mode,
}: Props) {
  const { startScenario, handleAttackEvent, resetScenario } = useArchitectureVisualization();
  const [phase, setPhase] = useState<AttackPhase>('idle');
  const [vulnResults, setVulnResults] = useState<AttackResult[]>([]);
  const [awsResults, setAwsResults] = useState<AttackResult[]>([]);
  const [vulnDirectUrl, setVulnDirectUrl] = useState<string | null>(null);
  const [stolenCredential, setStolenCredential] = useState<CapturedCredential | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [manualVulnerableOriginUrl, setManualVulnerableOriginUrl] = useState('');
  const [manualSecureOriginUrl, setManualSecureOriginUrl] = useState('');
  const [autoOriginUrls, setAutoOriginUrls] = useState({ vulnerable: '', secure: '' });
  const [originSavedToast, setOriginSavedToast] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const localVulnRef = useRef<AttackResult[]>([]);
  const localAwsRef = useRef<AttackResult[]>([]);

  useEffect(() => {
    if (endpoint !== 's3-access') return;
    try {
      const raw = localStorage.getItem('sentinelshare_captured_accounts');
      if (!raw) return;
      const accounts: CapturedCredential[] = JSON.parse(raw);
      if (accounts.length > 0) {
        setStolenCredential(accounts[0]);
      }
    } catch {}
  }, [endpoint]);

  useEffect(() => {
    if (endpoint !== 'origin-direct' || mode !== 'manual') return;
    try {
      const savedVulnerable = localStorage.getItem(MANUAL_VULNERABLE_ORIGIN_STORAGE_KEY);
      const saved = localStorage.getItem(MANUAL_SECURE_ORIGIN_STORAGE_KEY);
      if (savedVulnerable) {
        setManualVulnerableOriginUrl(savedVulnerable);
      }
      if (saved) {
        setManualSecureOriginUrl(saved);
      }
    } catch {}
  }, [endpoint, mode]);

  useEffect(() => {
    if (endpoint !== 'origin-direct' || mode !== 'auto') return;

    let active = true;
    const syncOriginUrls = () => {
      fetch('/api/config')
        .then((response) => response.json())
        .then((config: DashboardConfig) => {
          if (!active) return;
          setAutoOriginUrls({
            vulnerable: config.autoVulnerable.originUrl || '',
            secure: config.autoAws.originUrl || '',
          });
        })
        .catch(() => {});
    };

    syncOriginUrls();
    const intervalId = window.setInterval(syncOriginUrls, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [endpoint, mode]);

  const saveManualOriginUrls = useCallback(() => {
    const trimmedVulnerable = manualVulnerableOriginUrl.trim();
    const trimmedSecure = manualSecureOriginUrl.trim();
    try {
      if (trimmedVulnerable) {
        localStorage.setItem(MANUAL_VULNERABLE_ORIGIN_STORAGE_KEY, trimmedVulnerable);
      } else {
        localStorage.removeItem(MANUAL_VULNERABLE_ORIGIN_STORAGE_KEY);
      }

      if (trimmedSecure) {
        localStorage.setItem(MANUAL_SECURE_ORIGIN_STORAGE_KEY, trimmedSecure);
      } else {
        localStorage.removeItem(MANUAL_SECURE_ORIGIN_STORAGE_KEY);
      }
      setOriginSavedToast(true);
      window.setTimeout(() => setOriginSavedToast(false), 1800);
    } catch {}
  }, [manualSecureOriginUrl, manualVulnerableOriginUrl]);

  const startAttack = useCallback(() => {
    if (phase === 'running') return;

    const startTime = new Date().toISOString();
    startScenario(endpoint);
    setPhase('running');
    setVulnResults([]);
    setAwsResults([]);
    setVulnDirectUrl(null);
    localVulnRef.current = [];
    localAwsRef.current = [];

    const doSave = (localVuln: AttackResult[], localAws: AttackResult[]) => {
      void (async () => {
        try {
          const sessionId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

          await fetch('/api/analysis/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              startTime,
              timestamp: new Date().toISOString(),
              mode,
              scenario: endpoint,
              scenarioTitle: title,
              vulnResults: localVuln,
              secureResults: localAws,
              stages: [],
              metrics: {
                vuln: computeMetrics(localVuln),
                secure: computeMetrics(localAws),
              },
            }),
          });
          setSavedToast(true);
          window.setTimeout(() => setSavedToast(false), 3000);
        } catch {}
      })();
    };

    const modeParam = `mode=${mode}`;
    let extraParams = attackParams ? `${attackParams}&${modeParam}` : modeParam;
    if (endpoint === 's3-access' && stolenCredential) {
      extraParams += `&email=${encodeURIComponent(stolenCredential.email)}&password=${encodeURIComponent(stolenCredential.password)}`;
    }
    if (endpoint === 'origin-direct' && mode === 'manual') {
      if (manualVulnerableOriginUrl.trim()) {
        extraParams += `&vulnerableOriginUrl=${encodeURIComponent(manualVulnerableOriginUrl.trim())}`;
      }
      if (manualSecureOriginUrl.trim()) {
        extraParams += `&awsOriginUrl=${encodeURIComponent(manualSecureOriginUrl.trim())}`;
      }
    }

    const es = new EventSource(`/api/attack/${endpoint}?${extraParams}`);
    esRef.current = es;

    es.onmessage = (eventMessage) => {
      let event: AttackEvent;
      try {
        event = JSON.parse(eventMessage.data);
      } catch {
        return;
      }

      handleAttackEvent(endpoint, event);

      if (event.type === 'result') {
        const result: AttackResult = {
          attempt: event.attempt,
          status: event.status,
          latency: event.latency,
          blocked: event.blocked,
          label: event.label,
          error: event.error,
          url: event.url,
        };

        if (event.env === 'vulnerable') {
          setVulnResults((prev) => [...prev, result]);
          localVulnRef.current.push(result);
          if (event.url) {
            setVulnDirectUrl(event.url);
          }
        } else {
          setAwsResults((prev) => [...prev, result]);
          localAwsRef.current.push(result);
        }
      } else if (event.type === 'complete') {
        setPhase('complete');
        doSave(localVulnRef.current, localAwsRef.current);
        es.close();
      } else if (event.type === 'error') {
        setPhase('error');
        es.close();
      }
    };

    es.onerror = () => {
      setPhase('complete');
      doSave(localVulnRef.current, localAwsRef.current);
      es.close();
    };
  }, [attackParams, endpoint, handleAttackEvent, manualSecureOriginUrl, manualVulnerableOriginUrl, mode, phase, startScenario, stolenCredential, title]);

  const reset = useCallback(() => {
    esRef.current?.close();
    resetScenario();
    setPhase('idle');
    setVulnResults([]);
    setAwsResults([]);
    setVulnDirectUrl(null);
  }, [resetScenario]);

  const reachRateData = useMemo(() => {
    if (endpoint !== 'ratelimit') return [];
    const windowSize = 10;
    const maxLen = Math.max(vulnResults.length, awsResults.length);
    const windows = Math.ceil(maxLen / windowSize);

    return Array.from({ length: windows }, (_, index) => {
      const start = index * windowSize;
      const end = start + windowSize;
      const vulnSlice = vulnResults.slice(start, end);
      const awsSlice = awsResults.slice(start, end);
      const reachRate = (slice: AttackResult[]) =>
        slice.length > 0
          ? Math.round((slice.filter((result) => !result.blocked).length / slice.length) * 100)
          : null;

      return {
        req: end,
        '취약 (서버 도달)': reachRate(vulnSlice),
        '보안 (WAF 차단)': awsSlice.length > 0
          ? Math.round((awsSlice.filter((result) => result.blocked).length / awsSlice.length) * 100)
          : null,
      };
    });
  }, [awsResults, endpoint, vulnResults]);

  const buttonClass =
    phase === 'idle'
      ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
      : phase === 'running'
        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200';

  const showReachChart = endpoint === 'ratelimit' && reachRateData.length > 0;

  return (
    <>
      {savedToast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          세션 데이터가 저장되었습니다
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 font-mono text-xs text-slate-500">
              {index}
            </span>
            <div>
              <h2 className="font-semibold tracking-wide text-slate-900">{title}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {phase !== 'idle' && (
              <button
                onClick={reset}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
              >
                초기화
              </button>
            )}
            <button
              onClick={startAttack}
              disabled={phase === 'running'}
              className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${buttonClass}`}
            >
              {phase === 'idle' && '공격 실행'}
              {phase === 'running' && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  실행 중
                </span>
              )}
              {phase === 'complete' && '다시 실행'}
              {phase === 'error' && '오류 발생'}
            </button>
          </div>
        </div>

        {endpoint === 's3-access' && (
          <div
            className={`flex items-center gap-3 border-b px-6 py-2.5 text-xs ${
              stolenCredential ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
            }`}
          >
            {stolenCredential ? (
              <>
                <span className="font-semibold text-red-700">이전 시나리오 연동</span>
                <span className="text-red-600">브루트포스에서 획득한 계정을 사용 중입니다.</span>
                <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-800">
                  {stolenCredential.email}
                </code>
              </>
            ) : (
              <span className="text-slate-500">
                기본 계정으로 실행합니다. 먼저 브루트포스를 실행하면 탈취 계정을 자동 연동할 수 있습니다.
              </span>
            )}
          </div>
        )}

        {endpoint === 'origin-direct' && mode === 'manual' && (
          <div className="border-b border-slate-200 bg-sky-50/70 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="lg:flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                  Manual Origin Input
                </div>
                <p className="mt-1 text-sm text-slate-700 lg:whitespace-nowrap">
                  실습자가 취약 환경과 보안 환경의 원본 EC2 주소를 직접 입력하면, CloudFront 우회 전후의 직접 접근 차이를 이 카드에서 바로 비교할 수 있습니다.
                </p>
              </div>
              {originSavedToast && (
                <span className="text-xs font-medium text-sky-700">원본 주소가 저장되었습니다.</span>
              )}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">
                  Vulnerable Origin
                </label>
                <input
                  type="text"
                  value={manualVulnerableOriginUrl}
                  onChange={(event) => setManualVulnerableOriginUrl(event.target.value)}
                  placeholder="http://VULNERABLE_EC2_IP:3000"
                  className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                  Secure Origin
                </label>
                <input
                  type="text"
                  value={manualSecureOriginUrl}
                  onChange={(event) => setManualSecureOriginUrl(event.target.value)}
                  placeholder="http://SECURE_EC2_IP:3000"
                  className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400"
                />
              </div>
              <button
                type="button"
                onClick={saveManualOriginUrls}
                className="self-end rounded-lg border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
              >
                저장
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              입력하지 않은 항목은 서버에 미리 설정된 <code className="font-mono">VULNERABLE_ORIGIN_API_URL</code> 또는 <code className="font-mono">AWS_ORIGIN_API_URL</code>을 그대로 사용합니다.
            </p>
          </div>
        )}

        {endpoint === 'origin-direct' && mode === 'auto' && (
          <div className="border-b border-slate-200 bg-cyan-50/70 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                  Auto Origin Input
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  자동 배포가 완료되면 Terraform 출력값의 Origin Direct 주소를 가져와 취약 환경과 보안 환경 입력칸에 자동으로 고정 표시합니다.
                </p>
              </div>
              <span className="text-xs font-medium text-cyan-700">Terraform Output</span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">
                  Vulnerable Origin
                </label>
                <input
                  type="text"
                  value={autoOriginUrls.vulnerable}
                  readOnly
                  placeholder="배포 완료 후 자동 입력"
                  className="w-full cursor-default rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                  Secure Origin
                </label>
                <input
                  type="text"
                  value={autoOriginUrls.secure}
                  readOnly
                  placeholder="배포 완료 후 자동 입력"
                  className="w-full cursor-default rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              자동 배포 모드에서는 실습자가 주소를 수정할 수 없고, 배포된 인프라의 Origin Direct 주소가 고정 사용됩니다.
            </p>
          </div>
        )}

        <ScenarioEvidence endpoint={endpoint} phase={phase} vulnResults={vulnResults} awsResults={awsResults} />

        <div className="grid grid-cols-1 divide-slate-200 lg:grid-cols-2 lg:divide-x">
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-red-600">취약 환경</span>
              <span className="ml-1 font-mono text-xs text-slate-400">No Protection</span>
            </div>
            <p className="min-h-[44px] text-xs leading-5 text-slate-500">{vulnNote}</p>

            {endpoint === 's3-access' && vulnDirectUrl && (
              <a
                href={vulnDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                <span>직접 확인</span>
                <span>취약 파일 다운로드 결과 열기</span>
                <span className="ml-auto font-normal text-red-400 underline">열기</span>
              </a>
            )}

            <RequestLog results={vulnResults} env="vulnerable" />
            <MetricsPanel results={vulnResults} phase={phase} env="vulnerable" totalPlanned={totalRequests} />
          </div>

          <div className="space-y-3 border-t border-slate-200 p-4 lg:border-t-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">보안 환경</span>
              <span className="ml-1 font-mono text-xs text-slate-400">WAF + CloudFront</span>
            </div>
            <p className="min-h-[44px] text-xs leading-5 text-slate-500">{awsNote}</p>
            <RequestLog results={awsResults} env="aws" />
            <MetricsPanel results={awsResults} phase={phase} env="aws" totalPlanned={totalRequests} />
          </div>
        </div>

        {showReachChart && (
          <div className="border-t border-slate-200 p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              서버 도달률 vs WAF 차단율 (10개 요청 단위, %)
            </div>
            <p className="mb-3 text-xs text-slate-400">
              취약 환경은 요청이 그대로 서버에 도달하고, 보안 환경은 WAF가 앞단에서 차단합니다.
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={reachRateData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="vulnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="secureGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="req"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  label={{
                    value: '요청 번호',
                    position: 'insideBottom',
                    offset: -2,
                    fontSize: 10,
                    fill: '#94a3b8',
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(value) => [`${value}%`]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area
                  type="monotone"
                  dataKey="취약 (서버 도달)"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#vulnGrad)"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="보안 (WAF 차단)"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  fill="url(#secureGrad)"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </>
  );
}
