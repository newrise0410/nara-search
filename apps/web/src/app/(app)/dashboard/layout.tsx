import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '대시보드', description: '오늘의 신규 공고·낙찰, 관심 키워드 히트, 마감 임박 공고' }

export default function Layout({ children }: { children: ReactNode }) { return children }
