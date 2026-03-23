import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { AnalysisPage } from '@/components/AnalysisPage';

export default function AutoAnalysisPage() {
  return (
    <WorkspaceShell mode="auto">
      <AnalysisPage mode="auto" />
    </WorkspaceShell>
  );
}
