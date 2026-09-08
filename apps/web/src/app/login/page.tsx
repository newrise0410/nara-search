import LoginView from '@/components/LoginView'
import { authErrorMessage, safeNextPath } from '@/lib/auth-routes'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[] }>
}) {
  const params = await searchParams
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
  return <LoginView next={safeNextPath(first(params.next))} errorMessage={authErrorMessage(first(params.error))} />
}
