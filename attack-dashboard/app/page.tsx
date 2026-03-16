import { AttackCard } from '@/components/AttackCard';

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* 안내 배너 */}
      <div className="rounded-lg border border-yellow-900/50 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-300/80 flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">⚠</span>
        <span>
          이 대시보드는 교육 목적의 보안 시뮬레이터입니다. 모든 공격은 통제된 환경에서만
          실행하세요. AWS 환경 공격 후에는 WAF IP 차단 목록을 확인하고 필요 시 해제하세요.
          환경 설정 방법은{' '}
          <a href="/guide" className="text-yellow-200 underline underline-offset-2 hover:text-white">
            Infrastructure Guide
          </a>
          를 참고하세요.
        </span>
      </div>

      {/* Attack 1: 브루트포스 로그인 */}
      <AttackCard
        index={1}
        title="브루트포스 로그인 공격"
        description="동일한 계정에 100회 잘못된 패스워드로 반복 로그인 시도합니다."
        endpoint="bruteforce"
        totalRequests={100}
        attackParams="count=100"
        vulnNote="앱 코드에 rate limit이 없습니다. WAF 같은 인프라 보호도 없으므로 모든 요청이 서버에 도달합니다. 공격자는 무제한으로 패스워드를 시도할 수 있습니다."
        awsNote="동일한 앱 코드가 실행 중이지만, 앞단의 AWS WAF Rate-based Rule이 IP당 임계값 초과 시 즉시 차단합니다. 앱 코드에 도달조차 하지 못합니다."
      />

      {/* Attack 2: S3 직접 접근 */}
      <AttackCard
        index={2}
        title="S3 버킷 직접 접근 시도"
        description="인증 없이 S3 버킷에 직접 접근하여 파일 목록 열거 및 파일 다운로드를 시도합니다."
        endpoint="s3-access"
        totalRequests={5}
        vulnNote="LocalStack은 버킷 정책이 없어 버킷 루트 접근, 디렉터리 열거가 가능합니다. stored_key를 알면 인증 없이 파일을 바로 다운로드할 수 있습니다."
        awsNote="S3 버킷에 Block Public Access가 활성화되어 있고, 버킷 정책이 ECS Task Role만 허용합니다. 직접 URL 접근 시 403 AccessDenied가 반환됩니다."
      />

      {/* Attack 3: API 플러드 */}
      <AttackCard
        index={3}
        title="API 플러드 (Rate Limit 우회 시도)"
        description="짧은 시간에 100회 API 요청을 보내 서비스 가용성을 저하시키려 합니다."
        endpoint="ratelimit"
        totalRequests={100}
        attackParams="count=100"
        vulnNote="앱 코드에 rate limit이 없어 초당 수백 개의 요청이 서버에 그대로 도달합니다. 서버 자원이 소모되어 정상 사용자 서비스도 영향을 받을 수 있습니다."
        awsNote="동일한 앱 코드가 실행 중이지만, AWS WAF가 IP별 요청 수를 실시간 추적해 임계값 초과 시 차단합니다. AWS Shield로 DDoS도 자동 방어됩니다."
      />

      {/* 코드는 동일한데 왜 결과가 다른가 */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-6">
        <h3 className="text-slate-300 font-semibold mb-4 flex items-center gap-2">
          <span className="text-slate-600">◆</span>
          코드는 동일한데 왜 결과가 다른가?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-2">
            <div className="text-slate-400 font-medium">취약 환경 구조</div>
            <div className="font-mono text-xs text-slate-500 bg-slate-900 rounded-lg p-3 space-y-1">
              <div className="text-red-400">공격자</div>
              <div className="pl-2 text-slate-600">↓ 직접 연결</div>
              <div className="text-orange-400">ECS (SG: 0.0.0.0/0)</div>
              <div className="pl-2 text-slate-600">↓ 앱 코드만 실행</div>
              <div className="text-slate-400">Express App</div>
              <div className="pl-2 text-slate-600">↓ 공개 버킷</div>
              <div className="text-red-400">S3 Public</div>
            </div>
          </div>
          <div className="hidden md:flex items-center justify-center">
            <span className="text-slate-700 text-3xl">→</span>
          </div>
          <div className="space-y-2">
            <div className="text-slate-400 font-medium">AWS 보안 환경 구조</div>
            <div className="font-mono text-xs text-slate-500 bg-slate-900 rounded-lg p-3 space-y-1">
              <div className="text-red-400">공격자</div>
              <div className="pl-2 text-slate-600">↓</div>
              <div className="text-emerald-400">CloudFront + WAF</div>
              <div className="pl-2 text-emerald-600">차단됨 ✓</div>
              <div className="text-slate-600">↓ (통과한 경우만)</div>
              <div className="text-slate-400">ECS (SG: CF IP only)</div>
              <div className="pl-2 text-slate-600">↓ presigned URL만</div>
              <div className="text-emerald-400">S3 Private</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
