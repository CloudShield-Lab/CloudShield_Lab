import VulnerableGuidePage from '@/app/guide/vulnerable/page';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function ManualVulnerableGuidePage() {
  return (
    <WorkspaceShell mode="manual">
      <VulnerableGuidePage />
    </WorkspaceShell>
  );
}
