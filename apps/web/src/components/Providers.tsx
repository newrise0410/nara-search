'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useStore } from '@/store'

export default function Providers({ children }: { children: ReactNode }): ReactElement {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } }))
  const density = useStore((s) => s.density)
  useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.dataset.density = density
  }, [density])
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
