import { notFound, redirect } from 'next/navigation'
import CompanyProfileView from '@/components/CompanyProfileView'
import { isBizNoParam } from '@/lib/biz-no'
import { getOptionalUser } from '@/server/auth'
import { loadCompanyProfile } from '@/server/companies'
import { getDb } from '@/server/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ bizNo: string }> }) {
  const { bizNo } = await params
  const user = await getOptionalUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/companies/${bizNo}`)}`)
  if (!isBizNoParam(bizNo)) notFound()
  const profile = await loadCompanyProfile(getDb(), bizNo)
  if (!profile) notFound()
  return <CompanyProfileView profile={profile} />
}
