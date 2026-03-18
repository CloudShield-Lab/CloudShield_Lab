import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { AnalysisPage } from '@/components/AnalysisPage';

export default function ManualAnalysisPage() {
  return (
    <WorkspaceShell mode="manual">
      <AnalysisPage mode="manual" />
    </WorkspaceShell>
  );
}
