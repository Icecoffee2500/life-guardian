import type { Metadata, Viewport } from 'next';
import SilkBackdrop from '@/components/SilkBackdrop';
import './globals.css';

const DESCRIPTION =
  '생체신호로 나도 몰랐던 나를 읽어, 관계와 직업의 스트레스를 줄이는 개인 최적화 솔루션. LIFENOLOGY LAB 3기 출품작.';

export const metadata: Metadata = {
  title: 'Life Guardian — 나도 몰랐던 나',
  description: DESCRIPTION,
  applicationName: 'Life Guardian',
  // 제출용 URL이 곧 부스 실행 URL이다. 링크가 메신저에 붙었을 때의 모습도 제출물의 일부다.
  openGraph: {
    title: 'Life Guardian — 당신의 몸은 이미 알고 있습니다',
    description: DESCRIPTION,
    type: 'website',
    locale: 'ko_KR',
    siteName: 'Life Guardian',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Life Guardian — 당신의 몸은 이미 알고 있습니다',
    description: DESCRIPTION,
  },
  robots: {
    // 부스 데모다. 검색엔진에 걸릴 이유가 없고, 세션 영수증 URL이 색인되면 곤란하다.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfcfd',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {/* 모든 화면 뒤에 같은 결이 흐른다. 페이지마다 다르면 한 제품으로 안 읽힌다. */}
        <SilkBackdrop />
        {children}
      </body>
    </html>
  );
}
