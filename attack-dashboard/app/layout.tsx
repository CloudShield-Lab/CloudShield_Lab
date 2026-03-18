import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { EnvironmentStatus } from '@/components/EnvironmentStatus';

export const metadata: Metadata = {
  title: 'CloudShield Lab | Architecture Compare Dashboard',
  description:
    'Security architecture comparison dashboard that visualizes how identical attacks traverse vulnerable and protected AWS stacks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-[#080c14] text-slate-100 antialiased">
        <Navbar />
        <EnvironmentStatus />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-800 px-6 py-3 text-center font-mono text-xs text-slate-600">
          CloudShield Lab | Architecture visualization MVP for attack path comparison
        </footer>
      </body>
    </html>
  );
}
