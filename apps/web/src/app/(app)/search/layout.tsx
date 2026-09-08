import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '검색', description: '나라장터 낙찰·공고·사전규격·계약 통합검색 — DB 또는 나라장터 실시간' }

export default function Layout({ children }: { children: ReactNode }) { return children }
