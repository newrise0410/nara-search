import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '로그인', description: 'Google 계정으로 로그인 · 가입 시 이메일 주소만 저장합니다' }

export default function Layout({ children }: { children: ReactNode }) { return children }
