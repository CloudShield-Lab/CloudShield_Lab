import { notFound } from 'next/navigation';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { AttackScenarioContent } from '@/components/workspace/AttackScenarioContent';
import { isAttackScenarioKey } from '@/lib/attack-scenarios';

export default async function AutoAttackScenarioPage({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario } = await params;

  if (!isAttackScenarioKey(scenario)) {
    notFound();
  }

  return (
    <WorkspaceShell mode="auto">
      <AttackScenarioContent scenario={scenario} />
    </WorkspaceShell>
  );
}
