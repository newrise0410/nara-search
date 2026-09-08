import { meCreate, meRead } from '@/server/me'
import { createChannel, loadChannels, parseChannelBody, upsertWebPushChannel } from '@/server/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return meRead(loadChannels)
}

export async function POST(request: Request): Promise<Response> {
  return meCreate(request, (db, userId, body) => {
    const parsed = parseChannelBody(body, { forCreate: true })
    return parsed.type === 'webpush' ? upsertWebPushChannel(db, userId, parsed) : createChannel(db, userId, parsed)
  })
}
