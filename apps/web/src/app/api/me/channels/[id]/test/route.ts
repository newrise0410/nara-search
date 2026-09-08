import { buildMessage, loadNotifyEnv, sendToChannel } from 'worker'
import { meAction } from '@/server/me'
import { disableChannel, loadChannelForSend, saveChannelConfig, SendFailedError, TEST_ITEM } from '@/server/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return meAction(async (db, userId) => {
    const channel = await loadChannelForSend(db, userId, id)
    const env = loadNotifyEnv()
    const message = buildMessage({ name: '테스트 알림' }, [TEST_ITEM], { appUrl: env.appUrl })
    const result = await sendToChannel(channel, message, env)
    if (result.config) await saveChannelConfig(db, channel.id, result.config)
    if (result.gone) await disableChannel(db, channel.id)
    if (!result.ok) throw new SendFailedError(result.error ?? '알림 발송에 실패했습니다.')
  })
}
