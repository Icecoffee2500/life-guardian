import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Life Guardian — 나도 몰랐던 나',
  description:
    '생체신호로 나도 몰랐던 나를 읽어, 관계와 직업의 스트레스를 줄이는 개인 최적화 솔루션. LIFENOLOGY LAB 3기 출품작.',
  applicationName: 'Life Guardian',
};

export const viewport: Viewport = {
  themeColor: '#08090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
