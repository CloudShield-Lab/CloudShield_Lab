import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { InfraControl } from '@/components/InfraControl';

export default function DashboardPage() {
  return (
    <>
      <DashboardHome />
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <InfraControl />
      </div>
    </>
  );
}
