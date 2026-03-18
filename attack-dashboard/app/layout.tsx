import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { EnvironmentStatus } from '@/components/EnvironmentStatus';

export const metadata: Metadata = {
  title: 'CloudShield Lab | AWS Security Attack Simulator',
  description:
    'Practice dashboard for manual or automated AWS deployment and attack-path comparison between vulnerable and protected environments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        <Navbar />
        <EnvironmentStatus />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white/90 px-6 py-3 text-center font-mono text-xs text-slate-500">
          CloudShield Lab | Manual and automated AWS deployment workspace with attack path comparison
        </footer>
      </body>
    </html>
  );
}
