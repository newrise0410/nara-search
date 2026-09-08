import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '도메인 프로필', description: '내 사업 분야 분류 규칙과 요건 키워드' }

export default function Layout({ children }: { children: ReactNode }) { return children }
