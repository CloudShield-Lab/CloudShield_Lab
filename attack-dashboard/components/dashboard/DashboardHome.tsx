'use client';

import { AttackCard } from '@/components/AttackCard';
import { ArchitectureVisualizationProvider } from '@/hooks/useArchitectureVisualization';
import { ArchitectureComparisonDashboard } from './ArchitectureComparisonDashboard';

export function DashboardHome() {
  return (
    <ArchitectureVisualizationProvider>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 pb-14 sm:px-6 sm:pb-16">
        <div className="rounded-xl border border-sky-900/50 bg-sky-950/20 px-4 py-3 text-sm text-sky-100/90">
          각 공격 카드의 실행 버튼이 하단 시각화 패널과 연결됩니다. 공격 실행 시 취약 환경과 보안 환경의
          흐름을 함께 비교할 수 있습니다.
        </div>

        <AttackCard
          index={1}
          title="브루트포스 로그인 비교"
          description="동일한 로그인 요청 폭주가 취약 환경과 보안 환경에서 어떻게 다르게 처리되는지 비교합니다."
          endpoint="bruteforce"
          totalRequests={100}
          attackParams="count=100"
          vulnNote="취약 환경은 앞단 제어가 약해 다수의 요청이 서비스 로직 계층까지 도달하는 흐름을 보여줍니다."
          awsNote="보안 환경은 CloudFront 및 WAF 룰을 통해 비정상 요청을 더 앞단에서 차단하는 흐름을 보여줍니다."
        />

        <AttackCard
          index={2}
          title="S3 접근 경로 비교"
          description="스토리지 접근 요청이 공개 설정 여부에 따라 어디에서 허용되거나 차단되는지 확인합니다."
          endpoint="s3-access"
          totalRequests={5}
          vulnNote="취약 환경은 잘못된 스토리지 설정 또는 우회 가능한 접근 경로 때문에 더 깊은 단계까지 요청이 이어질 수 있습니다."
          awsNote="보안 환경은 비공개 버킷, 역할 기반 권한, 차단 정책으로 인해 동일 요청이 제한되는 모습을 비교합니다."
        />

        <AttackCard
          index={3}
          title="API Rate Limit 비교"
          description="짧은 시간에 반복되는 API 요청이 서비스 내부까지 도달하는지 여부를 비교합니다."
          endpoint="ratelimit"
          totalRequests={200}
          attackParams="count=200"
          vulnNote="취약 환경은 요청 제한이 약하거나 없어 EC2와 서비스 로직 계층에 부담이 누적되는 흐름을 보여줍니다."
          awsNote="보안 환경은 WAF 및 보호 정책이 먼저 동작하여 핵심 애플리케이션 계층이 최대한 유휴 상태를 유지하도록 구성합니다."
        />

        <section className="rounded-2xl border border-slate-800 bg-[#0d1117] p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-2 w-2 rotate-45 bg-slate-500" />
            <h2 className="text-lg font-semibold text-slate-100">코드는 동일한데 왜 결과가 다른가?</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div>
              <div className="mb-3 text-base font-medium text-slate-300">취약 환경 구조</div>
              <div className="rounded-2xl bg-[#11192d] p-5 font-mono text-sm leading-[1.9] text-slate-400">
                <div className="text-red-400">공격자</div>
                <div>↓ 직접 연결</div>
                <div className="text-orange-300">EC2 (SG: 0.0.0.0/0)</div>
                <div>↓ 앱 코드만 실행</div>
                <div className="text-slate-200">Express App</div>
                <div>↓ 공개 버킷</div>
                <div className="text-red-300">S3 Public</div>
              </div>
            </div>

            <div className="hidden justify-center lg:flex">
              <span className="text-4xl text-slate-600">→</span>
            </div>

            <div>
              <div className="mb-3 text-base font-medium text-slate-300">AWS 보안 환경 구조</div>
              <div className="rounded-2xl bg-[#11192d] p-5 font-mono text-sm leading-[1.9] text-slate-400">
                <div className="text-red-400">공격자</div>
                <div>↓</div>
                <div className="text-emerald-300">CloudFront + WAF</div>
                <div className="text-emerald-300">차단됨 √</div>
                <div>↓ (통과한 경우만)</div>
                <div className="text-slate-200">EC2 (SG: CF IP only)</div>
                <div>↓ presigned URL만</div>
                <div className="text-emerald-300">S3 Private</div>
              </div>
            </div>
          </div>
        </section>

        <ArchitectureComparisonDashboard />
      </div>
    </ArchitectureVisualizationProvider>
  );
}
