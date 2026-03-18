import GuidePage from '@/app/guide/page';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function ManualWorkspacePage() {
  return (
    <WorkspaceShell mode="manual">
      <GuidePage />
    </WorkspaceShell>
  );
}
