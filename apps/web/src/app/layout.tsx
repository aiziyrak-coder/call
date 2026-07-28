import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-aicc',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AiCC — AI Call Center',
  description: "Sun'iy intellektga asoslangan call-markaz platformasi",
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e8eef8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning className={outfit.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
