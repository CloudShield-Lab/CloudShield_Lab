import Link from 'next/link';

const phases = [
  {
    number: 1,
    href: '/manual/vulnerable',
    label: '취약 환경 구성',
    subtitle: 'Vulnerable Environment',
    description: 'WAF 없음, CloudFront 없음, S3 퍼블릭, Security Group 전체 개방. 외부 요청이 직접 도달하는 환경.',
    color: 'red',
    items: ['vul-ec2 (Public IP)', 'PostgreSQL co-located on EC2', 'S3 (Block Public Access OFF)', 'Security Group 0.0.0.0/0', 'S3 Static Frontend', 'Wazuh Agent'],
  },
  {
    number: 2,
    href: '/manual/secure',
    label: '보안 환경 구성',
    subtitle: 'Secure Environment',
    description: 'CloudFront + WAF, S3 프라이빗, 제한된 보안 그룹, Secrets Manager. 동일 코드, 다른 인프라.',
    color: 'emerald',
    items: ['secure-ec2', 'PostgreSQL co-located on EC2', 'S3 (Block Public Access ON + 버킷 정책)', 'CloudFront + WAF', 'CloudFront OAC + S3 Static Frontend', 'Secrets Manager', 'Wazuh Agent'],
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Infrastructure Guide</h1>
        <p className="text-slate-500 mt-1 text-sm">
          동일한 Sentinel Share 코드를 취약 환경과 보안 환경 두 가지 AWS 인프라로 구성하고 차이를 비교하는 가이드입니다.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <h2 className="text-slate-800 font-semibold mb-4 flex items-center gap-2">
          <span className="text-slate-600">□</span>
          전체 아키텍처 개요
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="text-xs font-mono text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              취약 환경 (Vulnerable)
            </div>
            <pre className="text-xs font-mono text-slate-500 leading-relaxed">
{`[브라우저 / 공격자]
       │ 직접 연결 (WAF·CloudFront 없음)
  [vul-ec2 :3000]
  SG: 0.0.0.0/0
  Docker · Wazuh Agent · PostgreSQL
       │
  [S3 Public]
  Block Public Access OFF
  Presigned URL · 직접 접근 가능
  S3 Static Frontend`}
            </pre>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-mono text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              보안 환경 (Secure)
            </div>
            <pre className="text-xs font-mono text-slate-500 leading-relaxed">
{`[브라우저]                  [공격자]
    │                           │ origin-direct 우회 시도
[CloudFront + WAF]              │
Rate-based · Managed Rules      │
OAC → S3 Static Frontend        │
    │                           │
[secure-ec2 :3000] ─────────────┘
SG: CloudFront prefix list만
Docker · Wazuh Agent · PostgreSQL
    │
[S3 Private]          [Secrets Manager]
Block Public Access ON
Presigned URL · OAC 경유`}
            </pre>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-4 text-xs md:flex-row md:items-start md:gap-0">
            <div className="flex-1 text-slate-500">
              <span className="mb-1 block text-base font-bold tracking-tight text-black">동일 코드</span>
              백엔드와 프론트 코드는 동일하고, 차이는 인프라 공개 범위와 보호 계층에 있습니다.
            </div>

            <div
              aria-hidden="true"
              className="hidden px-4 text-lg font-light leading-none text-slate-300 md:flex"
            >
              |
            </div>

            <div className="flex-1 border-t border-slate-200 pt-4 text-slate-500 md:border-t-0 md:pt-0">
              <span className="mb-1 block text-base font-bold tracking-tight text-black">인프라 보호 계층 차이</span>
              취약 환경은 CloudFront와 WAF가 없고, 보안 환경은 앞단 보호 계층으로 공격 노출면을 줄입니다.
            </div>

            <div
              aria-hidden="true"
              className="hidden px-4 text-lg font-light leading-none text-slate-300 md:flex"
            >
              |
            </div>

            <div className="flex-1 border-t border-slate-200 pt-4 text-slate-500 md:border-t-0 md:pt-0">
              <span className="mb-1 block text-base font-bold tracking-tight text-black">S3 접근 방식 차이</span>
              취약 환경은 공개 S3 객체에 직접 접근 가능하고, 보안 환경은 제한된 경로를 통해서만 접근합니다.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <h2 className="text-slate-800 font-semibold mb-4 flex items-center gap-2">
          <span className="text-slate-600">□</span>
          사전 준비
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { name: 'AWS CLI', desc: 'aws configure 완료', cmd: 'aws sts get-caller-identity' },
            { name: 'Docker', desc: '컨테이너 이미지 확인용', cmd: 'docker --version' },
            { name: 'Node.js 20+', desc: '프론트/백엔드 빌드', cmd: 'node --version' },
            { name: 'psql', desc: 'PostgreSQL 확인용', cmd: 'psql --version' },
          ].map((item) => (
            <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="text-slate-900 font-medium text-sm">{item.name}</div>
              <div className="text-slate-500 text-xs">{item.desc}</div>
              <div className="text-emerald-700 text-xs font-mono bg-white rounded border border-emerald-100 px-2 py-1 mt-2">
                $ {item.cmd}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-slate-800 font-semibold mb-4">구성 단계</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {phases.map((phase) => {
            const colorStyles = {
              red: {
                border: 'border-red-200',
                bg: 'bg-red-50',
                badge: 'bg-white text-red-700 border-red-200',
                text: 'text-red-700',
                hover: 'hover:border-red-300',
                bullet: 'text-red-600',
              },
              emerald: {
                border: 'border-emerald-200',
                bg: 'bg-emerald-50',
                badge: 'bg-white text-emerald-700 border-emerald-200',
                text: 'text-emerald-700',
                hover: 'hover:border-emerald-300',
                bullet: 'text-emerald-600',
              },
            } as const;
            const colorMap = colorStyles[phase.color as keyof typeof colorStyles];

            return (
              <Link
                key={phase.href}
                href={phase.href}
                className={`block rounded-xl border ${colorMap.border} ${colorMap.bg} ${colorMap.hover} p-6 transition-colors group`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm font-mono font-bold ${colorMap.text}`}>
                      {phase.number}
                    </span>
                    <div>
                      <div className={`font-semibold ${colorMap.text}`}>{phase.label}</div>
                      <div className="text-xs text-slate-600 font-mono">{phase.subtitle}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded border font-mono ${colorMap.badge}`}>
                    GUIDE →
                  </span>
                </div>

                <p className="text-slate-500 text-sm mb-4">{phase.description}</p>

                <ul className="space-y-1">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className={`${colorMap.bullet} text-[10px]`}>▶</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <h2 className="text-slate-800 font-semibold mb-3 flex items-center gap-2">
          <span className="text-slate-600">□</span>
          공통 AWS 리소스
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          {[
            { label: 'AWS Region', value: 'ap-northeast-2', note: '서울 리전 기준' },
            { label: 'Dashboard Deploy', value: 'deploy-dashboard.yml', note: 'Attack Dashboard ECS 배포' },
            { label: 'Frontend Deploy', value: 'deploy-frontend.yml', note: '취약/보안 프론트 배포' },
            { label: 'OIDC Role', value: 'CloudShield-Role', note: 'GitHub Actions AWS 인증' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-slate-400 text-xs mb-1">{item.label}</div>
              <div className="text-slate-800 font-mono text-sm">{item.value}</div>
              <div className="text-slate-600 text-xs mt-1">{item.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
