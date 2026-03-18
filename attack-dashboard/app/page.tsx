import Link from 'next/link';

const workspaceTabs = [
  {
    href: '/manual',
    badge: 'MANUAL',
    title: '수동 배포',
    description:
      'Infrastructure Guide를 따라 직접 실습용 AWS 환경을 구축하고 공격 시뮬레이션으로 결과를 비교합니다.',
    points: ['Infrastructure Guide 중심 실습', '직접 구성한 환경 검증', 'Attack Simulator 연계'],
    accent: 'border-sky-200 bg-sky-50/70 hover:border-sky-300',
    badgeTone: 'border-sky-200 bg-white text-sky-700',
  },
  {
    href: '/auto',
    badge: 'AUTO',
    title: '자동 배포',
    description:
      'Terraform을 통해 실습용 AWS 환경을 자동으로 배포하거나 삭제하고, 배포 직후 공격 시뮬레이션으로 차이를 확인합니다.',
    points: ['Terraform 기반 자동 구축', '배포/삭제 상태 확인', 'Attack Simulator 연계'],
    accent: 'border-amber-200 bg-amber-50/70 hover:border-amber-300',
    badgeTone: 'border-amber-200 bg-white text-amber-700',
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-10">
        <div className="mx-auto max-w-4xl text-center">
          <span className="rounded-full border border-slate-200 bg-white px-4 py-1.5 font-mono text-[11px] tracking-[0.24em] text-slate-600">
            CLOUDSHIELD LAB
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            AWS 보안 아키텍처 차이를 공격 흐름으로 비교하는 시뮬레이터
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-500 sm:text-lg">
            이 프로젝트는 동일한 공격이 취약 환경과 보호된 AWS 환경에서 어떻게 다르게 처리되는지
            시각적으로 보여주는 실습용 대시보드입니다. 먼저 환경을 준비한 뒤 Attack Simulator에서
            브루트포스 로그인, S3 접근 경로, Rate Limit 시나리오를 비교할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">시작 방식 선택</h2>
          <p className="mt-2 text-sm text-slate-500">
            아래 두 탭 중 하나를 선택하면 각각 수동 배포 화면 또는 자동 배포 화면으로 이동합니다.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {workspaceTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`group rounded-[1.75rem] border p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition-all ${tab.accent}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className={`rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.2em] ${tab.badgeTone}`}>
                    {tab.badge}
                  </span>
                  <h3 className="mt-4 text-2xl font-semibold text-slate-900">{tab.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{tab.description}</p>
                </div>
                <span className="text-2xl text-slate-400 transition-transform group-hover:translate-x-1">→</span>
              </div>

              <div className="mt-6 grid gap-2">
                {tab.points.map((point) => (
                  <div
                    key={point}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    {point}
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
