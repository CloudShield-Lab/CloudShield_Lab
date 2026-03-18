import { InfraControl } from '@/components/InfraControl';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function AutoWorkspacePage() {
  return (
    <WorkspaceShell mode="auto">
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-violet-700">
                TERRAFORM
              </span>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">인프라 자동 배포/삭제</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Terraform을 통해 취약 환경과 보안 환경을 자동으로 배포하거나 삭제할 수 있습니다.
                배포가 끝나면 같은 워크스페이스에서 바로 Attack Simulator로 이동해 결과를 비교할 수 있습니다.
              </p>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.88),rgba(240,249,255,0.92))] px-4 py-3 text-sm text-slate-600">
              자동 배포가 끝나면 좌측 Attack Simulator 항목에서 시나리오를 바로 실행할 수 있습니다.
            </div>
          </div>
        </section>

        <InfraControl />
      </div>
    </WorkspaceShell>
  );
}
