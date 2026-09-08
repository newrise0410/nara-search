import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '업체 프로파일', description: '낙찰 이력·주요 발주기관·상위권 동반 노출' }

export default function Layout({ children }: { children: ReactNode }) { return children }
