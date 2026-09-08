import { meWrite } from '@/server/me'
import { parseSettingsBody, saveSettings } from '@/server/user-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request): Promise<Response> {
  return meWrite(request, (db, userId, body) => saveSettings(db, userId, parseSettingsBody(body)))
}
