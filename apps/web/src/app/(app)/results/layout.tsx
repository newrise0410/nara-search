import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '결과', description: '검색 결과와 투찰업체·낙찰률' }

export default function Layout({ children }: { children: ReactNode }) { return children }
