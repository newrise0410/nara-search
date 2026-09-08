import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '경쟁사', description: '투찰 참여·낙찰·계약 실적 집계' }

export default function Layout({ children }: { children: ReactNode }) { return children }
