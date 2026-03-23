import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SentinelShare',
  description: 'Secure cloud file sharing',
  icons: [{ rel: 'icon', url: 'data:,' }],
};

const envType = process.env.NEXT_PUBLIC_ENV_TYPE;
const bgClass =
  envType === 'vulnerable'
    ? 'min-h-screen bg-red-50 text-gray-900 antialiased'
    : envType === 'secure'
    ? 'min-h-screen bg-green-50 text-gray-900 antialiased'
    : 'min-h-screen bg-gray-50 text-gray-900 antialiased';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={bgClass}>
        {children}
      </body>
    </html>
  );
}
