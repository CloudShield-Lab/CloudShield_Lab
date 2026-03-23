import { notFound } from 'next/navigation';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { AttackScenarioContent } from '@/components/workspace/AttackScenarioContent';
import { isAttackScenarioKey } from '@/lib/attack-scenarios';

export default async function ManualAttackScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario } = await params;

  if (!isAttackScenarioKey(scenario)) {
    notFound();
  }

  return (
    <WorkspaceShell mode="manual">
      <AttackScenarioContent scenario={scenario} mode="manual" />
    </WorkspaceShell>
  );
}
