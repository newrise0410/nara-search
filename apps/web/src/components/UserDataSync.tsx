'use client'

import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  changedSlices,
  createDefaultProfile,
  planInitialSync,
  type UserSnapshot,
} from '@/lib/user-state'
import { fetchUserState, pushSlice, SYNC_DEBOUNCE_MS, uploadAll } from '@/lib/user-sync'
import { snapshotOf, useStore } from '@/store'

interface NoticeState { message: string; isError: boolean }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function UserDataSync({ signedIn }: { signedIn: boolean }): ReactElement | null {
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const baseline = useRef<UserSnapshot | null>(null)
  /** 최초 전량 업로드가 실패해 아직 서버에 반영되지 않은 상태 — 다음 flush에서 재시도한다 */
  const pendingUpload = useRef(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    let hydrationUnsubscribe: (() => void) | undefined
    let syncTimer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    baseline.current = null

    const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
    const showNotice = (message: string, isError: boolean) => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      setNotice({ message, isError })
      if (!isError) {
        noticeTimer.current = setTimeout(() => {
          noticeTimer.current = undefined
          setNotice(null)
        }, 6_000)
      } else {
        noticeTimer.current = undefined
      }
    }
    const clearNotice = () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      noticeTimer.current = undefined
      setNotice(null)
    }
    const showError = (error: unknown) => showNotice(`설정을 서버에 저장하지 못했습니다: ${messageOf(error)}`, true)
    const waitForHydration = async () => {
      if (useStore.persist.hasHydrated()) return
      await new Promise<void>((resolve) => {
        let off: () => void = () => {}
        off = useStore.persist.onFinishHydration(() => {
          off()
          hydrationUnsubscribe = undefined
          resolve()
        })
        hydrationUnsubscribe = off
      })
    }
    const flush = async () => {
      if (cancelled || !baseline.current) return
      if (isOffline()) {
        showNotice('오프라인입니다. 변경 내용은 이 브라우저에만 저장했습니다.', false)
        return
      }
      const from = baseline.current
      const to = snapshotOf(useStore.getState())
      const slices = changedSlices(from, to)
      if (!pendingUpload.current && slices.length === 0) return
      try {
        if (pendingUpload.current) {
          await uploadAll(to)
          if (cancelled) return
          pendingUpload.current = false
        } else {
          for (const slice of slices) await pushSlice(slice, from, to)
          if (cancelled) return
        }
        baseline.current = to
        clearNotice()
      } catch (error) {
        if (!cancelled) showError(error)
      }
    }
    const schedule = () => {
      if (cancelled || !baseline.current) return
      if (isOffline()) {
        showNotice('오프라인입니다. 변경 내용은 이 브라우저에만 저장했습니다.', false)
        return
      }
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        syncTimer = undefined
        void flush()
      }, SYNC_DEBOUNCE_MS)
    }
    const subscribe = () => {
      unsubscribe = useStore.subscribe((state) => {
        if (!baseline.current) return
        if (!pendingUpload.current && changedSlices(baseline.current, snapshotOf(state)).length === 0) return
        schedule()
      })
    }
    const initialize = async () => {
      await waitForHydration()
      if (cancelled) return
      const local = snapshotOf(useStore.getState())
      if (isOffline()) {
        baseline.current = local
        subscribe()
        showNotice('오프라인입니다. 변경 내용은 이 브라우저에만 저장했습니다.', false)
        return
      }
      controller = new AbortController()
      try {
        const server = await fetchUserState(controller.signal)
        if (cancelled) return
        const plan = planInitialSync(server, local, createDefaultProfile)
        useStore.getState().applyServerState(plan.next)
        baseline.current = snapshotOf(useStore.getState())
        if (plan.upload) {
          pendingUpload.current = true
          try {
            await uploadAll(baseline.current)
            if (cancelled) return
            pendingUpload.current = false
          } catch (error) {
            if (cancelled) return
            showError(error)
          }
        }
        if (cancelled) return
        if (plan.migrated && !pendingUpload.current) showNotice('기존 브라우저 데이터를 이 계정으로 옮겼습니다.', false)
      } catch (error) {
        if (cancelled) return
        baseline.current = null
        pendingUpload.current = false
        showError(error)
        return
      }
      if (!cancelled) subscribe()
      if (!cancelled && pendingUpload.current) schedule()
    }

    void initialize()
    return () => {
      cancelled = true
      if (syncTimer) clearTimeout(syncTimer)
      hydrationUnsubscribe?.()
      unsubscribe?.()
      controller?.abort()
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      noticeTimer.current = undefined
      baseline.current = null
      pendingUpload.current = false
    }
  }, [signedIn])

  if (!signedIn || !notice) return null
  return <div className={`sync-toast${notice.isError ? ' is-error' : ''}`} role="status">{notice.message}</div>
}
