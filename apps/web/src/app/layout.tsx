import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import Providers from '@/components/Providers'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
const DESCRIPTION = '나라장터 입찰공고·낙찰·사전규격·계약을 매일 수집해 내 분야 기준으로 분류하고, 투찰업체와 낙찰률까지 보여주는 공공조달 검색 서비스'

/** 링크 미리보기(Slack·카카오톡·Notion 등)용 Open Graph·Twitter 카드. 페이지별 제목은 하위 layout에서 template로 채운다. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'NARA SEARCH', template: '%s · NARA SEARCH' },
  description: DESCRIPTION,
  applicationName: 'NARA SEARCH',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website', siteName: 'NARA SEARCH', locale: 'ko_KR', url: '/',
    title: 'NARA SEARCH — 나라장터 공고·낙찰·계약을 내 분야 기준으로',
    description: DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'NARA SEARCH — 나라장터 공고·낙찰·계약을 내 분야 기준으로 검색합니다' }],
  },
  twitter: { card: 'summary_large_image', title: 'NARA SEARCH', description: DESCRIPTION, images: ['/og.png'] },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Hahmlet:wght@500;600&display=swap" />
      </head>
      <body>
        <a className="skip-link" href="#main">본문으로 건너뛰기</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
