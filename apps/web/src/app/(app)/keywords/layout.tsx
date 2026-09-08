import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '관심 키워드', description: '키워드 점검과 알림 규칙' }

export default function Layout({ children }: { children: ReactNode }) { return children }
