import SecureGuidePage from '@/app/guide/secure/page';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function ManualSecureGuidePage() {
  return (
    <WorkspaceShell mode="manual">
      <SecureGuidePage />
    </WorkspaceShell>
  );
}
