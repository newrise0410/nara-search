'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { FormEvent, ReactElement, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import DataFreshness from '@/components/DataFreshness'
import { Icon, type IconName } from '@/components/icons'
import OrgSwitcher from '@/components/OrgSwitcher'
import { useStore } from '@/store'

interface MenuItem { href: string; label: string; icon: IconName }

const MENU_ITEMS: MenuItem[] = [
  { href: '/dashboard', label: '대시보드', icon: 'home' },
  { href: '/search', label: '검색', icon: 'search' },
  { href: '/keywords', label: '관심 키워드', icon: 'list' },
  { href: '/competitors', label: '경쟁사', icon: 'users' },
  { href: '/profiles', label: '도메인 프로필', icon: 'cube' },
  { href: '/settings', label: '설정', icon: 'gear' },
]

const TAB_ITEMS = [
  { href: '/dashboard', label: '홈', icon: 'home' as const },
  { href: '/search', label: '검색', icon: 'search' as const },
  { href: '/keywords', label: '키워드', icon: 'list' as const },
  { href: '/settings', label: '더보기', icon: 'more' as const },
]

function isActive(pathname: string | null, href: string): boolean {
  if (href === '/search') return pathname === '/search' || pathname === '/results'
  if (href === '/settings') return pathname === '/settings'
  if (href === '/competitors') return pathname === '/competitors' || (pathname?.startsWith('/companies/') ?? false)
  return pathname === href
}

function pageTitle(pathname: string | null): string {
  if (pathname === '/results') return '결과'
  return MENU_ITEMS.find((item) => isActive(pathname, item.href))?.label ?? 'NARA SEARCH'
}

export default function AppShell({ userEmail, children }: { userEmail: string | null; children: ReactNode }): ReactElement {
  const pathname = usePathname()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = keyword.trim()
    if (!value) return
    useStore.getState().setQuery({ keyword: value })
    useStore.getState().pushRecent(value)
    router.push('/results')
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark"><Icon name="search" size={14} /></span><span>NARA SEARCH</span></div>
        <nav aria-label="주요 메뉴">
          {MENU_ITEMS.map((item) => {
            const active = isActive(pathname, item.href)
            return <Link key={item.href} href={item.href} className={`sidebar-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}><Icon name={item.icon} size={18} className="icon" /><span>{item.label}</span></Link>
          })}
        </nav>
        <div className="spacer" />
        <DataFreshness />
        {userEmail ? <OrgSwitcher /> : null}
        {userEmail
          ? <form className="sidebar-user" action="/auth/signout" method="post"><span className="avatar"><Icon name="users" size={16} /></span><span className="user-copy"><span className="user-title" title={userEmail}>{userEmail}</span><span className="user-sub">이메일만 저장됩니다</span></span><button type="submit" className="btn-link signout">로그아웃</button></form>
          : <Link href="/login" className="sidebar-user"><span className="avatar"><Icon name="gear" size={16} /></span><span className="user-copy"><span className="user-title">로그인</span><span className="user-sub">설정은 이 브라우저에 저장됩니다</span></span></Link>}
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <form className="topbar-search" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={16} />
            <input ref={inputRef} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="사업명, 공고번호, 기관명" aria-label="빠른 검색" />
            <kbd className="kbd">⌘K</kbd>
          </form>
          <span className="topbar-title">{pageTitle(pathname)}</span>
          <div id="topbar-actions" className="topbar-actions" />
        </header>
        <main id="main" className="content">{children}</main>
      </div>
      <nav className="tabbar" aria-label="하단 탭">
        {TAB_ITEMS.map((item) => {
          const active = isActive(pathname, item.href) || (item.href === '/settings' && (pathname === '/profiles' || pathname === '/competitors' || pathname?.startsWith('/companies/')))
          return <Link key={item.href} href={item.href} className={`tabbar-item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}><Icon name={item.icon} size={22} className="icon" /><span>{item.label}</span></Link>
        })}
      </nav>
    </div>
  )
}
