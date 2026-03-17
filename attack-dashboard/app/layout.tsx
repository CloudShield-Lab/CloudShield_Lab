import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { EnvironmentStatus } from '@/components/EnvironmentStatus';

export const metadata: Metadata = {
  title: 'CloudShield Lab — Cloud Security Impact Simulator',
  description: 'AWS 인프라 보안 효과를 실시간으로 비교하는 공격 시뮬레이터',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-[#080c14] text-slate-100 antialiased flex flex-col">
        <Navbar />
        <EnvironmentStatus />
        <main className="flex-1">
          {children}
        </main>
        <footer className="border-t border-slate-800 px-6 py-3 text-center text-xs text-slate-700 font-mono">
          CloudShield Lab — Cloud Security Impact Simulator | 교육 및 데모 전용
        </footer>
      </body>
    </html>
  );
}
