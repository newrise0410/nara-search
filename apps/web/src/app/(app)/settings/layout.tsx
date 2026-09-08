import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '설정', description: '알림 채널, 데이터 소스, 화면, 백업' }

export default function Layout({ children }: { children: ReactNode }) { return children }
